# CLAUDE.md - VexLLM: Houdini Documentation for LLMs

## Project Overview

**VexLLM** is a service that converts SideFX Houdini documentation into LLM-friendly markdown following the llms.txt standard. It enables AI assistants like Claude to provide accurate, contextual answers about Houdini's VEX, Python API, and other technical documentation.

**Domain:** vexllm.dev
**Tech Stack:** Next.js 14+, TypeScript, Playwright, Netlify  
**Repository Strategy:** On-demand markdown generation with Git-backed persistent cache

You can update your progress inside the '## Steps for Implementation' section. Do it often to keep track of your progress.

---

## Architecture Decisions

### 1. On-Demand Generation with Git Cache

**Decision:** Generate markdown files on-demand when first requested, store in Git repository as persistent cache.

**Rationale:**

- Houdini docs are massive (~2000+ pages across VEX, Python, nodes, HScript, expressions)
- Pre-generating everything would take hours and is unnecessary
- Most users will only access 5-10% of total documentation
- Git provides free, persistent storage that survives Netlify rebuilds
- User requests /docs/houdini/vex/functions/foreach
- Netlify serverless function checks if file exists in GitHub
- If not, scrapes → generates → pushes to GitHub via REST API (Octokit Client)
- Gradual population = faster initial deployment, storage grows organically

**Flow:**

```
Request → Check local filesystem (from last build)
           ↓ miss
       → Check GitHub raw URL (newly committed files)
           ↓ miss
       → Generate + Commit to GitHub via API
           ↓
       → Serve generated content immediately
           ↓
       → Next Netlify build picks up file
           ↓
       → Future requests served from Netlify CDN (fastest)
```

**Implementation Notes:**

- GitHub API token in environment variable: `GITHUB_TOKEN`
- Lock mechanism prevents duplicate generation from concurrent requests
- Failed generations log error but don't cache, retry on next request
- Netlify build includes all existing `/content` files as static assets

**Recommended GitHub implementation**

```typescript
export async function GET(request: NextRequest, { params }) {
  const slug = params.slug.join("/");

  // Try to load from local filesystem (built files)
  const localPath = path.join(process.cwd(), "content", `${slug}.md`);
  if (fs.existsSync(localPath)) {
    return new Response(await fs.promises.readFile(localPath, "utf-8"), {
      headers: { "Content-Type": "text/markdown" },
    });
  }

  // Try to fetch from GitHub directly
  const githubUrl = `https://raw.githubusercontent.com/username/vexllm/main/content/${slug}.md`;
  const githubResponse = await fetch(githubUrl);
  if (githubResponse.ok) {
    return new Response(await githubResponse.text(), {
      headers: { "Content-Type": "text/markdown" },
    });
  }

  // Generate new page
  const markdown = await generateMarkdown(slug);

  // Save to GitHub
  await saveToGitHub(`${slug}.md`, markdown);

  // Return immediately
  return new Response(markdown, {
    headers: { "Content-Type": "text/markdown" },
  });
}
```

### 2. URL Handling & Redirection

**Requirement:** Support `.html` URLs from original SideFX docs and clean URLs, always serve markdown.

**URL Mappings:**

```
Input URL                                               → Resolved Path
──────────────────────────────────────────────────────────────────────────
vexllm.dev/docs/houdini/vex/functions/foreach          → /content/houdini/vex/functions/foreach.md
vexllm.dev/docs/houdini/vex/functions/foreach/         → /content/houdini/vex/functions/foreach.md
vexllm.dev/docs/houdini/vex/functions/foreach.html     → /content/houdini/vex/functions/foreach.md
vexllm.dev/docs/houdini/vex/functions/foreach.html.md  → /content/houdini/vex/functions/foreach.md (llms.txt standard)
```

**Response Headers:**

```http
Content-Type: text/markdown; charset=utf-8
Cache-Control: public, max-age=31536000, immutable
X-Source-URL: https://sidefx.com/docs/houdini/vex/functions/foreach.html
X-Generated-At: 2025-01-27T10:30:00Z
```

**Implementation:**

- Next.js middleware strips `.html` and `.html.md` extensions
- Normalizes trailing slashes
- Dynamic route `app/docs/[...slug]/route.ts` handles all variations
- All requests return markdown with `text/markdown` content type

---

## Markdown Generation Specification

### Source Material Analysis

**Input:** SideFX Houdini docs HTML page (https://sidefx.com/docs/...)  
**Key Element:** `<main>` contains all essential documentation  
**Extraction Tool:** Playwright (browser automation, handles JS-rendered content)  
**Target Format:** llms.txt-compliant markdown

### HTML Structure (Example: `foreach` function)

```html
<main>
  <header>
    <div id="title">
      <p class="ancestors">
        <a href="../../index.html">Houdini 21.0</a>
        <i class="pathsep fa fa-angle-right"></i>
        <a href="../index.html">VEX</a>
        <i class="pathsep fa fa-angle-right"></i>
        <a href="index.html"><span class="supertitle">VEX</span> Functions</a>
        <i class="pathsep fa fa-angle-right"></i>
      </p>
      <h1 class="title">foreach</h1>
      <p class="summary">Loops over items in array, with optional enumeration.</p>
    </div>
  </header>

  <div id="content">
    <table id="premeta">
      <!-- "On this page" TOC -->
    </table>

    <!-- Main content paragraphs & code examples -->
    <p>The length of the array is determined before the first iteration...</p>

    <section
      class="heading"
      id="simple-form"
    >
      <h2>Simple form</h2>
      <div class="code-container"><pre class="syntax">...</pre></div>
      <p>Description...</p>
    </section>

    <section
      class="heading"
      id="enumerated-form"
    >
      <h2>Enumerated form</h2>
      <div class="code-container"><pre>...</pre></div>
    </section>

    <table id="postmeta">
      <tr>
        <td class="label">See also</td>
        <td class="content">
          <ul class="relateds">
            <li><a href="../arrays.html">Arrays</a></li>
          </ul>
        </td>
      </tr>
    </table>
  </div>
