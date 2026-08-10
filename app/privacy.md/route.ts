import privacyPolicyMarkdown from "@/content/privacy.md" with { type: "text" };

export function GET() {
  return new Response(privacyPolicyMarkdown, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=2592000",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
