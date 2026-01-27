import { Octokit } from '@octokit/rest';

export interface GitConfig {
  token: string;
  owner: string;
  repo: string;
  branch: string;
}

let cachedConfig: GitConfig | null | undefined;

export function getConfig(): GitConfig | null {
  if (cachedConfig !== undefined) {
    return cachedConfig;
  }

  const token = process.env.GITHUB_TOKEN;
  const repoString = process.env.GITHUB_REPO || '';
  const [owner, repo] = repoString.split('/');

  if (!token || !owner || !repo) {
    cachedConfig = null;
    return null;
  }

  cachedConfig = {
    token,
    owner,
    repo,
    branch: process.env.GITHUB_BRANCH || 'main',
  };

  return cachedConfig;
}

export function getOctokit(): Octokit | null {
  const config = getConfig();
  if (!config) return null;
  return new Octokit({ auth: config.token });
}
