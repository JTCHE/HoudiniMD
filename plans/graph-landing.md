# Graph Landing Page — Implementation Plan

Replace the HoudiniMD landing page with a 3D knowledge graph of all ~10.5K doc pages
(Obsidian-style, colored category clusters, DOF blur, slow idle rotation, bottom search
box over a progressive blur). Embeddings are the foundation: they generate the graph's
edges AND power semantic search via Vectorize.

**Decisions already made with the owner — do not re-litigate:**
- Embeddings first (Workers AI `@cf/baai/bge-m3` + Vectorize). Edges come from semantic kNN, plus real markdown links, plus slug hierarchy.
- All ~10.5K nodes on desktop; top ~3K by degree on mobile.
- Colored clusters by category (palette below), near-black background.
- Node click → camera glide + info card (title/summary/category + "Open docs"). Never navigate on first click.
- Idle: slow rotation + every ~8s autofocus a random high-degree node (grows + label shows).
- Full landing replace. Existing search/generate flow (paste URL, resolve, SSE progress) is kept, restyled into the bottom search box.
- Layout is precomputed offline in a script. NO client-side force simulation, ever.

**Existing plumbing you must reuse (do not reinvent):**
- Node list: `GET /api/search-index` → `SearchIndexEntry[]` (`lib/r2/search-index.ts`): `{path, title, summary, category, version}`. ~10,573 entries. `path` is the slug.
- Cached markdown: R2 object `content/{slug}.md`, publicly readable at `${R2_PUBLIC_URL}/content/{slug}.md`. Env vars in `.env` / `lib/r2/config.ts`: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL`.
- Client search: `lib/search/client.ts` (fuse.js, loads `/api/search-index`). Keep as the instant path; semantic search augments it.
- Existing landing logic to preserve: `app/page.tsx` — `processUrl()`, `streamGenerate()` (SSE to `/api/generate`), `/api/resolve`, paste handler, cycling placeholder. Lift this logic into the new search box component; do not change its behavior.
- Deploy: `bun run deploy` (OpenNext → Cloudflare Workers). Static files in `public/` ship as Worker assets. Runtime CPU limit is 10ms — API routes must be I/O-only (fetch calls), never heavy computation.

**Run order:** Phase 1 → 2 → 3 are scripts (each verifiable standalone). Phase 4–5 is the
frontend. Phase 6 is semantic search. Each phase ends with a checkable acceptance test.

---

## Phase 1 — Embedding pipeline (`scripts/build-embeddings.ts`)

New bun script, run locally, incremental and resumable.

1. Fetch `https://houdinimd.jchd.me/api/search-index` → entries (or read R2 `search-index.json` directly via existing `scripts/lib/regen.ts` helpers).
2. For each entry, fetch `${R2_PUBLIC_URL}/content/${path}.md` (concurrency ~20, retry once). Missing markdown → embed `title + summary` only. 
3. Build embedding input per page: `title + "\n" + category + "\n" + summary + "\n" + first ~1500 words of markdown` (strip code fences and link syntax first). bge-m3 handles long input but truncate to ~6000 chars to keep batches fast.
4. Embed via Workers AI REST API, model `@cf/baai/bge-m3` (1024 dims):
   `POST https://api.cloudflare.com/client/v4/accounts/{R2_ACCOUNT_ID}/ai/run/@cf/baai/bge-m3`
   with `Authorization: Bearer $CLOUDFLARE_API_TOKEN`, body `{"text": [batch of ≤100 strings]}`.
   Requires a `CLOUDFLARE_API_TOKEN` with Workers AI permission — add to `.env`, ask the owner if absent.
5. Checkpoint after every batch to `scripts/data/embeddings/{shard}.json` (slug → float array) so reruns skip done work. ~10.5K pages ≈ 110 batches. Budget ~15–30 min wall clock.
6. Upsert all vectors to Vectorize index `houdinimd-pages` (1024 dims, cosine):
   - Create once: `wrangler vectorize create houdinimd-pages --dimensions=1024 --metric=cosine`
   - Upsert via `wrangler vectorize insert houdinimd-pages --file=ndjson` (NDJSON lines `{"id": slug, "values": [...], "metadata": {"title", "category"}}`) — chunk files ≤ 5MB.
   - Add binding to `wrangler.jsonc`: `"vectorize": [{"binding": "VECTORIZE", "index_name": "houdinimd-pages"}]`, then `bun run cf-typegen`.

