#!/usr/bin/env bun
/**
 * Rebuild all markdown files in the content folder by re-scraping from SideFX.
 *
 * Usage:
 *   bun scripts/rebuild-content.ts [options]
 *
 * Options:
 *   --dry-run    Show what would be rebuilt without making changes
 *   --local      Save files locally only (skip R2)
 *   --verbose    Show detailed progress
 */

import { Glob } from 'bun';
import { writeFile, mkdir } from 'fs/promises';
import { dirname, join } from 'path';
import { scrapeSideFXPage } from '../lib/scraping';
import { convertToMarkdown, detectLanguage } from '../lib/markdown';
import { toSideFXUrl } from '../lib/url';
import { saveToR2, updateSearchIndex } from '../lib/r2';

interface Options {
  dryRun: boolean;
  localOnly: boolean;
  verbose: boolean;
}

function parseArgs(): Options {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes('--dry-run'),
    localOnly: args.includes('--local'),
    verbose: args.includes('--verbose'),
  };
}

function log(message: string, options: Options, verboseOnly = false) {
  if (verboseOnly && !options.verbose) return;
  console.log(message);
}

async function findContentFiles(): Promise<string[]> {
  const contentDir = join(process.cwd(), 'content');
  const glob = new Glob('**/*.md');
  const files: string[] = [];

  for await (const file of glob.scan({ cwd: contentDir })) {
    files.push(file);
  }

  return files.sort();
}

function pathToSlug(filePath: string): string {
  // content/houdini/vex/functions/foreach.md -> houdini/vex/functions/foreach
  return filePath.replace(/\.md$/, '');
}

async function rebuildFile(
  filePath: string,
  options: Options
): Promise<{ success: boolean; error?: string }> {
  const slug = pathToSlug(filePath);
  const sideFXUrl = toSideFXUrl(slug);
  const contentPath = `content/${filePath}`;
  const localPath = join(process.cwd(), contentPath);

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

    // Ensure directory exists
    await mkdir(dirname(localPath), { recursive: true });

    // Save locally
    await writeFile(localPath, markdown, 'utf-8');
    log(`  Saved locally: ${contentPath}`, options, true);

    // Save to R2 (unless --local)
    if (!options.localOnly) {
      try {
        await saveToR2(contentPath, markdown);
        log(`  Pushed to R2: ${contentPath}`, options, true);
      } catch (err) {
        log(`  Warning: Failed to push to R2: ${err}`, options);
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
    }

    return { success: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return { success: false, error: errorMessage };
  }
}

async function main() {
  const options = parseArgs();

  console.log('🔄 VexLLM Content Rebuilder\n');

  if (options.dryRun) {
    console.log('Running in dry-run mode (no changes will be made)\n');
  }
  if (options.localOnly) {
    console.log('Running in local-only mode (skipping R2)\n');
  }

  // Find all content files
  const files = await findContentFiles();

  if (files.length === 0) {
    console.log('No content files found in content/ directory.');
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