</main>
```

### llms.txt Standard Requirements

Per the llms.txt standard, each markdown file should contain:

1. **H1 title** (required) - Function/topic name
2. **Blockquote summary** (optional but recommended) - Brief description
3. **Metadata section** (custom addition) - Breadcrumb context
4. **Body content** (optional) - Detailed explanations, no restrictions on markdown elements
5. **H2 sections** (optional) - Organized subsections
6. **Related links section** (optional) - Cross-references

**Key principle:** Clean, readable markdown optimized for LLM consumption, preserving all technical detail.

---

## Breadcrumb Metadata Strategy

**Decision:** Include breadcrumb navigation as metadata at the top of each markdown file.

**Rationale:**

- Provides version context (Houdini 21.0 vs 20.5)
- Helps LLMs understand page hierarchy (VEX > Functions > foreach)
- Useful for disambiguation (Python's `Node.destroy()` vs VEX's node functions)
- Minimal overhead, high contextual value
- Not part of llms.txt spec, but doesn't violate it (appears before H1)

**Format:**

```markdown
---
breadcrumbs: Houdini 21.0 > VEX > Functions
source: https://sidefx.com/docs/houdini/vex/functions/foreach.html
---

# foreach

> Loops over the items in an array, with optional enumeration.
```

**Parsing Logic:**

```typescript
// Extract from <p class="ancestors">
const breadcrumbElements = await page.locator(".ancestors a").allTextContents();
// Result: ["Houdini 21.0", "VEX", "Functions"]