**Accept:** `scripts/data/embeddings/` holds vectors for ≥95% of entries; `wrangler vectorize query` with any vector returns sane neighbors (e.g. `vex/functions/fit` neighbors include `fit01`, `clamp`, `remap`).

## Phase 2 — Edge + graph build (`scripts/build-graph.ts`)

Reads the embedding shards + cached markdown, emits the node/edge list.

Edge sources, deduped (undirected), with weights used by the layout:
1. **Link edges (w=3):** regex internal links out of each cached markdown (`/docs/houdini/...`, relative `../vex/...`, houdinimd links). Resolve to slugs; keep only pairs where both ends are nodes.
2. **Semantic kNN (w=1):** for each node, top-5 cosine neighbors with similarity ≥ 0.55, computed in-script (brute force over 10.5K×1024 floats in a Float32Array is ~1–2 min in bun; do NOT call Vectorize 10K times).
3. **Hierarchy (w=2):** slug parent (`vex/functions/fit` → `vex/functions`) when the parent is a node.

Expect roughly 40–80K edges total. If > 120K, raise the kNN threshold.

**Output** (loaded by the renderer, so format is a contract):
- `public/graph/graph-meta.json`: `{ version, count, nodes: [{ s: slug, t: title, c: categoryIndex, d: degree }], categories: [names in palette order] }` — array order defines node index everywhere.
- `public/graph/positions.bin`: Float32Array, 3 floats per node, same order (written in Phase 3).
- `public/graph/edges.bin`: Uint32Array, 2 node-indices per edge, sorted by max(w) descending so the renderer can cheaply take "strongest N".

**Accept:** script prints node/edge counts; spot-check that `sop/copytopoints` has an edge to `sop/scatter`.

## Phase 3 — Layout (`scripts/build-layout.ts`, or a flag on build-graph)

- Use `ngraph.graph` + `ngraph.forcelayout` with 3D physics (`dimensions: 3`), edge springs scaled by weight. ~600–1500 iterations until movement stabilizes; log progress every 100.
- Normalize the result: center at origin, scale so the point cloud radius ≈ 1000 units.
- Write `public/graph/positions.bin`.
- Sanity: categories should visibly cluster because kNN edges are intra-category-heavy. If the layout is a hairball, drop kNN k to 4 and raise link-edge weight.

**Accept:** a throwaway plot (write a tiny HTML file scatter-plotting x/y colored by category, open in browser) shows distinct colored clusters, not uniform noise.

