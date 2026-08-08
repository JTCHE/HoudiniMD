-- Page views and searches for houdinimd.com, written by worker.ts /
-- telemetry, read by the houdinimd-analytics TUI (read-only, via the D1 HTTP
-- API with a Read-scoped account token). Replaces Analytics Engine + the
-- TUI's local sqlite mirror: this table IS the archive.

CREATE TABLE views (
  ts TEXT NOT NULL,
  visitor TEXT NOT NULL,
  path TEXT NOT NULL,
  kind TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  bot TEXT NOT NULL DEFAULT '',
  evidence TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '',
  referrer TEXT NOT NULL DEFAULT '',
  markdown TEXT NOT NULL DEFAULT '',
  alias TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (ts, visitor, path)
) WITHOUT ROWID;

CREATE TABLE searches (
  ts TEXT NOT NULL,
  visitor TEXT NOT NULL,
  q TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  results INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT '',
  dest TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT '',
  alias TEXT NOT NULL DEFAULT '',
  rank TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (ts, visitor, q)
) WITHOUT ROWID;
