export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    { version: 1 },
    { headers: { "Cache-Control": "no-store" } },
  );
}
