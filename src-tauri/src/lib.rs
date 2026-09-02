mod assets;
pub mod db;
mod help;
pub mod index;
pub mod install;
pub mod sections;

use std::sync::Mutex;

use serde::Serialize;
use tauri::http::{Request, Response};
use tauri::{Manager, State};

/// The one connection the reader's own queries run on. `index.db` is open
/// here with `user.db` attached; the background pass keeps its own connection,
/// so a long write never holds up a search.
struct Db(Mutex<rusqlite::Connection>);

/// One page, ready to draw. The body is Markdown, which the front-end renders
/// with the same component map the site uses.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PageView {
    path: String,
    /// The page name, as written in the help source.
    name: String,
    /// The kind of page, for the header: "Geometry node", "VEX function".
    node_type: Option<String>,
    /// An icon path inside `icons.zip`, such as `SOP/copytopoints.svg`.
    icon: Option<String>,
    /// The Houdini version the node arrived in.
    since: Option<String>,
    summary: Option<String>,
    markdown: String,
    /// The build the page was read from.
    version: String,
}

/// The installs found on this machine, newest build first.
#[tauri::command]
fn installs() -> Vec<install::Install> {
    install::find()
}

/// What the reader gets instead of a page. `missing` separates "this build has
/// no such page", which the front-end answers with the not-found page, from a
/// failure it can only report.
#[derive(Serialize)]
struct PageError {
    missing: bool,
    message: String,
}

/// Reads and parses one page, such as `nodes/sop/copytopoints`.
///
/// This never waits on the index. The first page a reader opens is parsed here
/// even if the background pass has not reached it yet.
#[tauri::command]
fn page(path: String) -> Result<PageView, PageError> {
    let install = current().map_err(|message| PageError { missing: false, message })?;
    let source = help::page(&install.help, &path).map_err(|reason| match reason {
        help::PageError::Missing => PageError {
            missing: true,
            message: format!("no page {path} in Houdini {}", install.version),
        },
        help::PageError::Unreadable(message) => PageError { missing: false, message },
    })?;
    let mut parsed = wiki::parse(&source);
    assets::rewrite(&path, &mut parsed.blocks);
    let prop = |name: &str| wiki::model::prop(&parsed.props, name).map(str::to_string);
    Ok(PageView {
        path,
        name: display_name(&parsed),
        node_type: node_type(&parsed.props),
        icon: prop("icon").map(|icon| format!("{icon}.svg")),
        since: prop("since"),
        summary: parsed.summary.as_ref().map(|s| wiki::inline::plain(s)),
        markdown: wiki::markdown::blocks(&parsed.blocks, 1),
        version: install.version,
    })
}

/// A page in the title list, and a search hit. The front-end draws both the
/// same way, so they are one shape.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Hit {
    path: String,
    title: String,
    node_type: Option<String>,
    icon: Option<String>,
    /// What the page says it does, shown when nothing under a heading matched.
    summary: Option<String>,
    /// The sections of this page that matched, best first. Empty for a
    /// title-list entry, which matched no text at all.
    headings: Vec<Section>,
    /// How well the words match, larger being better. The front-end weights
    /// this by what KIND of page it is, which is a question about the reader
    /// and not about the text — see `weight` in `search.ts`. Zero for a
    /// title-list entry.
    score: f64,
}

/// One matching section of a page: the row the list nests under it.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Section {
    /// Empty when the words were above the first heading.
    heading: String,
    /// The anchor to open the page at. Empty with an empty heading.
    slug: String,
    /// The words themselves, as they read on the page.
    excerpt: String,
}

