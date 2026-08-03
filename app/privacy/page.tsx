import type { Metadata } from "next";
import { Footer } from "@/components/Footer";

export const metadata: Metadata = {
  title: "Privacy Policy - HoudiniMD",
  description:
    "What HoudiniMD collects, what it does not collect, how long data is kept, and who it is shared with.",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <main className="flex-1 max-w-4xl mx-auto w-full px-page-x py-10">
        <article className="prose prose-neutral dark:prose-invert max-w-none prose-h2:text-lg prose-h2:mt-8">
          {/* The same heading treatment a doc page gets (markdownComponents.h1),
              so this page reads as part of the site and not as a second design. */}
          <h1 className="not-prose text-2xl font-bold tracking-tight border-b border-border pb-3 mb-6 mt-0">
            Privacy Policy
          </h1>
          <p className="text-muted-foreground">Last updated: August 2026.</p>

          <p>
            HoudiniMD is an independent, unofficial mirror of SideFX&apos;s Houdini documentation. It is run
            by one person, John C. This page tells you what data HoudiniMD collects, why, and what it does
            not collect.
          </p>

          <h2>What we collect, and why</h2>
          <p>We keep server logs to run the site and to see which pages are useful. Each page view records:</p>
          <ul>
            <li>The page path you viewed, and whether the request succeeded.</li>
            <li>
              A short code (a hash) made from your IP address and browser type, and a second short code made
              from your IP address alone. Both are mixed with a secret key that only we hold, so the code
              cannot be turned back into your IP address. These codes let us count unique visits and drop
              our own test traffic. Your IP address itself is never written down.
            </li>
            <li>Whether the visitor looks like a person, a search-engine crawler, or an AI agent.</li>
            <li>Your country and city. Cloudflare, our host, provides this from your connection.</li>
            <li>Which browser referring page sent you here (the site only, never the page path).</li>
          </ul>
          <p>
            If you use search, we also record the text you typed, where you searched from, the page it took
            you to, and how many results came back. We only record a search after you submit it. We never
            record what you type as you type it.
          </p>
          <p>
            This data helps us fix broken pages, see which docs need work, and understand real usage. It is
            the same kind of basic traffic log most web servers keep. Under the GDPR, our lawful basis is
            legitimate interest: we need basic traffic figures to keep the site working and useful.
          </p>

          <h2>What we do not collect</h2>
          <ul>
            <li>No cookies.</li>
            <li>No accounts, no sign-in, no passwords.</li>
            <li>No third-party analytics or advertising scripts.</li>
            <li>No cross-site tracking.</li>
            <li>We never store your IP address, in any readable form.</li>
          </ul>

          <h2>What we store on your device</h2>
          <p>
            HoudiniMD stores two small things in your browser, on your device only. Neither is sent to us:
          </p>
          <ul>
            <li>
              <strong>Search history for ranking.</strong> When you open a search result, your browser
              remembers the search term and the page you picked, using{" "}
              <code>localStorage</code>. This makes your next search better. It never leaves your browser.
            </li>
            <li>
              <strong>An offline page cache.</strong> Your browser caches recently viewed doc pages using a
              service worker, so repeat visits load faster. This is a copy of the page content, not personal
              data.
            </li>
          </ul>
          <p>You can clear both at any time by clearing your browser&apos;s site data for HoudiniMD.</p>

          <h2>How long we keep it</h2>
          <p>We keep server logs for 90 days. After that, they are deleted automatically.</p>

          <h2>Who we share it with</h2>
          <p>
            Nobody. We do not sell or share this data with any third party, and we run no advertising. Our
            host is Cloudflare, which stores and serves the site and its logs on our behalf.
          </p>

          <h2>Your rights</h2>
          <p>
            You can ask us what data we hold linked to you, and ask us to delete it. In practice, our logs
            only hold hashed codes and page paths, not your name or email, so we may not be able to find a
            specific record. Contact us with any request or question.
          </p>

          <h2>Contact</h2>
          <p>
            HoudiniMD is built by John C.{" "}
            <a href="mailto:hi@jchd.me?subject=HoudiniMD Privacy">hi@jchd.me</a>
          </p>
        </article>
      </main>
      <Footer />
    </div>
  );
}
