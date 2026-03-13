import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

export const viewport: Viewport = {
  maximumScale: 1,
};

export const metadata: Metadata = {
  title: "VexLLM - Houdini Documentation for AI",
  description:
    "LLM-optimized documentation for SideFX Houdini. VEX functions, Python API, nodes, and more in clean markdown following the llms.txt standard.",
  keywords: ["Houdini", "VEX", "SideFX", "documentation", "LLM", "AI", "llms.txt", "Python API", "HOM"],
  authors: [{ name: "VexLLM" }],
  icons: {
    icon: "/favicon.ico",
  },
  openGraph: {
    title: "VexLLM - Houdini Documentation for AI",
    description: "LLM-optimized documentation for SideFX Houdini following the llms.txt standard.",
    url: process.env.ROOT_URL,
    siteName: "VexLLM",
    type: "website",
  },
};

const geist = Geist({
  subsets: ["latin"],
});

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
        <link rel="alternate" type="text/plain" href="/llms.txt" title="API guide for AI agents" />
      </head>
      <body>{children}</body>
    </html>
  );
}