Add `"graph:build": "bun scripts/build-embeddings.ts && bun scripts/build-graph.ts && bun scripts/build-layout.ts"` to package.json. The three output files are committed (they're ~1.5MB raw, ~600KB gzipped — acceptable as repo assets; they change only when regenerated deliberately).

## Phase 4 — Renderer (`components/graph/GraphScene.tsx` + small modules)

Dependencies: `three` only (no react-three-fiber, no 3d-force-graph, no postprocessing lib beyond three's examples). Import `OrbitControls` and `EffectComposer`/`RenderPass`/`BokehPass`/`UnrealBloomPass` from `three/addons/`. Client component, `dynamic(() => …, { ssr: false })`, canvas fills the viewport behind the UI.

### Data loading
- Fetch the three `/graph/*` files in parallel on mount; show nodes the frame data arrives (no spinner — fade the whole scene in over ~600ms).

### Nodes
- One `THREE.Points` with a custom `ShaderMaterial`. Per-vertex attributes: position, color (from category palette), size (base 3 + log(degree)·1.5), and a `focus` float (0–1) updated for the focused node only.
- Vertex shader: `gl_PointSize = size * (1.0 + focus * 4.0) * (300.0 / -mvPosition.z)` (size attenuation). Fragment shader: soft circular sprite — radial alpha falloff, additive-ish blending (`NormalBlending`, `transparent`, `depthWrite: false`), slight white core so dots read as glowing.
- Palette (category → hex), background `#0a0a0c`:
  - `Nodes > Geometry nodes` `#e8963c` (orange) · `Nodes > VOP nodes` `#7a9ff2` (blue) · `VEX > VEX Functions` `#f2f2f2` (white) · `Python scripting > hou` `#f27ab8` (pink) · `Nodes > APEX nodes` `#9a6ff2` (violet) · `Expression functions` `#f2d06b` (gold) · `Nodes > Dynamics nodes` `#c94f4f` (red) · `HScript commands` `#5fc9a0` (green) · `Nodes > Copernicus nodes` `#4fd8d8` (teal) · `Nodes > LOP nodes` `#b8e06b` (lime) · `Examples > *` (prefix match) `#8a5a4a` (brown) · everything else `#6b6b73` (grey).
  - Map in graph-meta `categories` order; prefix-match `Examples >`.
- Colors slightly desaturated toward white as nodes get small/far (do it in the fragment shader from `gl_FragCoord`-independent varying of view depth) so the far field reads like the monochrome concept while close nodes show their cluster color.

### Edges
- One `THREE.LineSegments`, `LineBasicMaterial`, additive blending, opacity ~0.07, color `#8a4a42` warm grey-red (Obsidian-ish). Desktop only. Cap at strongest 60K edges (they're pre-sorted).
- Focused node: its incident edges re-rendered in a second small LineSegments at opacity 0.5 in the node's category color.

### Camera & controls
- `PerspectiveCamera` fov 50, start distance ~1600 (whole cloud visible). `OrbitControls`: `enablePan: false`, `enableDamping: true, dampingFactor: 0.05`, `autoRotate: true, autoRotateSpeed: 0.15`, `minDistance: 60`, `maxDistance: 2600`, zoom to cursor (`controls.zoomToCursor = true`).
- Any pointer interaction pauses autoRotate; resume after 6s idle (lerp the speed back up so it doesn't jerk).

### Focus & picking
- Hover: raycast `Points` (set `raycaster.params.Points.threshold` proportional to camera distance) throttled to every other frame; hovered node lerps its `focus` attribute toward 0.6 and shows a floating label.
- Click (distinguish from drag: pointerdown/up within 5px and 300ms): set focused node → tween camera target to it over ~900ms (ease in-out cubic, keep current distance ratio ~0.25 of start), `focus` → 1, show info card.
- Info card (bottom-right, above search bar on mobile): title, category, 2-line summary, "Open docs →" button routing to `/docs/{slug}` (match how `SearchOverlay.tsx` builds doc URLs). Dismiss on background click/Esc. Card styling: existing shadcn card look, `bg-background/60 backdrop-blur-md`.
- Idle autofocus: when idle >8s, every 8s pick a random node from the top-500-by-degree, tween camera toward it (do NOT zoom all the way in — stop at distance ~400), grow it, show its label + faint card-less name, like the `fit01` frame in the concept. Any user input cancels immediately.

### Labels
- HTML overlay (absolutely positioned divs, one pool of ~24 reused elements — never 10K divs). Each frame (throttled to 30Hz): project the N nearest-to-camera nodes with screenspace separation; show `title` under `category` in small type (`text-xs text-white/80`, category `text-white/35`). Opacity ramps with camera distance: fully hidden when camera distance > 900, fully on < 450. Labels never intercept pointer events.

### Postprocessing (desktop only)
- `EffectComposer`: RenderPass → `BokehPass` (focus tracked to the focused/hovered node's depth, else scene center; aperture small — the concept's DOF is strong but keep maxblur ~0.008 so clusters stay legible) → subtle `UnrealBloomPass` (strength 0.35, threshold 0.6) so bright cores glow.
- `prefers-reduced-motion`: no autoRotate, no autofocus tweens (cut, don't glide).

### Mobile / perf (`isMobile = matchMedia('(pointer: coarse)')` or width < 768)
- Slice to first 3000 nodes by degree (graph-meta nodes pre-sorted by degree descending makes this a `subarray`). No composer (direct render), no edges except focused-node edges, DPR capped at 2, autoRotate on.
- Touch: one-finger drag orbits, pinch zooms (OrbitControls default). Tap = click.
- Any WebGL context failure → static fallback: keep the current centered hero + search (the pre-makeover layout) so the page never breaks.

**Accept:** 60fps on a MacBook (check with devtools FPS meter), no dropped frames while orbiting; hover, click-focus, idle cycle, and card all work; mobile viewport in devtools shows reduced graph at smooth framerate.

## Phase 5 — Landing integration (`app/page.tsx` rewrite)

- `GraphScene` fixed full-viewport behind everything (`fixed inset-0 -z-10`).
- Bottom-center search box (max-w-xl), the concept's look: rounded-lg, `bg-white/5 border-white/10`, search icon left, `⌘K` kbd hint right. Sits on a **progressive blur**: a fixed bottom strip (~200px) using stacked `backdrop-filter: blur()` layers with `mask-image: linear-gradient` bands (3 layers: 2px/6px/16px) so blur ramps toward the bottom edge. Pure CSS, no libs.
- The input reuses ALL existing logic from current `app/page.tsx`: cycling placeholder, paste-anywhere handler, `isValidDocUrl` path, `/api/resolve` path, SSE progress via `/api/generate`. Progress log renders as compact lines above the search box on the blur strip (reuse `ProgressLogEntry`). Errors inline above input.
- Typing in the box (≥2 chars) ALSO dims non-matching nodes: call `searchClient()` (fuse) with limit 50, pass matching node indices to GraphScene which lerps non-matches to 15% opacity and matches to full + slight grow. Clearing restores. (This is the demo-magic moment — don't skip it.)
- Top-left corner: `HoudiniMD` wordmark small (`text-sm font-semibold`) + one-line tagline `text-xs text-white/40`. Bottom-center under search: existing footer line (`HoudiniMD · John Chedeville © 2026`, `text-[11px] text-white/25`).
- `⌘K` still opens the existing `SearchOverlay` (check `components/docs/SearchOverlay.tsx` wiring); the landing box is the primary path.
- Keep `app/opengraph-image.tsx` in mind: once the graph ships, regenerate the OG image as a rendered screenshot of the graph (static PNG in `public/` is fine) — this is what LinkedIn actually shows.

**Accept:** Playwright smoke (`test/`): landing renders canvas, search input works end-to-end for `fit` (mock or live), no console errors. Manual: paste a SideFX URL → progress log → redirect still works.

## Phase 6 — Semantic search (`app/api/search-semantic/route.ts`)

- Route (Workers runtime): embed the query via `env.AI.run('@cf/baai/bge-m3', {text:[q]})` (add `"ai": {"binding": "AI"}` to `wrangler.jsonc`), then `env.VECTORIZE.query(vector, {topK: 8, returnMetadata: 'indexed'})`. Both are network calls — CPU-safe. Return `[{slug, title, category, score}]`. Cache: `Cache-Control: public, max-age=3600` keyed by normalized query.
- Client (`lib/search/client.ts`): on query, race fuse (instant) and semantic (debounced 250ms); merge — exact/fuzzy hits first, then semantic hits not already present, tagged so the UI can show a subtle `~` related marker. Applies to both the landing box's node-dimming set and `SearchOverlay` results.
- Local dev has no bindings: feature-detect (`getCloudflareContext()` env missing → return 404) and the client silently skips semantic. Never let its absence break fuse search.

**Accept:** deployed site: query "bend geometry along a curve" returns curve/bend/sweep-type nodes that fuse alone misses.

---

## Gotchas for the implementing agent
- Never run force layout, kNN, or embedding in the Worker or the browser. Scripts only.
- `next dev` runs Node, not workerd: anything using `env.AI`/`env.VECTORIZE` only works deployed (or `bun run preview`). Build the graph purely from static files so the landing works fully in dev.
- Three.js in Next 16: import from `three/addons/...`; add `three` types come bundled. Keep the whole graph behind `next/dynamic` ssr:false so OpenNext SSR never touches WebGL.
- Deploy uses `bun run deploy` (includes `cache-sync.ts` — R2 asset sync keyed on pinned BUILD_ID; new `public/graph/*` files ride along automatically, but verify they're served after first deploy).
- Don't touch `middleware.ts` / llms.txt agent-redirect behavior — bots must keep getting markdown, not a WebGL page. Verify `curl -A "Claude-User" localhost:3000/` (or however middleware sniffs agents) still short-circuits before the graph page.
- Raycasting `THREE.Points` with 10K vertices each frame is fine, but only with a distance-scaled threshold; without it every frame tests a huge sphere and hover feels random.