/// Every page title in the current build.
///
/// The whole list goes to the front-end once and stays in memory there, which
/// is what makes the pick in the search field instant. 10,450 titles are small.
#[tauri::command]
fn titles(state: State<Db>) -> Result<Vec<Hit>, String> {
    let build = current()?.version;
    let db = state.0.lock().map_err(|e| e.to_string())?;
    let mut statement = db
        .prepare(
            "SELECT path, title, node_type, icon, summary FROM pages
             WHERE build = ?1 ORDER BY path",
        )
        .map_err(|e| e.to_string())?;
    let rows = statement
        .query_map([&build], |row| {
            Ok(Hit {
                path: row.get(0)?,
                title: row.get(1)?,
                node_type: row.get(2)?,
                icon: row.get(3)?,
                summary: row.get(4)?,
                headings: Vec::new(),
                score: 0.0,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<_, _>>().map_err(|e| e.to_string())
}

/// At most this many matching sections are listed under one page. Past three
/// the list is a page of one result, and the reader has stopped comparing.
const SECTIONS_PER_PAGE: usize = 3;

/// Full-text search over the page bodies, ranked with `bm25()`.
///
/// A row of the index is a section, so the ranking is over sections and the
/// pages come out of it: the first section of a page decides where the page
/// sits, and its other matching sections are listed beneath it. That is what
/// the result list draws, and it is why the query asks for more rows than the
/// caller wants pages.
///
/// The title and heading columns are weighted above the body, so a page named
/// for the words beats a page that only mentions them.
#[tauri::command]
fn search(state: State<Db>, query: String, limit: u32) -> Result<Vec<Hit>, String> {
    let Some(match_query) = db::match_query(&query) else {
        return Ok(Vec::new());
    };
    let build = current()?.version;
    let db = state.0.lock().map_err(|e| e.to_string())?;
    let mut statement = db
        .prepare(
            "SELECT pages_fts.path, p.title, p.node_type, p.icon, p.summary,
                    pages_fts.heading, pages_fts.slug,
                    snippet(pages_fts, 5, '', '', '…', 14),
                    bm25(pages_fts, 0.0, 0.0, 0.0, 4.0, 10.0, 1.0) AS rank
             FROM pages_fts
             JOIN pages p ON p.build = pages_fts.build AND p.path = pages_fts.path
             WHERE pages_fts MATCH ?1 AND pages_fts.build = ?2
             ORDER BY rank
             LIMIT ?3",
        )
        .map_err(|e| e.to_string())?;

    let wanted = limit as usize;
    let rows = statement
        .query_map(
            rusqlite::params![match_query, build, (wanted * SECTIONS_PER_PAGE * 4) as u32],
            |row| {
                Ok((
                    Hit {
                        path: row.get(0)?,
                        title: row.get(1)?,
                        node_type: row.get(2)?,
                        icon: row.get(3)?,
                        summary: row.get(4)?,
                        headings: Vec::new(),
                        // `bm25()` is more negative the better the match. The
                        // front-end multiplies by a weight in 0..1, so the sign
                        // is turned here and never there.
                        score: -row.get::<_, f64>(8)?,
                    },
                    Section {
                        heading: row.get(5)?,
                        slug: row.get(6)?,
                        excerpt: row.get(7)?,
                    },
                ))
            },
        )
        .map_err(|e| e.to_string())?;

    let mut hits: Vec<Hit> = Vec::new();
    let mut at: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
    for row in rows {
        let (hit, section) = row.map_err(|e| e.to_string())?;
        let index = match at.get(&hit.path) {
            Some(index) => *index,
            None => {
                if hits.len() == wanted {
                    continue;
                }
                at.insert(hit.path.clone(), hits.len());
                hits.push(hit);
                hits.len() - 1
            }
        };
        if hits[index].headings.len() < SECTIONS_PER_PAGE && !section.excerpt.trim().is_empty() {
            hits[index].headings.push(section);
        }
    }
    Ok(hits)
}

/// How far the background pass has got. The front-end also gets this as an
/// `index` event, so this call is only for what it missed before it mounted.
#[tauri::command]
fn index_status(state: State<Db>) -> Result<index::Status, String> {
    let build = current()?.version;
    let db = state.0.lock().map_err(|e| e.to_string())?;
    Ok(index::status(&db, &build))
}

/// The header reads "Geometry node", not "sop". The network a node lives in is
/// the only thing that names its kind, so the label is derived from it.
pub(crate) fn node_type(props: &wiki::Props) -> Option<String> {
    let kind = wiki::model::prop(props, "type")?;
    let context = wiki::model::prop(props, "context")?;
    if kind != "node" {
        return None;
    }
    let label = match context {
        "sop" => "Geometry node",
        "dop" => "Dynamics node",
        "obj" => "Object node",
        "cop" => "Copernicus node",
        "lop" => "LOP node",
        "out" | "rop" => "Render node",
        "top" => "TOP node",
        "chop" => "Channel node",
        "vop" => "VOP node",
        "shop" => "Shader node",
        "apex" => "APEX node",
        other => return Some(format!("{other} node")),
    };
    Some(label.to_string())
}

/// The name a reader sees. A page that carries a `version` property is one
/// entry of many under the same title, so the version is part of the name.
pub(crate) fn display_name(parsed: &wiki::Page) -> String {
    match wiki::model::prop(&parsed.props, "version") {
        Some(version) => format!("{} {version}", parsed.title_text),
        None => parsed.title_text.clone(),
    }
}

fn current() -> Result<install::Install, String> {
    install::find()
        .into_iter()
        .next()
        .ok_or_else(|| "no Houdini install found on this machine".to_string())
}

/// Serves the pictures and videos a help page shows, out of the install.
/// The front-end asks for `himage://localhost/images/shelf/copy.jpg` or
/// `himage://localhost/videos/tween.webm`; `assets::resolve` wrote that path.
fn asset_response(request: Request<Vec<u8>>) -> Response<Vec<u8>> {
    let name = percent_decode(request.uri().path());
    let bytes = match current().and_then(|install| help::asset(&install.help, &name)) {
        Ok(bytes) => bytes,
        Err(reason) => {
            return Response::builder()
                .status(404)
                .body(reason.into_bytes())
                .unwrap()
        }
    };
    let head = Response::builder()
        .header("Content-Type", media_type(&name))
        .header("Cache-Control", "max-age=31536000")
        .header("Accept-Ranges", "bytes");

    // A player asks for a range as soon as the reader drags the scrub bar, and
    // it takes the whole file as an answer that it cannot seek in.
    let asked = request.headers().get("Range").and_then(|v| v.to_str().ok());
    match range(asked, bytes.len()) {
        Some((first, last)) => head
            .status(206)
            .header(
                "Content-Range",
                format!("bytes {first}-{last}/{}", bytes.len()),
            )
            .body(bytes[first..=last].to_vec())
            .unwrap(),
        None => head.body(bytes).unwrap(),
    }
}

/// The bytes a `Range: bytes=first-last` header asks for, clamped to the file.
/// `None` for no header, for a form this app does not serve, and for a range
/// that starts past the end — the last of which is a 416 the player recovers
/// from by asking again, so answering with the whole file is the kinder reply.
fn range(header: Option<&str>, len: usize) -> Option<(usize, usize)> {
    let (first, last) = header?.trim().strip_prefix("bytes=")?.split_once('-')?;
    let first: usize = first.trim().parse().ok()?;
    let last = match last.trim() {
        "" => len.checked_sub(1)?,
        last => last.parse::<usize>().ok()?.min(len.checked_sub(1)?),
    };
    (first <= last).then_some((first, last))
}

fn media_type(name: &str) -> &'static str {
    match name.rsplit('.').next().unwrap_or_default() {
        "png" => "image/png",
        "gif" => "image/gif",
        "svg" => "image/svg+xml",
        "webm" => "video/webm",
        "mp4" => "video/mp4",
        _ => "image/jpeg",
    }
}

/// Serves the icons the help pages name, straight out of `icons.zip`.
/// The front-end asks for `hicon://localhost/SOP/box.svg`.
fn icon_response(request: Request<Vec<u8>>) -> Response<Vec<u8>> {
    let name = request.uri().path().trim_start_matches('/').to_string();
    let name = percent_decode(&name);
    match current().and_then(|install| help::icon(&install.root, &name)) {
        Ok(bytes) => Response::builder()
            .header("Content-Type", "image/svg+xml")
            .header("Cache-Control", "max-age=31536000")
            .body(bytes)
            .unwrap(),
        Err(reason) => Response::builder()
            .status(404)
            .body(reason.into_bytes())
            .unwrap(),
    }
}

/// A help icon name can carry a space, so the webview sends it percent-encoded.
fn percent_decode(text: &str) -> String {
    let bytes = text.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match (bytes[i], bytes.get(i + 1), bytes.get(i + 2)) {
            (b'%', Some(a), Some(b)) => match u8::from_str_radix(&format!("{}{}", *a as char, *b as char), 16) {
                Ok(byte) => {
                    out.push(byte);
                    i += 3;
                }
                Err(_) => {
                    out.push(bytes[i]);
                    i += 1;
                }
            },
            _ => {
                out.push(bytes[i]);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .register_uri_scheme_protocol("hicon", |_app, request| icon_response(request))
        .register_uri_scheme_protocol("himage", |_app, request| asset_response(request))
        .setup(|app| {
            let data = app.path().app_data_dir()?;
            app.manage(Db(Mutex::new(db::open(&data)?)));
            if let Ok(install) = current() {
                index::start(app.handle().clone(), data, install);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            installs,
            page,
            titles,
            search,
            index_status
        ])
        .run(tauri::generate_context!())
        .expect("error while running the application");
}

#[cfg(test)]
mod tests {
    use super::range;

    #[test]
    fn a_range_names_the_bytes_it_wants() {
        assert_eq!(range(Some("bytes=0-99"), 500), Some((0, 99)));
        assert_eq!(range(Some(" bytes=100-199 "), 500), Some((100, 199)));
    }

    #[test]
    fn an_open_range_runs_to_the_end() {
        assert_eq!(range(Some("bytes=100-"), 500), Some((100, 499)));
    }

    #[test]
    fn a_range_past_the_end_stops_at_the_end() {
        assert_eq!(range(Some("bytes=0-9999"), 500), Some((0, 499)));
    }

    #[test]
    fn what_this_cannot_serve_becomes_the_whole_file() {
        assert_eq!(range(None, 500), None);
        // A suffix range, `the last 100 bytes`, which no player asks a local
        // source for.
        assert_eq!(range(Some("bytes=-100"), 500), None);
        assert_eq!(range(Some("bytes=600-700"), 500), None);
        assert_eq!(range(Some("items=0-9"), 500), None);
        assert_eq!(range(Some("bytes=0-0"), 0), None);
    }
}
