pub mod db;
pub mod hook;
pub mod library;
pub mod server;
pub mod tray;
pub mod update;

/// The reading itself is the `engine` crate, which knows nothing about a
/// window: installs, pages, the index and the search. This app is one caller
/// of it — the Python module is the other. Re-exported under the names the
/// rest of this crate already uses.
pub use engine::{
    Hit, Meta, PageError, PageView, Section, all_titles, find, help, index, install, read_meta,
    read_page,
};

use std::sync::{Arc, Mutex};

use serde::Serialize;
use tauri::http::{Request, Response};
use tauri::{Emitter, Manager, State};

/// The one connection the reader's own queries run on. `index.db` is open
/// here with `user.db` attached; the background pass keeps its own connection,
/// so a long write never holds up a search.
pub(crate) struct Db(pub(crate) Mutex<rusqlite::Connection>);

/// The app's own data directory, so a command that starts a background index
/// pass does not need to ask for it again.
struct DataDir(std::path::PathBuf);

/// The installs found on this machine, newest build first. Cached: a scan
/// happens once and again only when `refresh` is asked for, which is what the
/// version picker does when the reader opens it.
#[tauri::command]
fn installs(cache: State<Arc<install::Cache>>, refresh: Option<bool>) -> Vec<install::Install> {
    if refresh.unwrap_or(false) { cache.refresh() } else { cache.get() }
}

/// The install every command reads right now. Not the newest on the machine —
/// the one the reader chose. Costs no scan; the cache already holds it.
#[tauri::command]
fn current_install(
    state: State<Db>,
    chosen: State<Arc<install::Chosen>>,
    cache: State<Arc<install::Cache>>,
) -> Result<install::Install, String> {
    let db = state.0.lock().map_err(|e| e.to_string())?;
    current(&db, &chosen, &cache)
}

/// One row of the version picker: a build and how much of it is indexed.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildRow {
    pub version: String,
    pub pages: u32,
    pub done: bool,
    /// False for a build that has never been opened. The picker says "not
    /// indexed yet" for those, rather than claiming a pass is running.
    pub started: bool,
    pub current: bool,
}

/// Every install on the machine, with its page count, for the version picker.
/// Rescans first — the picker is the one place a scan is worth its cost.
#[tauri::command]
fn available_installs(
    state: State<Db>,
    chosen: State<Arc<install::Chosen>>,
    cache: State<Arc<install::Cache>>,
) -> Result<Vec<BuildRow>, String> {
    let db = state.0.lock().map_err(|e| e.to_string())?;
    // A machine with no install yet still needs this list — empty, so the
    // reader can reach the "pick a folder" row instead of getting an error
    // in place of the picker.
    let now = current(&db, &chosen, &cache).map(|i| i.version).unwrap_or_default();
    Ok(cache
        .refresh()
        .into_iter()
        .map(|install| {
            let status = index::status(&db, &install.version);
            BuildRow {
                current: install.version == now,
                version: install.version,
                pages: status.pages,
                done: status.done,
                started: status.started,
            }
        })
        .collect())
}

/// Switches the build every command reads. Persists the choice, and starts
/// the background index pass for it when the index has not already filled it.
#[tauri::command]
fn select_install(
    app: tauri::AppHandle,
    data: State<DataDir>,
    state: State<Db>,
    chosen: State<Arc<install::Chosen>>,
    cache: State<Arc<install::Cache>>,
    version: String,
) -> Result<BuildRow, String> {
    let install = cache
        .get()
        .into_iter()
        .find(|i| i.version == version)
        .ok_or_else(|| format!("Houdini {version} is not on this machine"))?;
    let db = state.0.lock().map_err(|e| e.to_string())?;
    switch(app, &data, &db, &chosen, install)
}

