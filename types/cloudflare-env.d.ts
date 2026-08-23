// The installed @cloudflare/workers-types has no RateLimit binding type, and
// OpenNext's CloudflareEnv only declares the bindings it owns. Declare ours.

declare global {
  interface RateLimiter {
    limit(options: { key: string }): Promise<{ success: boolean }>;
  }

  interface CloudflareEnv {
    /** Per-IP limiter for /api/generate. See `ratelimits` in wrangler.jsonc. */
    GENERATE_LIMITER: RateLimiter;
    /** Shared secret for the server-side generation kickoff. */
    GENERATE_KICKOFF_SECRET?: string;
  }
}

export {};
