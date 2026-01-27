import { getConfig, getOctokit } from './config';

/**
 * Check if a file exists in the GitHub repository
 */
export async function fileExistsInGitHub(filePath: string): Promise<boolean> {
  const config = getConfig();
  const octokit = getOctokit();
  if (!config || !octokit) return false;

  try {
    await octokit.repos.getContent({
      owner: config.owner,
      repo: config.repo,
      path: filePath,
      ref: config.branch,
    });
    return true;
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'status' in error && error.status === 404) {
      return false;
    }
    throw error;
  }
}

/**
 * Fetch file content from GitHub
 */
export async function fetchFromGitHub(filePath: string): Promise<string | null> {
  const config = getConfig();
  const octokit = getOctokit();
  if (!config || !octokit) return null;

  try {
    const response = await octokit.repos.getContent({
      owner: config.owner,
      repo: config.repo,
      path: filePath,
      ref: config.branch,
    });

    const data = response.data;
    if ('content' in data && data.type === 'file') {
      return Buffer.from(data.content, 'base64').toString('utf-8');
    }
    return null;
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'status' in error && error.status === 404) {
      return null;
    }
    throw error;
  }
}