/// Adds a Houdini install the reader pointed at by hand, and switches to it.
/// The scan only looks where the installer puts a build, so a studio install
/// on another drive reaches the app through here and through nowhere else.
#[tauri::command]
fn add_install(
    app: tauri::AppHandle,
    data: State<DataDir>,
    state: State<Db>,
    chosen: State<Arc<install::Chosen>>,
    cache: State<Arc<install::Cache>>,
    path: String,
) -> Result<BuildRow, String> {
    let db = state.0.lock().map_err(|e| e.to_string())?;
    let (install, picked) = install::add_picked(&cache, std::path::PathBuf::from(path))?;
    db::set_setting(&db, install::PICKED_KEY, &picked)?;
    switch(app, &data, &db, &chosen, install)
}

/// Makes `install` the build every command reads, and starts its index pass
/// when the index does not already hold it.
fn switch(
    app: tauri::AppHandle,
    data: &DataDir,
    db: &rusqlite::Connection,
    chosen: &install::Chosen,
    install: install::Install,
) -> Result<BuildRow, String> {
    db::set_setting(db, install::BUILD_KEY, &install.version)?;
    install::set_chosen(chosen, install.clone())?;
    let status = index::status(db, &install.version);
    if !status.done {
        start_index(app, data.0.clone(), install.clone());
    }
    Ok(BuildRow {
        current: true,
        version: install.version,
        pages: status.pages,
        done: status.done,
        started: status.started,
    })
}

/// The port the localhost server took, for the landing page to show. Zero
/// when the server did not start.
#[tauri::command]
fn server_port(state: State<Port>) -> u16 {
    state.0
}

/// Who is signed in, for the greeting on the landing page. Empty where the
/// platform does not say, which the front-end greets without a name.
#[tauri::command]
fn user_name() -> String {
    user_name_of_this_machine()
}

/// The same name, without the app around it, for the localhost server.
pub fn user_name_of_this_machine() -> String {
    std::env::var("USERNAME")
        .or_else(|_| std::env::var("USER"))
        .unwrap_or_default()
}

/// Reads and parses one page, such as `nodes/sop/copytopoints`.
///
/// This never waits on the index. The first page a reader opens is parsed here
/// even if the background pass has not reached it yet.
#[tauri::command]
fn page(
    state: State<Db>,
    chosen: State<Arc<install::Chosen>>,
    cache: State<Arc<install::Cache>>,
    path: String,
) -> Result<PageView, PageError> {
    let db = state.0.lock().map_err(|e| PageError { missing: false, message: e.to_string() })?;
    let install = current(&db, &chosen, &cache)
        .map_err(|message| PageError { missing: false, message })?;
    drop(db);
    read_page(&install, &path)
}

/// Every page title in the current build.
///
/// The whole list goes to the front-end once and stays in memory there, which
/// is what makes the pick in the search field instant. 10,450 titles are small.
#[tauri::command]
fn titles(state: State<Db>, chosen: State<Arc<install::Chosen>>, cache: State<Arc<install::Cache>>) -> Result<Vec<Hit>, String> {
    let db = state.0.lock().map_err(|e| e.to_string())?;
    let build = current(&db, &chosen, &cache)?.version;
    all_titles(&db, &build)
}

/// The tooltip text for a set of pages, asked for in one call.
///
/// The index answers most of it. A page the background pass has not reached is
/// read and parsed here instead, so a tooltip on a fresh install says the same
/// thing it will say later — the front-end batches, so this is a handful of
/// pages at a time, not the whole viewport one at a time.
#[tauri::command]
fn meta(state: State<Db>, chosen: State<Arc<install::Chosen>>, cache: State<Arc<install::Cache>>, paths: Vec<String>) -> Result<Vec<Meta>, String> {
    let db = state.0.lock().map_err(|e| e.to_string())?;
    let install = current(&db, &chosen, &cache)?;
    read_meta(&db, &install, &paths)
}

/// The reader's own data: bookmarks, recents, settings. One connection, one
/// module (`library.rs`), so the window and Houdini's help pane read and
/// write the same rows — see spec: Local — User config shared between the
/// window and the help pane.
#[tauri::command]
fn recents(state: State<Db>) -> Result<Vec<library::Entry>, String> {
    let db = state.0.lock().map_err(|e| e.to_string())?;
    library::recents(&db)
}

#[tauri::command]
fn bookmarks(state: State<Db>) -> Result<Vec<library::Entry>, String> {
    let db = state.0.lock().map_err(|e| e.to_string())?;
    library::bookmarks(&db)
}

