// Used by worker.ts (writes the analytics data point) and mirrored into the
// houdinimd-analytics dashboard (recomputes the operator's own hash to filter
// their visits out). Both sides must agree, so a change here must be copied
// there too.
//
// The salt is what makes the word "anonymous" honest. IPv4 is only 4 billion
// inputs, so an unsalted hash of an IP is the IP: anyone holding the dataset
// brute-forces it in seconds. With a secret salt there is no dictionary to
// build, and no side of the system ever stores the address itself.
//
// The salt is a Worker secret (`wrangler secret put VISITOR_SALT`), mirrored
// into .env.local so the CLI can recompute the operator's own hash. Rotating it
// renames every visitor, which is the intended property, not a bug.
//
// ponytail: FNV-1a keyed by prefix, not a real MAC. It resists reversal by
// someone holding only the hashes; it is not built to survive a known-plaintext
// attack on the salt itself. Move to HMAC-SHA256 if the dataset ever ships
// outside the account.
export function visitorHash(input: string, salt: string): string {
  let h = 0x811c9dc5;
  const salted = `${salt}|${input}`;
  for (let i = 0; i < salted.length; i++) {
    h ^= salted.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}
