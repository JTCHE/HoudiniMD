/**
 * `houdinimd.com/download` — one address that always hands over the newest
 * installer.
 *
 * GitHub has no "latest asset matching a pattern" URL, and the bundler writes
 * the version into the file name. Renaming the asset to a fixed name would
 * give a stable link, but it costs the reader the version in their Downloads
 * folder and it makes every release rewrite `latest.json`, which the updater
 * depends on. A redirect is what Mozilla and VS Code do instead, and it
 * touches nothing that already shipped.
 */
const RELEASES = "https://api.github.com/repos/JTCHE/HoudiniMD/releases/latest";
/** Where the reader lands if GitHub cannot be asked. Never a dead link. */
const FALLBACK = "https://github.com/JTCHE/HoudiniMD/releases/latest";

/**
 * The same five minutes the GitHub call is held for, said out loud so the edge
 * cache in worker.ts can hold the redirect too. Without it every reader who
 * asks for the installer starts the Next server, which measured 990 CPU-ms on
 * a cold isolate for an answer that is one line of text.
 */
function redirect(to: string): Response {
  return new Response(null, {
    status: 302,
    headers: { location: to, "cache-control": "public, s-maxage=300" },
  });
}

export async function GET(): Promise<Response> {
  try {
    const response = await fetch(RELEASES, {
      headers: { accept: "application/vnd.github+json", "user-agent": "houdinimd.com" },
      // Unauthenticated GitHub allows 60 calls an hour per address. Five
      // minutes of cache is 12, and a release nobody can download for five
      // minutes after it is published is not a problem worth a token.
      next: { revalidate: 300 },
    });
    if (!response.ok) return redirect(FALLBACK);

    const release = (await response.json()) as {
      assets?: { name?: string; browser_download_url?: string }[];
    };
    const installer = release.assets?.find(
      (asset) => asset.name?.endsWith("-setup.exe") && asset.browser_download_url,
    );
    return redirect(installer?.browser_download_url ?? FALLBACK);
  } catch {
    return redirect(FALLBACK);
  }
}