const breadcrumbs = breadcrumbElements.join(" > ");
const version = breadcrumbElements[0].match(/\d+\.\d+/)?.[0] || "unknown";
const category = breadcrumbElements.slice(1).join(" ");
```

---

## HTML to Markdown Conversion Mapping

### Extraction with Playwright

**Key Selectors:**

```typescript
const main = await page.locator("main").first();
const title = await main.locator("h1.title").textContent();
const summary = await main.locator("p.summary").textContent();
const breadcrumbs = await main.locator(".ancestors a").allTextContents();
const content = await main.locator("#content");
const sections = await content.locator("section.heading").all();
const seeAlso = await main.locator("#postmeta .relateds a").all();
```

### Conversion Table

Can use [mixmark-io/turndown](https://github.com/mixmark-io/turndown) to Convert HTML into Markdown with JavaScript.

| HTML Element                        | Playwright Selector     | Markdown Output         | Notes                                        |
| ----------------------------------- | ----------------------- | ----------------------- | -------------------------------------------- |
| `<p class="ancestors">`             | `.ancestors a`          | YAML front matter       | Extract version + category                   |
| `<h1 class="title">`                | `h1.title`              | `# {title}`             | Main heading                                 |
| `<p class="summary">`               | `p.summary`             | `> {summary}`           | Blockquote for quick context                 |
| `<section class="heading">`         | `section.heading`       | `## {h2 text}`          | Preserve H2 structure                        |
| `<h2 class="label heading">`        | `section h2`            | `## {text}`             | Clean headerlink artifacts                   |
| `<div class="code-container"><pre>` | `.code-container pre`   | ` ```vex\n{code}\n``` ` | Syntax-highlighted code blocks               |
| `<p>` in content                    | `#content p`            | Standard paragraph      | Preserve inline `<code>`, `<strong>`, `<em>` |
| `<code>` inline                     | `code`                  | `` `code` ``            | Inline code with backticks                   |
| `<strong>`, `<b>`                   | `strong, b`             | `**text**`              | Bold emphasis                                |
| `<em>`, `<i>` (non-icon)            | `em, i` (filter icons)  | `*text*`                | Italic emphasis                              |
| `<ul>`, `<ol>`                      | `ul, ol`                | Markdown lists          | Preserve nesting                             |
| `<table id="premeta">`              | `#premeta`              | _(Omit entirely)_       | Remove TOC table                             |
| `<table id="postmeta">`             | `#postmeta .relateds a` | `## See Also\n- [...]`  | Convert to markdown list                     |
| `<i class="pathsep">`               | `.pathsep`              | _(Omit)_                | Remove icon separators                       |
| `<span class="headerlink">`         | `.headerlink`           | _(Omit)_                | Remove anchor links                          |

### Special Handling

**Code Blocks:**

- Detect language from context (VEX functions → `vex`, Python API → `python`, HScript → `bash`)
- Clean HTML entities: `&lt;` → `<`, `&gt;` → `>`, `&amp;` → `&`
- Preserve indentation and formatting
- Strip syntax highlighting `<span>` tags, keep raw text

**Links:**

- Convert relative links to absolute VexLLM URLs
- `../arrays.html` → `https://vexllm.dev/docs/houdini/vex/arrays`
- External links preserved as-is
- Add protocol if missing: `sidefx.com` → `https://sidefx.com`

**Inline Elements:**

- `<var>` → `*variable*` (italic)
- `‹var›` unicode characters → `*var*`
- HTML entities decoded throughout

---

## Ideal Markdown Output Example

**Source:** https://sidefx.com/docs/houdini/vex/functions/foreach.html

**Generated Markdown:**

````markdown
---
breadcrumbs: Houdini 21.0 > VEX > Functions
source: https://sidefx.com/docs/houdini/vex/functions/foreach.html
---

# foreach

> Loops over the items in an array, with optional enumeration.

The length of the array is determined before the first iteration, so if the array is changed during the foreach this will not be reflected in the number of iterations.

## Simple form

```vex
foreach ([element_type] value; array) {
    // statement
}
```
````

This loops over the members of _array_. For each iteration, it **copies** the current member to _value_ and then executes _statement_. For example:

```vex
int an_array[] = {1, 2}
foreach (int num; an_array) {
    printf("%d", num);
}
```

## Enumerated form

The second form lets you specify an enumeration variable:

```vex
foreach (index; value; array) statement;
foreach (int index; element_type value; array) statement;
```

For each iteration, this form assigns the current _position_ in the array to _index_, **copies** the current member to _value_, and executes _statement_. For example:

```vex
string days[] = { "Mon", "Tue", "Wed", "Thu", "Fri" }
foreach (int i; string name; days) {
    printf("Day number %d is %s", i, name);
}
```

This is similar to the common Python idiom `for i, x in enumerate(xs):`.

## See Also

