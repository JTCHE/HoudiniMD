import { getCloudflareContext } from "@opennextjs/cloudflare";
import { handleWaitlist, type WaitlistEnv } from "@/lib/waitlist";

export const dynamic = "force-dynamic";

/**
 * A route handler rather than a Worker-level intercept, so `next dev` serves
 * the same code the deploy runs. `initOpenNextCloudflareForDev` in
 * next.config.ts gives it the real D1 binding locally.
 */
export async function POST(request: Request): Promise<Response> {
  const { env } = await getCloudflareContext({ async: true });
  return handleWaitlist(request, env as unknown as WaitlistEnv);
}