/// Flat arguments, not a struct: `backend.ts` sends the same shape whether it
/// invokes this in Tauri or asks `server.rs` for it over a query string, and a
/// query string has no nesting.
#[tauri::command]
fn record_visit(state: State<Db>, path: String, title: String, icon: Option<String>, at: i64) -> Result<i64, String> {
    let db = state.0.lock().map_err(|e| e.to_string())?;
    library::record_visit(&db, &library::Entry { id: None, path, title, icon, at })
}

#[tauri::command]
fn forget_recent(state: State<Db>, id: i64) -> Result<(), String> {
    let db = state.0.lock().map_err(|e| e.to_string())?;
    library::forget(&db, id)
}

#[tauri::command]
fn toggle_bookmark(state: State<Db>, path: String, title: String, icon: Option<String>, at: i64) -> Result<bool, String> {
    let db = state.0.lock().map_err(|e| e.to_string())?;
    library::toggle_bookmark(&db, &library::Entry { id: None, path, title, icon, at })
}

#[tauri::command]
fn get_setting(state: State<Db>, key: String) -> Result<Option<String>, String> {
    let db = state.0.lock().map_err(|e| e.to_string())?;
    Ok(db::get_setting(&db, &key))
}

#[tauri::command]
fn set_setting(state: State<Db>, key: String, value: String) -> Result<(), String> {
    let db = state.0.lock().map_err(|e| e.to_string())?;
    db::set_setting(&db, &key, &value)
}

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
fn search(state: State<Db>, chosen: State<Arc<install::Chosen>>, cache: State<Arc<install::Cache>>, query: String, limit: u32) -> Result<Vec<Hit>, String> {
    let db = state.0.lock().map_err(|e| e.to_string())?;
    let build = current(&db, &chosen, &cache)?.version;
    find(&db, &build, &query, limit)
}

/// How far the background pass has got. The front-end also gets this as an
/// `index` event, so this call is only for what it missed before it mounted.
#[tauri::command]
fn index_status(state: State<Db>, chosen: State<Arc<install::Chosen>>, cache: State<Arc<install::Cache>>) -> Result<index::Status, String> {
    let db = state.0.lock().map_err(|e| e.to_string())?;
    let build = current(&db, &chosen, &cache)?.version;
    Ok(index::status(&db, &build))
}

/// The install every command in this process reads, resolved once and cached
/// in `Chosen`. Never scans the disk itself — that is `install::Cache`'s job,
/// and only the version picker asks it to. The same `Chosen` and `Cache` the
/// localhost server reads, so the window and the F1 pane agree.
pub fn current(
    db: &rusqlite::Connection,
    chosen: &install::Chosen,
    cache: &install::Cache,
) -> Result<install::Install, String> {
    let wanted = db::get_setting(db, install::BUILD_KEY);
    let picked = install::resolve(chosen, cache, wanted.as_deref())?;
    // A fallback taken once is not taken again.
    if wanted.as_deref() != Some(picked.version.as_str()) {
        let _ = db::set_setting(db, install::BUILD_KEY, &picked.version);
    }
    Ok(picked)
}

/// Starts the background index pass for one build, reporting to the front-end
/// as it goes. The pass itself is `engine::index`; the events are this app's.
pub fn start_index(app: tauri::AppHandle, data: std::path::PathBuf, install: install::Install) {
    std::thread::spawn(move || {
        index::background_priority();
        let report = |status: index::Status| {
            let _ = app.emit("index", status);
        };
        if let Err(message) = index::run(&data, &install, &report) {
            let _ = app.emit("index-failed", message);
        }
    });
}

/// The same resolution, off an `AppHandle` — what the `hicon`/`himage` URI
/// scheme handlers get instead of a `State`.
fn current_for(app: &tauri::AppHandle) -> Result<install::Install, String> {
    let db = app.state::<Db>();
    let db = db.0.lock().map_err(|e| e.to_string())?;
    current(&db, &app.state::<Arc<install::Chosen>>(), &app.state::<Arc<install::Cache>>())
}

