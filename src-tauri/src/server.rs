//! Serves the app over HTTP, so F1 in Houdini opens it.
//!
//! Houdini's help window is QtWebEngine, a plain browser. It knows nothing of
//! the `hicon:` and `himage:` schemes the Tauri webview answers: a page that
//! names them shows a broken image and never asks the network. Tested with all
//! three side by side. So everything here is ordinary HTTP, and the front-end
//! asks `/api` for what it asks the desktop shell for through `invoke`.
//!
//! The server has its own database connection. A search in the help pane must
//! not wait on a search in the app window.

use std::net::{Ipv4Addr, SocketAddrV4, TcpListener};
use std::path::PathBuf;
use std::sync::Mutex;

use include_dir::{Dir, include_dir};
use rusqlite::Connection;
use tiny_http::{Header, Response, Server};

use crate::{db, help, index, install};

/// The built front-end, inside the binary, so the server has no files to find.
static APP: Dir<'_> = include_dir!("$CARGO_MANIFEST_DIR/../dist");

/// Houdini's own help server takes 48626 and walks upward from there, so start
/// clear of it.
pub const FIRST_PORT: u16 = 48800;

/// How many ports to try before giving up.
const TRIES: u16 = 20;

/// Starts the server on the first free port and answers on a thread of its own.
/// Returns the port it took, which is the port the hook writes into
/// `misc.externalhelpurl.val`.
pub fn start(data: PathBuf) -> Result<u16, String> {
    let (listener, port) = bind()?;
    let server = Server::from_listener(listener, None).map_err(|e| e.to_string())?;
    std::thread::spawn(move || {
        // A cook must always win the core, the same as the index pass.
        index::background_priority();
        let db = db::open(&data).map(Mutex::new);
        for request in server.incoming_requests() {
            let (status, body, kind) = answer(db.as_ref(), request.url());
            // What Houdini asked for, and what it got. Houdini's help window
            // says nothing when a page fails, so without this there is no way
            // to tell a wrong path from a wrong answer.
            #[cfg(debug_assertions)]
            eprintln!("{status} {} {}", request.method(), request.url());
            let header = Header::from_bytes(&b"Content-Type"[..], kind.as_bytes())
                .expect("a static media type is a valid header");
            let response = Response::from_data(body)
                .with_status_code(status)
                .with_header(header);
            let _ = request.respond(response);
        }
    });
    Ok(port)
}

/// The first free port at or above `FIRST_PORT`. Bound to the network as well
/// as to loopback: a phone on the same network is the only phone access the
/// local app has, and the hook still writes `http://localhost:<port>/`.
fn bind() -> Result<(TcpListener, u16), String> {
    for port in FIRST_PORT..FIRST_PORT + TRIES {
        let address = SocketAddrV4::new(Ipv4Addr::UNSPECIFIED, port);
        if let Ok(listener) = TcpListener::bind(address) {
            return Ok((listener, port));
        }
    }
    Err(format!(
        "no free port between {FIRST_PORT} and {}",
        FIRST_PORT + TRIES
    ))
}

