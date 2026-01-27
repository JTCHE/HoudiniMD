"use client";

import { useState, useEffect, useRef, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isValidDocUrl, extractSlugFromUrl } from "@/lib/url-validation";

export default function Home() {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  function handleInputChange(value: string) {
    setUrl(value);
    if (error) {
      setError("");
    }
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    navigateToDoc(url);
  }

  async function navigateToDoc(input: string) {
    if (!isValidDocUrl(input)) {
      setError("Please enter a valid SideFX or VexLLM documentation URL");
      return;
    }

    const slug = extractSlugFromUrl(input);
    if (!slug) {
      setError("Could not extract path from URL");
      return;
    }

    setError("");
    setIsValidating(true);

    try {
      const response = await fetch(`/api/validate?slug=${encodeURIComponent(slug)}`);
      const data = await response.json();

      if (!data.valid) {
        setError("This documentation page does not exist SideFX's website");
        setIsValidating(false);
        return;
      }

      router.push(`/docs/${slug}`);
    } catch {
      setError("Failed to validate URL. Please try again.");
      setIsValidating(false);
    }
  }

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Global paste handler
  useEffect(() => {
    function handlePaste(e: ClipboardEvent) {
      // Only intercept if not already focused on an input
      if (document.activeElement?.tagName !== "INPUT") {
        const text = e.clipboardData?.getData("text");
        if (text) {
          e.preventDefault();
          setUrl(text);
          if (isValidDocUrl(text)) {
            navigateToDoc(text);
          } else {
            setError("Please enter a valid SideFX or VexLLM documentation URL");
          }
        }
      }
    }

    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, []);

  return (
    <main className="h-screen flex flex-col justify-center px-8 max-w-2xl">
      <h1 className="text-3xl font-bold tracking-tight leading-6">VexLLM</h1>
      <p className="text-muted-foreground mt-2 mb-5">
        Paste a SideFX Houdini documentation URL to convert it to LLM-friendly markdown
      </p>

      {error && (
        <p
          id="url-error"
          className="text-xs text-destructive mb-2"
        >
          {error}
        </p>
      )}
      <form
        onSubmit={handleSubmit}
        className="flex gap-2"
      >
        <Input
          ref={inputRef}
          type="text"
          value={url}
          onChange={(e) => handleInputChange(e.target.value)}
          placeholder="https://sidefx.com/docs/houdini/vex/functions/noise.html"
          className="flex-1 font-mono text-sm"
          disabled={isValidating}
          aria-invalid={!!error}
          aria-describedby={error ? "url-error" : undefined}
        />
        <Button
          type="submit"
          disabled={isValidating || !url.trim()}
          className={isValidating ? "cursor-wait" : "cursor-pointer"}
        >
          {isValidating ? "Validating..." : "Convert"}
        </Button>
      </form>
    </main>
  );
}
