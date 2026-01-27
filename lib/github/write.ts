import { getConfig, getOctokit } from './config';

/**
 * Save a file to the GitHub repository with retry logic for SHA conflicts
 */
export async function saveToGitHub(
  filePath: string,
  content: string,
  maxRetries = 3
): Promise<void> {
  const config = getConfig();
  const octokit = getOctokit();
  if (!config || !octokit) {
    console.log(`[dev] GitHub not configured, skipping save for: ${filePath}`);
    return;
  }

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    let sha: string | undefined;

    try {
      const existingFile = await octokit.repos.getContent({
        owner: config.owner,
        repo: config.repo,
        path: filePath,
        ref: config.branch,
      });

      if ('sha' in existingFile.data) {
        sha = existingFile.data.sha;
      }
    } catch (error: unknown) {
      if (!(error && typeof error === 'object' && 'status' in error && error.status === 404)) {
        throw error;
      }
    }

    try {
      await octokit.repos.createOrUpdateFileContents({
        owner: config.owner,
        repo: config.repo,
        path: filePath,
        message: `docs: add ${filePath}`,
        content: Buffer.from(content).toString('base64'),
        branch: config.branch,
        sha,
      });
      return;
    } catch (error: unknown) {
      const isConflict = error && typeof error === 'object' && 'status' in error && error.status === 409;
      const isShaError = error instanceof Error && error.message.includes('expected');

      if ((isConflict || isShaError) && attempt < maxRetries - 1) {
        console.log(`SHA conflict for ${filePath}, retrying (attempt ${attempt + 2}/${maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, 100 * (attempt + 1)));
        continue;
      }
      throw error;
    }
  }
}
