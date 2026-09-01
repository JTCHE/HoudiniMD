//! Fills `index.db` from the zips of a Houdini install.
//!
//! Three rules from the spec, in order of importance:
//! 1. The page the reader opens is parsed on demand, by `page()`. This pass
//!    never stands between the reader and the first page.
//! 2. Everything else is filled in behind them.
//! 3. Houdini wins the core. The thread runs in background mode and the parse
//!    pool leaves two cores alone.
//!
//! See spec: Local — SQLite FTS5 Index.

use std::io::Read;
use std::path::{Path, PathBuf};

use rayon::prelude::*;
use rusqlite::Connection;
use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::db;

/// What the front-end shows while the pass runs, and after it ends.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub build: String,
    /// Pages written so far.
    pub pages: u32,
    /// Pages the install holds. Equal to `pages` once the pass is done.
    pub total: u32,
    pub done: bool,
}

/// Starts the background pass for one build. Returns at once.
pub fn start(app: AppHandle, data: PathBuf, install: crate::install::Install) {
    std::thread::spawn(move || {
        background_priority();
        if let Err(message) = fill(&app, &data, &install) {
            let _ = app.emit("index-failed", message);
        }
    });
}

/// Reads the state of one build out of an open connection.
pub fn status(db: &Connection, build: &str) -> Status {
    let (pages, done) = db
        .query_row("SELECT pages, done FROM builds WHERE build = ?1", [build], |row| {
            Ok((row.get::<_, u32>(0)?, row.get::<_, i64>(1)? == 1))
        })
        .unwrap_or((0, false));
    Status { build: build.to_string(), pages, total: pages, done }
}

fn fill(app: &AppHandle, data: &Path, install: &crate::install::Install) -> Result<(), String> {
    let mut db = db::open(data)?;
    pass(&mut db, install, &|status| {
        let _ = app.emit("index", status);
    })
}

/// The pass itself, with nowhere to report to but the closure it is given.
/// Everything that touches the app handle stays in `fill`.
pub fn pass(
    db: &mut Connection,
    install: &crate::install::Install,
    report: &dyn Fn(Status),
) -> Result<(), String> {
    let build = install.version.clone();

    if status(db, &build).done {
        report(status(db, &build));
        return Ok(());
    }

    // A half-filled build is thrown away rather than resumed. Resuming would
    // need a per-zip cursor, and a whole pass takes seconds.
    clear(db, &build)?;

    let zips = sections(&install.help);
    let total: u32 = zips.iter().map(|(_, count)| count).sum();
    let mut pages = 0u32;
    let report = |pages: u32, done: bool| {
        report(Status { build: build.clone(), pages, total, done });
    };
    report(0, false);

    let pool = pool()?;
    for (zip, _) in &zips {
        let section = zip.file_stem().and_then(|s| s.to_str()).unwrap_or_default().to_string();
        let sources = read_zip(zip, &section);
        let parsed: Vec<Row> = pool.install(|| sources.par_iter().map(row).collect());
        pages += write(db, &build, &parsed)? as u32;
        report(pages, false);
    }

    db.execute(
        "INSERT INTO builds (build, pages, done) VALUES (?1, ?2, 1)
         ON CONFLICT(build) DO UPDATE SET pages = ?2, done = 1",
        rusqlite::params![&build, pages],
    )
    .map_err(|e| e.to_string())?;
    report(pages, true);
    Ok(())
}

/// One page, ready to write.
struct Row {
    path: String,
    title: String,
    node_type: Option<String>,
    icon: Option<String>,
    summary: Option<String>,
    /// The body, cut at its headings. See `sections.rs`.
    sections: Vec<crate::sections::Section>,
}

fn row((path, source): &(String, String)) -> Row {
    let parsed = wiki::parse(source);
    let markdown = wiki::markdown::blocks(&parsed.blocks, 1);
    Row {
        path: path.clone(),
        title: crate::display_name(&parsed),
        node_type: crate::node_type(&parsed.props),
        icon: wiki::model::prop(&parsed.props, "icon").map(|icon| format!("{icon}.svg")),
        summary: parsed.summary.as_ref().map(|s| wiki::inline::plain(s)),
        sections: crate::sections::split(&markdown),
    }
}