type Answer = (u16, Vec<u8>, &'static str);

/// One request, answered: status, body, media type.
fn answer(db: Result<&Mutex<Connection>, &String>, url: &str) -> Answer {
    let (path, query) = url.split_once('?').unwrap_or((url, ""));
    let path = crate::percent_decode(path);

    if let Some(name) = path.strip_prefix("/hicon/") {
        return match current().and_then(|install| help::icon(&install.root, name)) {
            Ok(bytes) => (200, bytes, "image/svg+xml"),
            Err(reason) => not_found(reason),
        };
    }
    if let Some(name) = path.strip_prefix("/himage/") {
        return match current().and_then(|install| help::asset(&install.help, name)) {
            Ok(bytes) => (200, bytes, crate::media_type(name)),
            Err(reason) => not_found(reason),
        };
    }
    if let Some(command) = path.strip_prefix("/api/") {
        return api(db, command, query);
    }
    file(&path)
}

/// The same answers the desktop shell gives through `invoke`, so the front-end
/// has one set of calls and not two. `backend.ts` picks which door to knock on.
fn api(db: Result<&Mutex<Connection>, &String>, command: &str, query: &str) -> Answer {
    let call = parse(query);
    // Every command that reads the index needs the build the pages belong to.
    let json = match command {
        "installs" => serde_json::to_vec(&install::find()),
        "user_name" => serde_json::to_vec(&crate::user_name_of_this_machine()),
        "clean_start" => serde_json::to_vec(&false),
        "page" => match current().and_then(|i| crate::read_page(&i, &call.path).map_err(|e| e.message)) {
            Ok(page) => serde_json::to_vec(&page),
            Err(reason) => return not_found(reason),
        },
        "titles" | "search" | "meta" | "index_status" => return indexed(db, command, &call),
        _ => return not_found(format!("no command {command}")),
    };
    match json {
        Ok(body) => (200, body, "application/json"),
        Err(reason) => (500, reason.to_string().into_bytes(), "text/plain"),
    }
}

/// The commands that read the index. Held apart because they all need the same
/// two things first: the connection, and the build.
fn indexed(db: Result<&Mutex<Connection>, &String>, command: &str, call: &Call) -> Answer {
    let db = match db {
        Ok(db) => db,
        Err(reason) => return (500, reason.clone().into_bytes(), "text/plain"),
    };
    let build = match current() {
        Ok(install) => install.version,
        Err(reason) => return not_found(reason),
    };
    let db = match db.lock() {
        Ok(db) => db,
        Err(_) => return (500, b"the index is unreadable".to_vec(), "text/plain"),
    };
    let json = match command {
        "titles" => crate::all_titles(&db, &build).and_then(|hits| ser(&hits)),
        "search" => crate::find(&db, &build, &call.query, call.limit).and_then(|hits| ser(&hits)),
        "meta" => crate::read_meta(&db, &build, &call.paths).and_then(|meta| ser(&meta)),
        _ => ser(&index::status(&db, &build)),
    };
    match json {
        Ok(body) => (200, body, "application/json"),
        Err(reason) => (500, reason.into_bytes(), "text/plain"),
    }
}

fn ser<T: serde::Serialize>(value: &T) -> Result<Vec<u8>, String> {
    serde_json::to_vec(value).map_err(|e| e.to_string())
}

fn not_found(reason: String) -> Answer {
    (404, reason.into_bytes(), "text/plain")
}

/// One built file, or the app itself for a page path.
///
/// F1 on the Box SOP asks for `/nodes/sop/box`, which is not a file: the app
/// routes it once it is running, so every page path is answered with the app.
/// A name with a dot in it is a file that is missing, not a page — `favicon.ico`
/// is the one Houdini asks for after every navigation, and answering it with
/// the app would draw a broken icon.
fn file(path: &str) -> Answer {
    let name = path.trim_start_matches('/');
    if let Some(found) = APP.get_file(name) {
        return (200, found.contents().to_vec(), crate::media_type(name));
    }
    if name.rsplit('/').next().unwrap_or_default().contains('.') {
        return not_found(format!("no {name} in this build"));
    }
    match APP.get_file("index.html") {
        Some(index) => (200, index.contents().to_vec(), "text/html; charset=utf-8"),
        None => (
            500,
            b"the app was not built into this binary".to_vec(),
            "text/plain",
        ),
    }
}

/// What the front-end asked the command for.
#[derive(Default)]
struct Call {
    path: String,
    query: String,
    limit: u32,
    /// `meta` asks about a batch of links at once, comma separated.
    paths: Vec<String>,
}

fn parse(query: &str) -> Call {
    let mut call = Call {
        limit: 20,
        ..Call::default()
    };
    for pair in query.split('&') {
        let Some((key, value)) = pair.split_once('=') else {
            continue;
        };
        let value = crate::percent_decode(&value.replace('+', " "));
        match key {
            "path" => call.path = value,
            "query" => call.query = value,
            "limit" => call.limit = value.parse().unwrap_or(20),
            "paths" => call.paths = value.split(',').map(str::to_string).collect(),
            _ => {}
        }
    }
    call
}

fn current() -> Result<install::Install, String> {
    install::find()
        .into_iter()
        .next()
        .ok_or_else(|| "no Houdini install found on this machine".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_query_names_what_the_command_needs() {
        let call = parse("path=nodes%2Fsop%2Fbox&limit=8");
        assert_eq!(call.path, "nodes/sop/box");
        assert_eq!(call.limit, 8);
    }

    #[test]
    fn a_batch_of_links_comes_as_one_list() {
        let call = parse("paths=nodes/sop/box,vex/functions/noise");
        assert_eq!(call.paths, ["nodes/sop/box", "vex/functions/noise"]);
    }

    #[test]
    fn a_search_keeps_its_spaces() {
        assert_eq!(parse("query=copy+to+points").query, "copy to points");
    }

    #[test]
    fn a_help_path_gets_the_app_that_routes_it() {
        // What F1 on the Box SOP asks for. Anything else leaves Houdini's pane
        // blank.
        let (status, _, kind) = file("/nodes/sop/box");
        assert_eq!(status, 200);
        assert_eq!(kind, "text/html; charset=utf-8");
    }

    #[test]
    fn a_missing_file_stays_missing() {
        // Houdini asks for this after every navigation. Answering it with the
        // app would draw a broken icon.
        assert_eq!(file("/favicon.ico").0, 404);
    }

    #[test]
    fn the_root_is_the_app_itself() {
        assert_eq!(file("/").0, 200);
    }
}
