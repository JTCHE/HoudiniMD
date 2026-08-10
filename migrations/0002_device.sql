-- Mobile vs desktop, for the Devices rollup in houdinimd-analytics. Views
-- only: most search sources (api, generate) are non-browser, so a device
-- split there would mostly just say "desktop" about traffic that has no
-- device at all. See lib/wants-markdown.ts deviceKind().

ALTER TABLE views ADD COLUMN device TEXT NOT NULL DEFAULT '';
