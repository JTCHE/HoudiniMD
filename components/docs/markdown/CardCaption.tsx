import { getPagePreview } from "@/lib/markdown/page-preview";
import { fetchFromR2 } from "@/lib/r2/read";

export async function CardCaption({ slug }: { slug: string }) {
  const markdown = await fetchFromR2(`content/${slug}.md`);
  const preview = markdown && getPagePreview(markdown);
  return preview ? <p>{preview}</p> : null;
}

export function CardCaptionSkeleton() {
  return <p aria-hidden="true" className="sk h-4 w-4/5 rounded bg-muted" />;
}