- [Arrays](https://vexllm.dev/docs/houdini/vex/arrays)

````

---

## Quality Checklist

Generated markdown must:
- [ ] Include YAML front matter with breadcrumbs, source URL
- [ ] Start with H1 title matching function/topic name
- [ ] Include blockquote summary if available in source
- [ ] Preserve all code examples with proper syntax highlighting (```vex, ```python, etc.)
- [ ] Maintain logical H2 section structure from source
- [ ] Convert "See Also" links to markdown format with VexLLM URLs
- [ ] Remove all navigation UI (TOC tables, breadcrumb HTML, header anchor links)
- [ ] Clean HTML entities (`&gt;` → `>`, `&lt;` → `<`, `&amp;` → `&`)
- [ ] Preserve inline code formatting with backticks
- [ ] Keep emphasis (bold/italic) from source HTML
- [ ] Strip empty sections and redundant whitespace
- [ ] Convert relative links to absolute VexLLM URLs
- [ ] No HTML tags in output (pure markdown)

---

## Root llms.txt File

**Location:** `/public/llms.txt`

**Purpose:** Primary entry point for LLMs, provides overview and structure per llms.txt standard.

```markdown
# VexLLM - Houdini Documentation for LLMs

> LLM-optimized documentation for SideFX Houdini, covering VEX functions, Python API, HScript commands, nodes, and expressions. All content converted to clean markdown following the llms.txt standard.

VexLLM provides comprehensive Houdini documentation in a format optimized for AI assistants. Each page from the official SideFX documentation is available as clean markdown at predictable URLs. Documentation is generated on-demand and cached permanently.

## Documentation Structure

The documentation mirrors SideFX's official structure, organized by category:

- **VEX Functions**: Core functions for VEX programming (vector expressions) - geometry manipulation, math, attributes, arrays, strings, noise, transforms, etc.
- **VEX Language**: Syntax, data types, language features, operators, control flow
- **Python API (HOM)**: Houdini Object Model - nodes, geometry, UI, rendering, parameters
- **HScript**: Legacy scripting commands for Houdini's command-line interface
- **Nodes**: Documentation for all node types (SOPs, DOPs, COPs, ROPs, VOPs, etc.)
- **Expressions**: Channel expression functions and syntax

## Usage

Access documentation using the URL structure:
````

https://vexllm.dev/docs/houdini/{category}/{subcategory}/{page}

```

Examples:
- VEX foreach: `https://vexllm.dev/docs/houdini/vex/functions/foreach`
- Python hou.Node: `https://vexllm.dev/docs/houdini/hom/hou/Node`
- Attribute Wrangle SOP: `https://vexllm.dev/docs/houdini/nodes/sop/attribwrangle`

All URLs return markdown with `Content-Type: text/markdown`. HTML extensions (`.html`) are supported and automatically redirected.

## VEX Functions

Popular VEX functions available:

- [foreach](https://vexllm.dev/docs/houdini/vex/functions/foreach): Loop over array items with optional enumeration
- [append](https://vexllm.dev/docs/houdini/vex/functions/append): Add item to end of array
- [fit](https://vexllm.dev/docs/houdini/vex/functions/fit): Remap value from one range to another
- [fit01](https://vexllm.dev/docs/houdini/vex/functions/fit01): Remap 0-1 range to custom range
- [chramp](https://vexllm.dev/docs/houdini/vex/functions/chramp): Sample from parameter ramp
- [xyzdist](https://vexllm.dev/docs/houdini/vex/functions/xyzdist): Find closest point on geometry
- [primuv](https://vexllm.dev/docs/houdini/vex/functions/primuv): Sample attribute at UV coordinates
- [cross](https://vexllm.dev/docs/houdini/vex/functions/cross): Cross product of vectors
- [normalize](https://vexllm.dev/docs/houdini/vex/functions/normalize): Normalize vector to unit length
- [setpointattrib](https://vexllm.dev/docs/houdini/vex/functions/setpointattrib): Set point attribute value
- [addpoint](https://vexllm.dev/docs/houdini/vex/functions/addpoint): Create new point in geometry
- [nearpoints](https://vexllm.dev/docs/houdini/vex/functions/nearpoints): Find points within radius
- [noise](https://vexllm.dev/docs/houdini/vex/functions/noise): Generate Perlin noise
- [curlnoise](https://vexllm.dev/docs/houdini/vex/functions/curlnoise): Generate divergence-free curl noise

[Browse all VEX functions](https://vexllm.dev/docs/houdini/vex/functions)

## VEX Language

Core language concepts:

- [Arrays](https://vexllm.dev/docs/houdini/vex/arrays): Array syntax, operations, and manipulation
- [Structs](https://vexllm.dev/docs/houdini/vex/structs): Custom data structures
- [Attributes](https://vexllm.dev/docs/houdini/vex/attributes): Reading and writing geometry attributes
- [Data Types](https://vexllm.dev/docs/houdini/vex/data-types): Float, int, vector, matrix, string types

## Python API (HOM)

Essential Python classes:

- [hou.Node](https://vexllm.dev/docs/houdini/hom/hou/Node): Base class for all nodes
- [hou.Geometry](https://vexllm.dev/docs/houdini/hom/hou/Geometry): Access and manipulate geometry data
- [hou.Vector3](https://vexllm.dev/docs/houdini/hom/hou/Vector3): 3D vector operations
- [hou.Parm](https://vexllm.dev/docs/houdini/hom/hou/Parm): Node parameter access
- [hou.Point](https://vexllm.dev/docs/houdini/hom/hou/Point): Point in geometry

## Nodes

Popular node types:

- [Attribute Wrangle](https://vexllm.dev/docs/houdini/nodes/sop/attribwrangle): Run VEX code over geometry
- [Copy to Points](https://vexllm.dev/docs/houdini/nodes/sop/copytopoints): Instance geometry on points
- [Foreach Loop](https://vexllm.dev/docs/houdini/nodes/sop/foreach): Loop over geometry pieces
- [Solver](https://vexllm.dev/docs/houdini/nodes/sop/solver): Create feedback loops

## Optional

Secondary resources:

- [HScript Commands](https://vexllm.dev/docs/houdini/hscript): Legacy command reference
- [Expression Functions](https://vexllm.dev/docs/houdini/expressions): Channel expression functions
- [Utility Functions](https://vexllm.dev/docs/houdini/vex/utility): Helper and convenience functions
```

---

## Project Structure

```
vexllm/
├── app/
│   ├── layout.tsx                 # Root layout with metadata
│   ├── page.tsx                   # Homepage: search, browse, usage instructions
│   ├── api/
│   │   ├── search/
│   │   │   └── route.ts           # Search endpoint (fuzzy search across titles/summaries), optional for now
│   │   └── generate/
│   │       └── route.ts           # Manual trigger for batch generation (admin)
│   └── docs/
│       └── [...slug]/
│           └── route.ts           # Main route handler: check cache → generate → serve
│
├── lib/
│   ├── scraper.ts                 # Playwright-based SideFX doc scraper
│   ├── markdown-converter.ts      # HTML → Markdown conversion logic
│   ├── markdown-loader.ts         # Load .md from /content directory
│   ├── git-manager.ts             # Git operations
│   ├── url-normalizer.ts          # Strip .html, normalize paths
│   ├── search-index.ts            # Build/query search index (Fuse.js or MiniSearch)
│   └── lock-manager.ts            # Prevent concurrent generation of same page
│
├── content/                       # Generated markdown files (committed to Git)
│   ├── houdini/
│   │   ├── vex/
│   │   │   ├── functions/
│   │   │   │   ├── foreach.md
│   │   │   │   ├── append.md
│   │   │   │   └── ...
│   │   │   ├── arrays.md
│   │   │   └── ...
│   │   ├── hom/
│   │   │   └── hou/
│   │   │       ├── Node.md
│   │   │       └── ...
│   │   └── nodes/
│   │       └── sop/
│   │           └── attribwrangle.md
│   └── index.json                 # Metadata index for search (updated on generation)
│
├── scripts/
│   └── build-search-index.ts      # Rebuild full search index, optional for now
│
├── public/
│   └── llms.txt                   # Root llms.txt file (static)
│
├── middleware.ts                  # URL normalization: strip .html, handle redirects
├── .env.example                   # GITHUB_TOKEN, PLAYWRIGHT_BROWSER_PATH
├── next.config.js                 # Next.js configuration
├── netlify.toml                   # Netlify build & header config
├── package.json
└── README.md
```

---

## Implementation Details

### Phase 1: Core Infrastructure

#### 1.1 Playwright Scraper (`lib/scraper.ts`)

```typescript
import { chromium, Browser, Page } from "playwright";

interface ScrapedContent {
  title: string;
  summary: string;
  breadcrumbs: string[];
  version: string;
  category: string;
  sourceUrl: string;
  mainHtml: string;
}

export async function scrapeSideFXPage(url: string): Promise<ScrapedContent> {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto(url, { waitUntil: "networkidle" });

  // Extract metadata
  const breadcrumbs = await page.locator(".ancestors a").allTextContents();
  const title = (await page.locator("h1.title").textContent()) || "";
  const summary = (await page.locator("p.summary").textContent()) || "";

  // Extract main content
  const mainHtml = await page.locator("main").innerHTML();

  await browser.close();

  const version = breadcrumbs[0]?.match(/\d+\.\d+/)?.[0] || "unknown";
  const category = breadcrumbs.slice(1).join(" ");

  return {
    title: title.trim(),
    summary: summary.trim(),
    breadcrumbs,
    version,
    category,
    sourceUrl: url,
    mainHtml,
  };
}
```

#### 1.2 Markdown Converter (`lib/markdown-converter.ts`)

```typescript
import { parse } from "node-html-parser";
import TurndownService from "turndown";

interface ConversionOptions {
  codeLanguage?: "vex" | "python" | "bash";
  baseUrl?: string;
}

export function convertToMarkdown(
  html: string,
  metadata: Pick<ScrapedContent, "breadcrumbs" | "category" | "version" | "sourceUrl">,
  options: ConversionOptions = {},
): string {
  const root = parse(html);

  // Remove unwanted elements
  root.querySelectorAll(".headerlink, .pathsep, #premeta").forEach((el) => el.remove());

  // Initialize Turndown
  const turndown = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
  });

  // Custom rules
  turndown.addRule("codeBlocks", {
    filter: ["pre"],
    replacement: (content) => {
      const lang = options.codeLanguage || "vex";
      return `\n\`\`\`${lang}\n${content.trim()}\n\`\`\`\n`;
    },
  });

  turndown.addRule("inlineCode", {
    filter: ["code"],
    replacement: (content) => `\`${content}\``,
  });

  // Convert main content
  const contentDiv = root.querySelector("#content");
  if (!contentDiv) throw new Error("No #content div found");

  let markdown = turndown.turndown(contentDiv.innerHTML);

  // Build front matter
  const frontMatter = [
    "---",
    `breadcrumbs: ${metadata.breadcrumbs.join(" > ")}`,
    `source: ${metadata.sourceUrl}`,
    "---",
    "",
  ].join("\n");

  // Process "See Also" section
  const seeAlsoLinks = root.querySelectorAll("#postmeta .relateds a");
  if (seeAlsoLinks.length > 0) {
    markdown += "\n\n## See Also\n\n";
    seeAlsoLinks.forEach((link) => {
      const href = link.getAttribute("href") || "";
      const text = link.textContent || "";
      const absoluteUrl = convertToVexLLMUrl(href, metadata.sourceUrl);
      markdown += `- [${text}](${absoluteUrl})\n`;
    });
  }

  return frontMatter + markdown;
}

function convertToVexLLMUrl(relativeUrl: string, sourceUrl: string): string {
  // Convert relative SideFX URLs to VexLLM URLs
  // ../arrays.html → https://vexllm.dev/docs/houdini/vex/arrays
  // Implementation depends on URL structure
}
```

#### 1.3 Git Manager (`lib/git-manager.ts`)

```typescript
import simpleGit, { SimpleGit } from "simple-git";
import path from "path";

const git: SimpleGit = simpleGit({
  baseDir: process.cwd(),
  binary: "git",
  maxConcurrentProcesses: 1,
});

export async function commitAndPushMarkdown(filePath: string, content: string) {
  const fullPath = path.join(process.cwd(), filePath);

  // Write file
  await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.promises.writeFile(fullPath, content, "utf-8");

  // Git operations
  await git.add(filePath);
  await git.commit(`docs: add ${filePath}`, filePath);

  // Push with retry logic
  try {
    await git.push("origin", "main");
  } catch (error) {
    // Handle conflicts: pull, rebase, push
    await git.pull("origin", "main", { "--rebase": "true" });
    await git.push("origin", "main");
  }
}
```

#### 1.4 Lock Manager (`lib/lock-manager.ts`)

```typescript
// Simple in-memory lock to prevent concurrent generation
const locks = new Map<string, Promise<void>>();

export async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  // Wait if already locked
  while (locks.has(key)) {
    await locks.get(key);
  }

  // Acquire lock
  let releaseLock: () => void;
  const lockPromise = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });
  locks.set(key, lockPromise);

  try {
    return await fn();
  } finally {
    locks.delete(key);
    releaseLock!();
  }
}
```

### Phase 2: Dynamic Route Handler

#### 2.1 Main Route (`app/docs/[...slug]/route.ts`)

```typescript
import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { scrapeSideFXPage } from "@/lib/scraper";
import { convertToMarkdown } from "@/lib/markdown-converter";
import { commitAndPushMarkdown } from "@/lib/git-manager";
import { withLock } from "@/lib/lock-manager";

export async function GET(request: NextRequest, { params }: { params: { slug: string[] } }) {
  const slug = params.slug.join("/");
  const markdownPath = path.join(process.cwd(), "content", `${slug}.md`);

  // Fast path: serve from cache if exists
  if (fs.existsSync(markdownPath)) {
    const markdown = await fs.promises.readFile(markdownPath, "utf-8");
    return new Response(markdown, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  }

  // Slow path: generate and cache
  try {
    const markdown = await withLock(slug, async () => {
      // Double-check after acquiring lock
      if (fs.existsSync(markdownPath)) {
        return fs.promises.readFile(markdownPath, "utf-8");
      }

      // Scrape SideFX
      const sideFXUrl = `https://sidefx.com/docs/houdini/${slug}.html`;
      const scraped = await scrapeSideFXPage(sideFXUrl);

      // Convert to markdown
      const markdown = convertToMarkdown(scraped.mainHtml, scraped, { codeLanguage: detectLanguage(slug) });

      // Save and commit
      await commitAndPushMarkdown(`content/${slug}.md`, markdown);

      return markdown;
    });

    return new Response(markdown, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Generated-At": new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error(`Failed to generate ${slug}:`, error);
    return new Response("Page not found or generation failed", {
      status: 404,
    });
  }
}

function detectLanguage(slug: string): "vex" | "python" | "bash" {
  if (slug.includes("vex/") || slug.includes("nodes/")) return "vex";
  if (slug.includes("hom/") || slug.includes("python/")) return "python";
  if (slug.includes("hscript/")) return "bash";
  return "vex";
}
```

#### 2.2 URL Normalization Middleware (`middleware.ts`)

```typescript
import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();

  // Strip .html or .html.md extensions
  if (url.pathname.endsWith(".html") || url.pathname.endsWith(".html.md")) {
    url.pathname = url.pathname.replace(/\.html\.md$/, "").replace(/\.html$/, "");
    return NextResponse.redirect(url, 301);
  }

  // Normalize trailing slash
  if (url.pathname.endsWith("/") && url.pathname !== "/") {
    url.pathname = url.pathname.slice(0, -1);
    return NextResponse.redirect(url, 301);
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/docs/:path*",
};
```

### Phase 3: Search & Discovery

#### 3.1 Search Endpoint (`app/api/search/route.ts`)

```typescript
import { NextRequest, NextResponse } from "next/server";
import Fuse from "fuse.js";
import searchIndex from "@/content/index.json";

const fuse = new Fuse(searchIndex, {
  keys: ["title", "summary", "category"],
  threshold: 0.3,
});

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q");
  if (!query) {
    return NextResponse.json({ error: "Missing query" }, { status: 400 });
  }

  const results = fuse.search(query).slice(0, 20);

  return NextResponse.json({
    query,
    results: results.map((r) => ({
      title: r.item.title,
      summary: r.item.summary,
      url: `https://vexllm.dev/docs/houdini/${r.item.path}`,
      category: r.item.category,
    })),
  });
}
```

#### 3.2 Search Index Structure (`content/index.json`)

```json
[
  {
    "path": "vex/functions/foreach",
    "title": "foreach",
    "summary": "Loops over the items in an array, with optional enumeration.",
    "category": "VEX Functions",
    "version": "21.0"
  },
  {
    "path": "vex/functions/append",
    "title": "append",
    "summary": "Adds an item to an array.",
    "category": "VEX Functions",
    "version": "21.0"
  }
]
```

**Note:** Index is updated each time a new page is generated. Background job can periodically rebuild full index.

### Phase 4: Homepage

#### 4.1 Homepage (`app/page.tsx`)

```tsx
export default function HomePage() {
  return (
    <main>
      <h1>VexLLM - Houdini Docs for AI</h1>
      <p>LLM-optimized documentation for SideFX Houdini</p>

      <SearchBox />

      <section>
        <h2>Popular Pages</h2>
        <ul>
          <li>
            <a href="/docs/houdini/vex/functions/foreach">foreach</a>
          </li>
          <li>
            <a href="/docs/houdini/vex/functions/append">append</a>
          </li>
          {/* ... */}
        </ul>
      </section>

      <section>
        <h2>For AI Assistants</h2>
        <p>
          Access docs at: <code>https://vexllm.dev/docs/houdini/...</code>
        </p>
        <p>
          Root llms.txt: <code>https://vexllm.dev/llms.txt</code>
        </p>
      </section>
    </main>
  );
}
```

---

## Deployment Configuration

### Netlify Configuration (`netlify.toml`)

```toml
[build]
  command = "npm run build"
  publish = ".next"

[[headers]]
  for = "/docs/*"
  [headers.values]
    Content-Type = "text/markdown; charset=utf-8"
    Cache-Control = "public, max-age=31536000, immutable"
    X-Content-Type-Options = "nosniff"

[[headers]]
  for = "/llms.txt"
  [headers.values]
    Content-Type = "text/markdown; charset=utf-8"
    Cache-Control = "public, max-age=86400"

[build.environment]
  NODE_VERSION = "20"
  PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "0"
```

### Environment Variables

Required in Netlify dashboard:

```bash
GITHUB_TOKEN=ghp_xxxxxxxxxxxxx        # Personal access token with repo write access
GITHUB_REPO=username/vexllm           # Repository name
PLAYWRIGHT_BROWSER_PATH=/usr/bin/chromium  # Netlify's browser path
```

### GitHub Repository Setup

1. Create repository `username/vexllm`
2. Add GitHub token to Netlify environment variables
3. Content directory structure:
   ```
   content/
   ├── .gitkeep
   └── index.json
   ```
4. Initial commit with empty content directory
5. Generated files committed automatically by route handler

---

## Development Workflow

### Local Development

```bash
# Install dependencies
npm install

# Install Playwright browsers
npx playwright install chromium

# Run development server
npm run dev

# Test scraping a single page
npm run test:scrape -- vex/functions/foreach

# Generate popular pages (optional pre-population)
npm run generate:popular
```

### Testing Strategy

1. **Unit tests** for markdown conversion
2. **Integration tests** for scraping pipeline
3. **E2E tests** with Playwright for full flow
4. **Manual testing** with Claude queries

---

## Steps for Implementation

### Phase 1: Core Setup (Day 1)

1. ✅ Initialize Next.js 14 project with TypeScript
2. ✅ Install dependencies: `playwright`, `simple-git`, `turndown`, `fuse.js`
3. ✅ Set up project structure per spec
4. ✅ Create basic homepage and root `/llms.txt`
5. ✅ Implement URL normalization middleware

### Phase 2: Scraper (Day 1-2)

1. ✅ Build Playwright scraper targeting `<main>` element
2. ✅ Extract breadcrumbs, title, summary, content
3. ✅ Test on 5-10 sample VEX function pages
4. ✅ Handle edge cases (missing summaries, varied structures)

### Phase 3: Markdown Converter (Day 2)

1. ✅ Implement HTML → Markdown conversion
2. ✅ Apply conversion rules from specification
3. ✅ Test output against quality checklist
4. ✅ Handle code blocks, links, emphasis correctly

### Phase 4: Route Handler (Day 2-3)

1. ✅ Build dynamic route with cache-first logic
2. ✅ Integrate scraper + converter
3. ✅ Implement Git commit/push for generated files
4. ✅ Add lock mechanism for concurrent requests
5. ✅ Test with real SideFX URLs

### Phase 5: Search & Polish (Day 3)

1. ✅ Build search endpoint with Fuse.js
2. ✅ Create search index structure
3. ✅ Add search UI to homepage
4. ✅ Write documentation and README

### Phase 6: Deployment (Day 3)

1. ✅ Configure Netlify with environment variables
2. ✅ Test deployment with sample pages
3. ✅ Verify Git commits work in production
4. ✅ Test with Claude queries

**Estimated Total Effort:** 3-4 days development + testing

---

## Technical Considerations

### Playwright in Netlify

Netlify functions have 10s timeout by default. For longer scraping:

- Use Netlify background functions (up to 15 minutes)
- Or trigger generation from client-side with loading indicator
- Chromium binary must be included in deployment

### Git Commit Frequency

Committing on every generation is acceptable:

- Small files (~5-20KB each)
- GitHub has no practical limit for automated commits
- Alternative: Batch commits (queue → flush every 10 pages)

### Cache Invalidation

Houdini docs rarely change, but when they do:

- Manual: Delete specific `.md` file, regenerate on next request
- Automated: Check SideFX page `Last-Modified` header, regenerate if newer
- Bulk: Script to delete all cached pages for major version update

### SEO Considerations

- Homepage should have clear description of service
- Each markdown file technically accessible via browser
- Consider serving HTML wrapper for human visitors (check `Accept` header)
- Add `<link rel="canonical">` pointing to SideFX official docs
