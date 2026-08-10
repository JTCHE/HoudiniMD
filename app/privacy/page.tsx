import type { Metadata } from "next";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Footer } from "@/components/Footer";
import privacyPolicyMarkdown from "@/content/privacy.md" with { type: "text" };
import { parseFrontmatter } from "@/lib/markdown/frontmatter";

const { content, data } = parseFrontmatter(privacyPolicyMarkdown);

export const metadata: Metadata = {
  title: data.title,
  description: data.description,
  alternates: {
    canonical: "/privacy",
    types: { "text/markdown": "/privacy.md" },
  },
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <main className="flex-1 max-w-page mx-auto w-full px-page-x py-10">
        <article className="prose prose-neutral dark:prose-invert max-w-none prose-h2:text-lg prose-h2:mt-8">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              h1: ({ children }) => (
                <h1 className="not-prose text-2xl font-bold tracking-tight border-b border-border pb-3 mb-6 mt-0">
                  {children}
                </h1>
              ),
            }}
          >
            {content}
          </ReactMarkdown>
        </article>
      </main>
      <Footer />
    </div>
  );
}
