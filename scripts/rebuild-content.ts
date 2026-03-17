#!/usr/bin/env bun
/**
 * Rebuild all markdown files by re-scraping from SideFX.
 * Lists existing content from R2 bucket and regenerates each file.
 *
 * Usage:
 *   bun scripts/rebuild-content.ts [options]
 *
 * Options:
 *   --dry-run    Show what would be rebuilt without making changes
 *   --verbose    Show detailed progress
 */

import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { scrapeSideFXPage } from '../lib/scraping';
import { convertToMarkdown, detectLanguage } from '../lib/markdown';
import { toSideFXUrl } from '../lib/url';
import { saveToR2, updateSearchIndex } from '../lib/r2';

interface Options {
  dryRun: boolean;
  verbose: boolean;
}

function parseArgs(): Options {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes('--dry-run'),
    verbose: args.includes('--verbose'),
  };
}

function log(message: string, options: Options, verboseOnly = false) {
  if (verboseOnly && !options.verbose) return;
  console.log(message);
}

function getR2Client(): S3Client | null {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    return null;
  }

  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

async function listContentFiles(): Promise<string[]> {
  const client = getR2Client();
  const bucketName = process.env.R2_BUCKET_NAME;

  if (!client || !bucketName) {
    throw new Error('R2 not configured. Check R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME');
  }

  const files: string[] = [];
  let continuationToken: string | undefined;

  do {
    const response = await client.send(new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: 'content/',
      ContinuationToken: continuationToken,
    }));

    if (response.Contents) {
      for (const object of response.Contents) {
        if (object.Key && object.Key.endsWith('.md') && object.Key !== 'content/index.json') {
          // Remove 'content/' prefix to get relative path
          const relativePath = object.Key.replace(/^content\//, '');
          files.push(relativePath);
        }
      }
    }

    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  return files.sort();
}

function pathToSlug(filePath: string): string {
  // houdini/vex/functions/foreach.md -> houdini/vex/functions/foreach
  return filePath.replace(/\.md$/, '');
}

async function rebuildFile(
  filePath: string,
  options: Options
): Promise<{ success: boolean; error?: string }> {
  const slug = pathToSlug(filePath);
  const sideFXUrl = toSideFXUrl(slug);
  const contentPath = `content/${filePath}`;

  log(`  Scraping: ${sideFXUrl}`, options, true);

  if (options.dryRun) {
    return { success: true };
  }

  try {
    // Scrape the page
    const scraped = await scrapeSideFXPage(sideFXUrl);

    // Convert to markdown
    const codeLanguage = detectLanguage(slug);
    const markdown = convertToMarkdown(scraped, { codeLanguage });

    // Save to R2
    try {
      await saveToR2(contentPath, markdown);
      log(`  Saved to R2: ${contentPath}`, options, true);
    } catch (err) {
      log(`  Warning: Failed to save to R2: ${err}`, options);
    }

    // Update search index
    try {
      await updateSearchIndex({
        path: slug,
        title: scraped.title,
        summary: scraped.summary,
        category: scraped.category,
        version: scraped.version,
      });
    } catch (err) {
      log(`  Warning: Failed to update search index: ${err}`, options);
    }

    return { success: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return { success: false, error: errorMessage };
  }
}

async function main() {
  const options = parseArgs();

  console.log('🔄 HoudiniMD Content Rebuilder\n');

  if (options.dryRun) {
    console.log('Running in dry-run mode (no changes will be made)\n');
  }

  // List all content files from R2
  console.log('Fetching file list from R2...');
  const files = await listContentFiles();

  if (files.length === 0) {
    console.log('No content files found in R2 bucket.');
    return;
  }

  console.log(`Found ${files.length} file(s) to rebuild:\n`);

  let successCount = 0;
  let failCount = 0;
  const failures: { file: string; error: string }[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const progress = `[${i + 1}/${files.length}]`;

    log(`${progress} Rebuilding: ${file}`, options);

    const result = await rebuildFile(file, options);

    if (result.success) {
      successCount++;
      log(`${progress} ✓ ${file}`, options);
    } else {
      failCount++;
      failures.push({ file, error: result.error || 'Unknown error' });
      log(`${progress} ✗ ${file}: ${result.error}`, options);
    }

    // Small delay between requests to be nice to SideFX servers
    if (!options.dryRun && i < files.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  // Summary
  console.log('\n--- Summary ---');
  console.log(`Total: ${files.length}`);
  console.log(`Success: ${successCount}`);
  console.log(`Failed: ${failCount}`);

  if (failures.length > 0) {
    console.log('\nFailed files:');
    for (const { file, error } of failures) {
      console.log(`  - ${file}: ${error}`);
    }
  }

  if (options.dryRun) {
    console.log('\n(Dry run - no changes were made)');
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