/// Serves the pictures and videos a help page shows, out of the install.
/// The front-end asks for `himage://localhost/images/shelf/copy.jpg` or
/// `himage://localhost/videos/tween.webm`; `assets::resolve` wrote that path.
fn asset_response(app: &tauri::AppHandle, request: Request<Vec<u8>>) -> Response<Vec<u8>> {
    let name = percent_decode(request.uri().path());
    let bytes = match current_for(app).and_then(|install| help::asset_layered(&install.help_roots(), &name)) {
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

/// The one media-type table. The `himage` handler serves pictures alone, where
/// anything unnamed is a JPEG; the localhost server also serves the built app,
/// and a browser refuses a module script that arrives as a picture.
pub(crate) fn media_type(name: &str) -> &'static str {
    match name.rsplit('.').next().unwrap_or_default() {
        "html" => "text/html; charset=utf-8",
        "js" => "text/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "json" => "application/json",
        "map" => "application/json",
        "woff2" => "font/woff2",
        "ico" => "image/x-icon",
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
fn icon_response(app: &tauri::AppHandle, request: Request<Vec<u8>>) -> Response<Vec<u8>> {
    let name = request.uri().path().trim_start_matches('/').to_string();
    let name = percent_decode(&name);
    match current_for(app).and_then(|install| help::icon_layered(&install.root, &install.packages, &name)) {
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
pub(crate) fn percent_decode(text: &str) -> String {
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

/// Whether the app was started with `--clean`: no index, no bookmarks, no
/// recents — what the first run looks like. The front end asks for this too,
/// because what the reader kept lives in the webview and not on disk here.
#[tauri::command]
fn clean_start() -> bool {
    std::env::args().any(|argument| argument == "--clean")
}

/// Throws away everything derived from the Houdini install and reads it again.
/// Nothing of the reader's is in these tables — see `db.rs` — so this costs a
/// background pass and no more.
#[tauri::command]
fn reset_index(
    app: tauri::AppHandle,
    data: State<DataDir>,
    state: State<Db>,
    chosen: State<Arc<install::Chosen>>,
    cache: State<Arc<install::Cache>>,
) -> Result<(), String> {
    let install = {
        let db = state.0.lock().map_err(|e| e.to_string())?;
        db.execute_batch("DELETE FROM pages; DELETE FROM pages_fts; DELETE FROM builds;")
            .map_err(|e| e.to_string())?;
        current(&db, &chosen, &cache)?
    };
    start_index(app, data.0.clone(), install);
    Ok(())
}

/// Throws away the reader's own work: bookmarks, recent pages, and every
/// setting — which includes the build they chose and the fact that they have
/// run the onboarding. The window that asked for it reloads into a first
/// launch.
#[tauri::command]
fn reset_user_data(state: State<Db>) -> Result<(), String> {
    let db = state.0.lock().map_err(|e| e.to_string())?;
    db.execute_batch(
        "DELETE FROM user.bookmarks; DELETE FROM user.recents; DELETE FROM user.settings;",
    )
    .map_err(|e| e.to_string())
}

/// Every Houdini release series on this machine, and whether F1 already points
/// here. The onboarding step draws this list.
#[tauri::command]
fn houdini_releases(state: State<Port>) -> Vec<hook::Release> {
    hook::releases(state.0)
}

/// Turns F1 towards this app for the named releases. Idempotent, so onboarding
/// can call it again without asking whether it ran before.
#[tauri::command]
fn hook_houdini(
    data: State<DataDir>,
    state: State<Port>,
    releases: Vec<String>,
) -> Result<Vec<String>, String> {
    hook::apply(&data.0, state.0, &releases)
}

/// Turns F1 towards this app for the release series the reader's own build
/// belongs to. What the onboarding step asks for: the reader chose a build on
/// the step before, and the hook follows that choice rather than every Houdini
/// on the machine.
#[tauri::command]
fn hook_current_build(
    data: State<DataDir>,
    state: State<Db>,
    port: State<Port>,
    chosen: State<Arc<install::Chosen>>,
    cache: State<Arc<install::Cache>>,
) -> Result<Vec<String>, String> {
    let install = {
        let db = state.0.lock().map_err(|e| e.to_string())?;
        current(&db, &chosen, &cache)?
    };
    hook::apply(&data.0, port.0, &[hook::series_of(&install.version)])
}

/// Puts back what F1 pointed at before this app touched it.
#[tauri::command]
fn unhook_houdini(data: State<DataDir>) -> Result<Vec<String>, String> {
    hook::revert(&data.0)
}

/// Runs the hook off the command line, the way an installer would: `--hook`
/// turns F1 towards this app for every release series on the machine, and
/// `--unhook` puts back what was there. Both take the port the server just
/// took, so the app is already serving when the preference names it.
fn hook_from_the_command_line(data: &std::path::Path, port: u16) {
    let asked = |flag: &str| std::env::args().any(|argument| argument == flag);
    let done = if asked("--unhook") {
        hook::revert(data)
    } else if asked("--hook") {
        let all: Vec<String> = hook::releases(port).into_iter().map(|r| r.release).collect();
        hook::apply(data, port, &all)
    } else {
        return;
    };
    match done {
        Ok(releases) => println!("houdini {}", releases.join(", ")),
        Err(reason) => eprintln!("{reason}"),
    }
}

/// The port the localhost server took, so the front-end can show it and the
/// hook commands can write it. Zero where the server did not start.
struct Port(u16);

pub fn run() {
    let builder = tauri::Builder::default();
    // One process owns the port Houdini's F1 points at, so a second launch
    // hands over to the first. It must be the first plugin. A debug build
    // skips it: `bun run app` must start even while the installed app sits in
    // the tray, and the two share an identifier.
    #[cfg(not(debug_assertions))]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _| tray::second_launch(app, argv)));
    builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(update::plugin())
        .register_uri_scheme_protocol("hicon", |ctx, request| icon_response(ctx.app_handle(), request))
        .register_uri_scheme_protocol("himage", |ctx, request| asset_response(ctx.app_handle(), request))
        .setup(|app| {
            // `--clean` runs the app as a machine that has never run it: its
            // own data directory beside the real one, which is left untouched.
            let data = if clean_start() {
                let fresh = std::env::temp_dir().join(format!("houdinimd-clean-{}", std::process::id()));
                std::fs::create_dir_all(&fresh)?;
                fresh
            } else {
                update::data_dir(app)?
            };
            app.manage(Db(Mutex::new(db::open(&data)?)));
            let chosen = Arc::new(install::Chosen::new());
            let cache = Arc::new(install::Cache::new());
            app.manage(chosen.clone());
            app.manage(cache.clone());
            app.manage(DataDir(data.clone()));
            {
                let db = app.state::<Db>();
                let db = db.0.lock().map_err(|e| e.to_string())?;
                install::load_picked(
                    &cache,
                    &db::get_setting(&db, install::PICKED_KEY).unwrap_or_default(),
                );
            }
            // The server is what makes F1 work, so it starts whether or not
            // any Houdini is hooked yet. A reader who never hooks one pays a
            // thread and a socket for it. It reads the same `chosen` and
            // `cache` as the window, not copies — see `server::start`.
            let port = server::start(data.clone(), chosen.clone(), cache.clone()).unwrap_or(0);
            app.manage(Port(port));
            hook_from_the_command_line(&data, port);
            if let Ok(install) = current_for(&app.handle().clone()) {
                start_index(app.handle().clone(), data, install);
            }
            tray::build(app)?;
            // The window is hidden in `tauri.conf.json`. This shows it, after
            // the update check has had its say.
            update::start(app.handle());
            Ok(())
        })
        .on_window_event(tray::on_window_event)
        .invoke_handler(tauri::generate_handler![
            installs,
            available_installs,
            current_install,
            select_install,
            add_install,
            server_port,
            user_name,
            clean_start,
            page,
            meta,
            titles,
            search,
            index_status,
            recents,
            bookmarks,
            record_visit,
            forget_recent,
            toggle_bookmark,
            get_setting,
            set_setting,
            houdini_releases,
            hook_houdini,
            hook_current_build,
            unhook_houdini,
            reset_index,
            reset_user_data
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
