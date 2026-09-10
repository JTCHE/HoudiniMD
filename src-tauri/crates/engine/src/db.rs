//! `index.db`: what the engine derives from a Houdini install.
//!
//! Everything here is derived. Delete the file and nothing of the reader's is
//! lost — the background pass fills it again in seconds. The reader's own work
//! lives in `user.db`, which the app owns and this module never touches.
//!
//! See spec: Local — SQLite FTS5 Index.

use std::path::{Path, PathBuf};

use rusqlite::Connection;

/// `index.db` sits in the folder the caller names.
pub fn path(data: &Path) -> PathBuf {
    data.join("index.db")
}

/// Opens `index.db` and makes its schema.
pub fn open(data: &Path) -> Result<Connection, String> {
    std::fs::create_dir_all(data).map_err(|e| format!("{}: {e}", data.display()))?;
    let index = path(data);
    let db = Connection::open(&index).map_err(|e| format!("{}: {e}", index.display()))?;

    // WAL lets the background indexer write while the reader reads.
    db.pragma_update(None, "journal_mode", "WAL")
        .map_err(|e| e.to_string())?;
    db.pragma_update(None, "synchronous", "NORMAL")
        .map_err(|e| e.to_string())?;

    reset_if_stale(&db)?;
    db.execute_batch(SCHEMA).map_err(|e| e.to_string())?;
    Ok(db)
}

/// What `SCHEMA` describes. Raise it whenever the derived tables change shape,
/// or the parser writes different rows into them.
const VERSION: u32 = 3;

/// Throws away everything derived from the Houdini install when the shape it
/// was written in is not the shape this build reads. `index.db` is derived, so
/// there is nothing here to migrate — the background pass fills it again in
/// seconds.
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
"#;

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
