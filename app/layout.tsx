import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import ServiceWorkerRegistration from "@/components/ServiceWorker";
import { ToastListener } from "@/components/ui/toast-notification";

export const viewport: Viewport = {
  maximumScale: 1,
};

const websiteInfo = {
  title: "HoudiniMD - Houdini Documentation for AI",
  description:
    "LLM-optimized documentation for SideFX Houdini. VEX functions, Python API, nodes, and more in clean markdown following the llms.txt standard.",
};

export const metadata: Metadata = {
  metadataBase: new URL(process.env.URL || "https://houdinimd.jchd.me"),
  title: websiteInfo.title,
  description: websiteInfo.description,
  keywords: ["Houdini", "VEX", "SideFX", "documentation", "LLM", "AI", "llms.txt", "Python API", "HOM"],
  authors: [{ name: "HoudiniMD" }],
  icons: {
    icon: "/favicon.ico",
  },
  openGraph: {
    title: websiteInfo.title,
    description: websiteInfo.description,
    url: process.env.URL,
    siteName: "HoudiniMD",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: websiteInfo.title,
    description: websiteInfo.description,
  },
};

const geist = Geist({
  subsets: ["latin"],
});

const SITE_URL = process.env.URL ?? "https://houdinimd.jchd.me";

const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "HoudiniMD",
  url: URL,
  potentialAction: {
    "@type": "SearchAction",
    target: `${URL}/api/search?q={search_term_string}`,
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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
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
