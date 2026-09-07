//! The two SQLite files behind the app.
//!
//! `index.db` is derived from the Houdini install: parsed pages and the FTS5
//! table over their bodies. Delete it and nothing of the reader's is lost.
//! `user.db` holds the reader's own work. It is attached as `user`, so one
//! statement can join a bookmark to its page title.
//!
//! See spec: Local — SQLite FTS5 Index.

use std::path::{Path, PathBuf};

use rusqlite::Connection;

/// `index.db` and `user.db` sit side by side in the app data folder.
pub fn paths(data: &Path) -> (PathBuf, PathBuf) {
    (data.join("index.db"), data.join("user.db"))
}

/// Opens `index.db`, attaches `user.db`, and makes both schemas.
pub fn open(data: &Path) -> Result<Connection, String> {
    std::fs::create_dir_all(data).map_err(|e| format!("{}: {e}", data.display()))?;
    let (index, user) = paths(data);
    let db = Connection::open(&index).map_err(|e| format!("{}: {e}", index.display()))?;

    // WAL lets the background indexer write while the reader reads.
    db.pragma_update(None, "journal_mode", "WAL")
        .map_err(|e| e.to_string())?;
    db.pragma_update(None, "synchronous", "NORMAL")
        .map_err(|e| e.to_string())?;

    db.execute("ATTACH DATABASE ?1 AS user", [user.to_string_lossy()])
        .map_err(|e| format!("{}: {e}", user.display()))?;
    reset_if_stale(&db)?;
    reset_user_if_stale(&db)?;
    db.execute_batch(SCHEMA).map_err(|e| e.to_string())?;
    Ok(db)
}

/// What `SCHEMA` describes. Raise it whenever the derived tables change shape.
const VERSION: u32 = 2;

/// Throws away everything derived from the Houdini install when the shape it
/// was written in is not the shape this build reads. `index.db` is derived, so
/// there is nothing here to migrate — the background pass fills it again in
/// seconds. `user.db` is never touched.
fn reset_if_stale(db: &Connection) -> Result<(), String> {
    let found: u32 = db
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    if found != VERSION {
        db.execute_batch(
            "DROP TABLE IF EXISTS pages;
             DROP TABLE IF EXISTS pages_fts;
             DROP TABLE IF EXISTS builds;",
        )
        .map_err(|e| e.to_string())?;
        db.pragma_update(None, "user_version", VERSION)
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// What the `user.*` tables in `SCHEMA` describe. Raise it whenever they
/// change shape.
const USER_VERSION: u32 = 2;

/// The same reset as `reset_if_stale`, kept apart because `user.db` holds the
/// reader's own work and every other file in this module leaves it alone.
/// Before the beta ships nobody has a bookmark yet, so a shape change here is
/// still free; once real readers have them this reset has to become a real
/// migration instead of a drop.
fn reset_user_if_stale(db: &Connection) -> Result<(), String> {
    let found: u32 = db
        .query_row("PRAGMA user.user_version", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    if found != USER_VERSION {
        db.execute_batch(
            "DROP TABLE IF EXISTS user.bookmarks;
             DROP TABLE IF EXISTS user.recents;",
        )
        .map_err(|e| e.to_string())?;
        db.pragma_update(Some("user"), "user_version", USER_VERSION)
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// One build is one set of rows, never one file and never one folder. A
/// Houdini upgrade rewrites its own rows and leaves the others alone.
const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS builds (
  build TEXT PRIMARY KEY,
  pages INTEGER NOT NULL DEFAULT 0,
  -- 0 while the background pass is still filling this build in.
  done  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS pages (
  build     TEXT NOT NULL,
  path      TEXT NOT NULL,
  title     TEXT NOT NULL,
  node_type TEXT,
  icon      TEXT,
  summary   TEXT,
  PRIMARY KEY (build, path)
) WITHOUT ROWID;

-- One row per SECTION of a page, not per page: a hit names the heading the
-- reader should land on, which is what the result list draws under the page.
-- Cutting the body at its headings stores it once, not twice — see
-- `sections.rs`.
--
-- `heading` is empty and `title` is set on the row for the text above the first
-- heading, so a page is named exactly once and the title weight cannot multiply
-- with the number of sections it has.
CREATE VIRTUAL TABLE IF NOT EXISTS pages_fts USING fts5(
  build   UNINDEXED,
  path    UNINDEXED,
  slug    UNINDEXED,
  heading,
  title,
  body,
  tokenize = "unicode61 remove_diacritics 2"
);

-- A bookmark names the page, never the page in one build, so an upgrade cannot
-- empty the list. See spec: Local — Settings and Bookmark Sync.
CREATE TABLE IF NOT EXISTS user.bookmarks (
  path  TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  icon  TEXT,
  added INTEGER NOT NULL
);

-- Same shape as bookmarks, one row per page the reader opened. Trimmed to
-- the front end's own keep-count, not here.
CREATE TABLE IF NOT EXISTS user.recents (
  path  TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  icon  TEXT,
  at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS user.settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
"#;

/// One row of `user.settings`. Read at the call site that needs it — there
/// are only a handful of keys, so no cache earns its keep.
pub fn get_setting(db: &Connection, key: &str) -> Option<String> {
    db.query_row("SELECT value FROM user.settings WHERE key = ?1", [key], |row| row.get(0))
        .ok()
}

pub fn set_setting(db: &Connection, key: &str, value: &str) -> Result<(), String> {
    db.execute(
        "INSERT INTO user.settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = ?2",
        [key, value],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Turns what the reader typed into an FTS5 query.
///
/// Every token is quoted, so a bare `*`, `-` or `NEAR` is text and not syntax.
/// The last token takes a prefix star, because the reader is still typing it.
pub fn match_query(text: &str) -> Option<String> {
    let tokens: Vec<String> = text
        .split(|c: char| !c.is_alphanumeric() && c != '_')
        .filter(|t| !t.is_empty())
        .map(|t| format!("\"{t}\""))
        .collect();
    let (last, rest) = tokens.split_last()?;
    let mut query = rest.join(" ");
    if !query.is_empty() {
        query.push(' ');
    }
    query.push_str(last);
    query.push('*');
    Some(query)
}

#[cfg(test)]
mod tests {
    use super::match_query;

    #[test]
    fn a_query_quotes_every_token_and_extends_the_last() {
        assert_eq!(match_query("copy to points").unwrap(), "\"copy\" \"to\" \"points\"*");
    }

    #[test]
    fn syntax_the_reader_types_stays_text() {
        assert_eq!(match_query("a OR b*").unwrap(), "\"a\" \"OR\" \"b\"*");
    }

    #[test]
    fn nothing_to_match_is_no_query() {
        assert!(match_query("   ").is_none());
    }
}
