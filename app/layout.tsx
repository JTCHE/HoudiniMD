import { SITE_URL } from "@/lib/site";
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
    "LLM-optimized documentation for SideFX Houdini. VEX functions, Python API, nodes, and more in clean markdown following the llms.txt standard.",
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: websiteInfo.title,
  description: websiteInfo.description,
  keywords: ["Houdini", "VEX", "SideFX", "documentation", "LLM", "AI", "llms.txt", "Python API", "HOM"],
  authors: [{ name: "HoudiniMD" }],
  // Icons come from the app/ file conventions (favicon.ico, icon.svg, apple-icon.png).
  // Next.js emits the <link> tags itself — declaring them here too would duplicate them.
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
            a repeat if the asset is missing for some other reason. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "addEventListener('error',function(e){var t=e.target,u=t&&(t.src||t.href);" +
              "if(typeof u=='string'&&u.indexOf('/_next/static/')>-1&&!sessionStorage.getItem('hmd-heal')){" +
              "sessionStorage.setItem('hmd-heal','1');location.reload()}},true)",
          }}
        />
      </head>
      <body>
        <ServiceWorkerRegistration />
        <ToastListener />
        {children}
      </body>
    </html>
  );
}
