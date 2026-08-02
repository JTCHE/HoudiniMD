// Shared by worker.ts (writes the analytics data point) and scripts/analytics.ts
// (recomputes the operator's own hash to filter their visits out). Both sides
// must agree, so it lives in one place.
//
// ponytail: unsalted FNV-1a. This groups requests, it does not protect an
// identity — the dataset is readable only with an account API token. Add a
// salt (a Worker secret mirrored into .env.local) if the data ever leaves the
// account.
export function visitorHash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}