fn write(db: &mut Connection, build: &str, rows: &[Row]) -> Result<usize, String> {
    let tx = db.transaction().map_err(|e| e.to_string())?;
    {
        let mut page = tx
            .prepare(
                "INSERT OR REPLACE INTO pages (build, path, title, node_type, icon, summary)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            )
            .map_err(|e| e.to_string())?;
        let mut text = tx
            .prepare(
                "INSERT INTO pages_fts (build, path, slug, heading, title, body)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            )
            .map_err(|e| e.to_string())?;
        for row in rows {
            page.execute(rusqlite::params![
                build,
                &row.path,
                &row.title,
                &row.node_type,
                &row.icon,
                &row.summary
            ])
            .map_err(|e| e.to_string())?;
            // The title rides the FIRST section only. On every section it would
            // count once per heading, and a long page would outrank the page
            // actually named for the words.
            let mut named = false;
            for section in &row.sections {
                let title = if named { "" } else { row.title.as_str() };
                named = true;
                text.execute(rusqlite::params![
                    build,
                    &row.path,
                    &section.slug,
                    &section.heading,
                    title,
                    &section.body
                ])
                .map_err(|e| e.to_string())?;
            }
        }
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(rows.len())
}

fn clear(db: &Connection, build: &str) -> Result<(), String> {
    for statement in [
        "DELETE FROM pages WHERE build = ?1",
        "DELETE FROM pages_fts WHERE build = ?1",
        "DELETE FROM builds WHERE build = ?1",
    ] {
        db.execute(statement, [build]).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// The doc zips and how many pages each one holds. `images.zip` is assets, not
/// pages; see spec: Local — Image and Asset Serving.
fn sections(help: &Path) -> Vec<(PathBuf, u32)> {
    let Ok(entries) = std::fs::read_dir(help) else {
        return Vec::new();
    };
    let mut zips: Vec<PathBuf> = entries
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| path.extension().is_some_and(|e| e == "zip"))
        .filter(|path| path.file_name().is_some_and(|name| name != "images.zip"))
        .collect();
    zips.sort();
    zips.into_iter()
        .map(|zip| {
            let pages = count(&zip);
            (zip, pages)
        })
        .collect()
}

/// Counts the pages in a zip from its directory alone, without reading a byte
/// of any entry.
fn count(zip: &Path) -> u32 {
    let Ok(archive) = open_zip(zip) else {
        return 0;
    };
    archive.file_names().filter(|name| name.ends_with(".txt")).count() as u32
}

/// `sop/box.txt` in `nodes.zip` is the page `nodes/sop/box`, which is the path
/// `help::page` takes back.
fn read_zip(zip: &Path, section: &str) -> Vec<(String, String)> {
    let Ok(mut archive) = open_zip(zip) else {
        return Vec::new();
    };
    let names: Vec<String> = archive
        .file_names()
        .filter(|name| name.ends_with(".txt"))
        .map(str::to_string)
        .collect();
    let mut pages = Vec::with_capacity(names.len());
    for name in names {
        let Ok(mut entry) = archive.by_name(&name) else {
            continue;
        };
        let mut source = String::new();
        if entry.read_to_string(&mut source).is_err() {
            continue;
        }
        pages.push((format!("{section}/{}", name.trim_end_matches(".txt")), source));
    }
    pages
}

fn open_zip(zip: &Path) -> Result<zip::ZipArchive<std::io::BufReader<std::fs::File>>, String> {
    let file = std::fs::File::open(zip).map_err(|e| e.to_string())?;
    zip::ZipArchive::new(std::io::BufReader::new(file)).map_err(|e| e.to_string())
}

/// Two cores stay free for Houdini. On a four-core machine that is half of
/// them, which is the point: the artist is not waiting on this pass.
fn pool() -> Result<rayon::ThreadPool, String> {
    let cores = std::thread::available_parallelism().map_or(1, |n| n.get());
    rayon::ThreadPoolBuilder::new()
        .num_threads(cores.saturating_sub(2).max(1))
        .build()
        .map_err(|e| e.to_string())
}

/// Background mode drops the disk priority of the thread as well as its CPU
/// priority, which matters more here: the pass reads zips off the same disk
/// Houdini reads.
#[cfg(windows)]
fn background_priority() {
    use windows_sys::Win32::System::Threading::{
        GetCurrentThread, SetThreadPriority, THREAD_MODE_BACKGROUND_BEGIN,
    };
    unsafe { SetThreadPriority(GetCurrentThread(), THREAD_MODE_BACKGROUND_BEGIN as i32) };
}

#[cfg(not(windows))]
fn background_priority() {}

