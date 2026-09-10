//! The reader's own file, `user.db`, and the connection every command uses.
//!
//! `index.db` belongs to the engine: parsed pages and the FTS5 table over
//! their bodies, derived from the Houdini install and thrown away freely.
//! `user.db` holds the reader's own work — bookmarks, recents and settings —
//! and is attached to the engine's connection as `user`, so one statement can
//! join a bookmark to its page title.
//!
//! See spec: Local — SQLite FTS5 Index.

use std::path::{Path, PathBuf};

use rusqlite::Connection;

/// `index.db` and `user.db` sit side by side in the app data folder.
pub fn paths(data: &Path) -> (PathBuf, PathBuf) {
    (engine::db::path(data), data.join("user.db"))
}

/// Opens `index.db` through the engine, attaches `user.db`, and makes the
/// reader's schema.
pub fn open(data: &Path) -> Result<Connection, String> {
    let db = engine::db::open(data)?;
    let (_, user) = paths(data);

    db.execute("ATTACH DATABASE ?1 AS user", [user.to_string_lossy()])
        .map_err(|e| format!("{}: {e}", user.display()))?;
    reset_user_if_stale(&db)?;
    db.execute_batch(SCHEMA).map_err(|e| e.to_string())?;
    Ok(db)
}

/// What the `user.*` tables in `SCHEMA` describe. Raise it whenever they
/// change shape.
const USER_VERSION: u32 = 4;

/// `user.db` holds the reader's own work, so this reset is written apart from
/// anything the engine does to `index.db`. Before the beta ships nobody has a
/// bookmark yet, so a shape change here is still free; once real readers have
/// them this reset has to become a real migration instead of a drop.
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

const SCHEMA: &str = r#"
-- A bookmark names the page, never the page in one build, so an upgrade cannot
-- empty the list. See spec: Local — Settings and Bookmark Sync.
CREATE TABLE IF NOT EXISTS user.bookmarks (
  path  TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  icon  TEXT,
  added INTEGER NOT NULL
);

-- One row per PAGE, not per visit: a reader who comes back to a page just
-- bumps `at` on the row it already has. `path` is therefore a key here.
CREATE TABLE IF NOT EXISTS user.recents (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  path  TEXT NOT NULL UNIQUE,
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
