import { fetchIcon, iconResponse, validIconPath } from "@/lib/icon-cache";

export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const path = (await params).path.join("/");
  if (!validIconPath(path)) return new Response("Not found", { status: 404 });

  try {
    return iconResponse(await fetchIcon(path));
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
