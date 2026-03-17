import DocsSkeleton from "@/components/docs/DocsSkeleton";

// This file is the Suspense fallback for the docs route segment.
// The header never unmounts — it lives in layout.tsx.
// Only the content area needs a skeleton.
export default function Loading() {
  return <DocsSkeleton />;
}
