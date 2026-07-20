/**
 * Coarse stage markers for `wrangler tail`. Workers Free freezes Date.now()
 * during synchronous execution (Spectre mitigation) so this can't measure
 * true CPU cost — but the *last stage logged before a request goes silent*
 * (killed by the CPU-limit trap) tells you which stage it died in, which is
 * all we actually need to find the bottleneck.
 */
export function stageLogger(route: string, tag: string) {
  const t0 = Date.now();
  return (stage: string) => console.log(`[perf] ${route} "${tag}" ${stage} +${Date.now() - t0}ms`);
}
