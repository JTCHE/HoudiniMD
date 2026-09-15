import { SITE_URL } from "@/lib/site";
import { NOTICE_HEAD_SCRIPT } from "@/lib/notice";
import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import ServiceWorkerRegistration from "@/components/ServiceWorker";
import { ToastListener } from "@/components/ui/toast-notification";

export const viewport: Viewport = {
  maximumScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "oklch(1 0 0)" },
    { media: "(prefers-color-scheme: dark)", color: "oklch(0.145 0 0)" },
  ],
};

const websiteInfo = {
  title: "HoudiniMD - Houdini Documentation for AI",
  description:
    "A clean Markdown mirror of the Houdini docs. Built for Humans to read, and Agents to understand. VEX functions, Python API, nodes, and more in clean markdown following the llms.txt standard.",
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: websiteInfo.title,
  description: websiteInfo.description,
  keywords: ["Houdini", "VEX", "SideFX", "documentation", "LLM", "AI", "llms.txt", "Python API", "HOM"],
  authors: [{ name: "HoudiniMD" }],
  // Named here, not by the app/ file conventions. A file under app/ is a route,
  // and a route is a Worker invocation that starts Next: /icon.svg, /apple-icon.png
  // and /manifest.webmanifest cost one bootstrap each, on every first visit.
  // The same files in public/ are served by the asset server and never reach
  // the Worker. Measured 12 September 2026 — see lib/edge-cache.ts.
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: "/apple-touch-icon.png",
  },
  manifest: "/manifest.webmanifest",
  openGraph: {
    title: websiteInfo.title,
    description: websiteInfo.description,
    url: SITE_URL,
    siteName: "HoudiniMD",
    type: "website",
    images: ["/cover.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: websiteInfo.title,
    description: websiteInfo.description,
    images: ["/cover.png"],
  },
};

const geist = Geist({
  subsets: ["latin"],
});

const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "HoudiniMD",
  url: SITE_URL,
  potentialAction: {
    "@type": "SearchAction",
    target: `${SITE_URL}/api/search?q={search_term_string}`,
    "query-input": "required name=search_term_string",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={geist.className}
      // The head script below writes `data-notice` here before React hydrates.
      // React compares the attribute it rendered with the one in the document
      // and reports the difference; the difference is the point.
      suppressHydrationWarning
    >
      <head>
        <link
          rel="alternate"
          type="text/plain"
          href="/llms.txt"
          title="API guide for AI agents"
        />
        <Script
          id="website-jsonld"
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
        />
        {/* A deploy renames every chunk, so the last navigation served by the
            outgoing service worker gets HTML that names files which no longer
            exist. Reload that page one time, on the evidence that a chunk
            actually failed, so a healthy load pays nothing. This has to be
            inline and ahead of the chunks: when they 404 React never boots, so
            a listener attached from a component would never run. The flag stops
            a repeat if the asset is missing for some other reason.
            Production only: in dev, Turbopack serves chunks on demand, so a
            transient 404 while a page is still compiling is normal, not a
            stale deploy — reloading on it can loop instead of healing. */}
        {process.env.NODE_ENV === "production" && (
          <script
            dangerouslySetInnerHTML={{
              __html:
                "addEventListener('error',function(e){var t=e.target,u=t&&(t.src||t.href);" +
                "if(typeof u=='string'&&u.indexOf('/_next/static/')>-1&&!sessionStorage.getItem('hmd-heal')){" +
                "sessionStorage.setItem('hmd-heal','1');location.reload()}},true)",
            }}
          />
        )}
        {/* Before the first paint, so a notice this reader closed, or one they
            already signed, never draws and never moves the page under them.
            Inline because a module loads too late to beat the paint. */}
        <script dangerouslySetInnerHTML={{ __html: NOTICE_HEAD_SCRIPT }} />
      </head>
      <body>
        <ServiceWorkerRegistration />
        <ToastListener />
        {children}
      </body>
    </html>
  );
}
