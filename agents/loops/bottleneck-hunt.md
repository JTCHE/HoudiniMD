# Bottleneck-hunting loop

Loop: browse the live site (houdinimd.com) with the Claude Browser pane like a real
visitor — click through breadcrumbs, navigate swiftly between pages, and hard-reload
(Cmd+Shift+R, bypasses cache) to force fresh renders, since that's what reproduces CPU-limit
(1102) errors. Check network requests and console for non-200s or errors as you go.

When you find a bug or bottleneck: find the root cause (check logs, don't guess), fix it,
deploy to prod, then re-verify live in the browser with the same hard-reload technique to
confirm it's actually gone.

Before deploying: get a quick Opus review of the fix for correctness, proportional to how
complex the change is (a one-liner needs less scrutiny than a caching/concurrency change).

Repeat: deploy → verify live → find the next bottleneck → fix → review → deploy. Keep going
until there are no obvious bottlenecks left. Only commit to git if explicitly asked.
