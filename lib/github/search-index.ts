import { getConfig, getOctokit } from './config';

export interface SearchIndexEntry {
  path: string;
  title: string;
  summary: string;
  category: string;
  version: string;
}

const INDEX_PATH = 'content/index.json';

/**
 * Update the search index in GitHub
 */
export async function updateSearchIndex(entry: SearchIndexEntry): Promise<void> {
  const config = getConfig();
  const octokit = getOctokit();
  if (!config || !octokit) {
    console.log(`[dev] GitHub not configured, skipping search index update for: ${entry.path}`);
    return;
  }

  let index: SearchIndexEntry[] = [];
  let sha: string | undefined;

  try {
    const response = await octokit.repos.getContent({
      owner: config.owner,
      repo: config.repo,
      path: INDEX_PATH,
      ref: config.branch,
    });

    if ('content' in response.data && response.data.type === 'file') {
      const content = Buffer.from(response.data.content, 'base64').toString('utf-8');
      index = JSON.parse(content);
      sha = response.data.sha;
    }
  } catch (error: unknown) {
    if (!(error && typeof error === 'object' && 'status' in error && error.status === 404)) {
      throw error;
    }
  }

  const existingIndex = index.findIndex((e) => e.path === entry.path);
  if (existingIndex >= 0) {
    index[existingIndex] = entry;
  } else {
    index.push(entry);
  }

  index.sort((a, b) => a.path.localeCompare(b.path));

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await octokit.repos.createOrUpdateFileContents({
        owner: config.owner,
        repo: config.repo,
        path: INDEX_PATH,
        message: `chore: update search index`,
        content: Buffer.from(JSON.stringify(index, null, 2)).toString('base64'),
        branch: config.branch,
        sha,
      });
      return;
    } catch (error: unknown) {
      const isConflict = error && typeof error === 'object' && 'status' in error && error.status === 409;
      const isShaError = error instanceof Error && error.message.includes('expected');

      if ((isConflict || isShaError) && attempt < 2) {
        console.log(`Index conflict, refetching and retrying (attempt ${attempt + 2}/3)...`);
        await new Promise(resolve => setTimeout(resolve, 100 * (attempt + 1)));

        try {
          const response = await octokit.repos.getContent({
            owner: config.owner,
            repo: config.repo,
            path: INDEX_PATH,
            ref: config.branch,
          });

          if ('content' in response.data && response.data.type === 'file') {
            const content = Buffer.from(response.data.content, 'base64').toString('utf-8');
            const freshIndex: SearchIndexEntry[] = JSON.parse(content);
            sha = response.data.sha;

            const existingIdx = freshIndex.findIndex((e) => e.path === entry.path);
            if (existingIdx >= 0) {
              freshIndex[existingIdx] = entry;
            } else {
              freshIndex.push(entry);
            }
            freshIndex.sort((a, b) => a.path.localeCompare(b.path));
            index = freshIndex;
          }
        } catch {
          // If fetch fails, just retry with original
        }
        continue;
      }
      throw error;
    }
  }
}
