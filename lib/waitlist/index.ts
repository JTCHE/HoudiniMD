import { nowStamp, type TelemetryEnv } from "@/telemetry/types";

/**
 * Deliberately loose. A stricter pattern rejects real addresses (plus tags,
 * new TLDs, quoted locals) and the cost of a bad row is one bounced mail.
 */
const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@.]+\.[^\s@]+$/;

interface Limiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface WaitlistEnv extends TelemetryEnv {
  WAITLIST_LIMITER?: Limiter;
}

const json = (body: unknown, status: number) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

/** One INSERT, and every way the request can fail before it. */
export async function handleWaitlist(request: Request, env: WaitlistEnv): Promise<Response> {
  if (!env.DB) return json({ error: "Unavailable" }, 503);

  let body: { email?: unknown; page?: unknown; website?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Bad request" }, 400);
  }

  // Honeypot. A person never sees this field, so a filled one is a bot. Answer
  // 200 anyway: a bot that learns it failed comes back with the field empty.
  if (typeof body.website === "string" && body.website.length > 0) return json({ ok: true }, 200);

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (email.length > 254 || !LOOKS_LIKE_EMAIL.test(email)) return json({ error: "That address does not look right." }, 400);

  const ip = request.headers.get("cf-connecting-ip") ?? "";
  if (env.WAITLIST_LIMITER && ip) {
    const { success } = await env.WAITLIST_LIMITER.limit({ key: ip });
    if (!success) return json({ error: "Too many tries. Wait a minute." }, 429);
  }

  const page = typeof body.page === "string" ? body.page.slice(0, 200) : "";
  try {
    await env.DB.prepare(`INSERT OR IGNORE INTO waitlist (email, ts, page, country) VALUES (?,?,?,?)`)
      .bind(email, nowStamp(), page, request.headers.get("cf-ipcountry") ?? "")
      .run();
  } catch (error) {
    // A missing table (migration not applied yet) or a D1 outage must not throw
    // out of the Worker: an uncaught error here is a 500 on a route a bot can
    // call, and every one of those is a billed invocation that also loses the
    // address. Answer 503 and keep the reader's text in the field.
    console.error(`waitlist insert failed: ${error}`);
    return json({ error: "Cannot save that right now. Try again later." }, 503);
  }

  return json({ ok: true }, 200);
}
