import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

export const metadata: Metadata = {
  title: "VexLLM - Houdini Documentation for AI",
  description:
    "LLM-optimized documentation for SideFX Houdini. VEX functions, Python API, nodes, and more in clean markdown following the llms.txt standard.",
  keywords: ["Houdini", "VEX", "SideFX", "documentation", "LLM", "AI", "llms.txt", "Python API", "HOM"],
  authors: [{ name: "VexLLM" }],
  openGraph: {
    title: "VexLLM - Houdini Documentation for AI",
    description: "LLM-optimized documentation for SideFX Houdini following the llms.txt standard.",
    url: "https://vexllm.netlify.app",
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
      <body className="overflow-hidden">{children}</body>
    </html>
  );
}
