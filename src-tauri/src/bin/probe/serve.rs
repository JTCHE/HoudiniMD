//! THE APP, MINUS THE WINDOW, SO THAT A BROWSER CAN DRIVE IT.
//!
//! The machine this repository is developed on has no interactive desktop: a
//! Tauri window opens with a handle of zero and nothing can click it. So the
//! front-end half of the harness drives the real bundle in a real browser
//! instead, and this server stands where Tauri's IPC normally stands.
//!
//! Everything it answers with is the SAME function the `#[tauri::command]`
//! wrappers call — `read_page`, `all_titles`, `find`, `help::asset`. No dump
//! file, no fixture, no second parser. What the browser measures is the app's
//! own work plus one localhost round trip, and the round trip is measured
//! separately (`ipc.overhead`) so it can be taken off.
//!
//! It serves `dist/` as well, with one script tag inserted that fills in
//! `window.__TAURI_INTERNALS__`. That is the whole difference between the
//! bundle a reader installs and the bundle the harness drives.

use std::io::{BufRead, BufReader, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use houdinimd_lib::{all_titles, db, find, help, index, install, library, read_page};
use rusqlite::Connection;

/// What `invoke` becomes in the browser. `page` and the rest keep their names,
/// so nothing in `src/` knows it is being measured.
const STUB: &str = r#"<script>
window.__TAURI_INTERNALS__ = {
  // What the window API reads before it asks anything. Without it the app
  // throws on the first render instead of drawing.
  metadata: {
    currentWindow: { label: "main" },
    currentWebview: { windowLabel: "main", label: "main" },
  },
  async invoke(command, args) {
    // There is no window here and no event loop behind it: the title bar
    // draws, and its buttons do nothing.
    if (command.startsWith("plugin:window|")) return command.endsWith("|is_maximized") ? false : null;
    if (command.startsWith("plugin:event|")) return 0;
    const at = performance.now();
    const body = new URLSearchParams();
    for (const [key, value] of Object.entries(args ?? {})) {
      body.set(key, Array.isArray(value) ? value.join(",") : String(value));
    }
    const response = await fetch(`/api/${command}?${body}`);
    const text = await response.text();
    (window.__ipc ??= []).push({ command, ms: performance.now() - at });
    if (!response.ok) throw JSON.parse(text);
    return JSON.parse(text);
  },
  convertFileSrc(path, scheme) {
    return `/${scheme === "hicon" ? "icon" : "asset"}/${path}`;
  },
  transformCallback(callback) {
    const name = `_cb_${Math.random().toString(36).slice(2)}`;
    window[name] = callback;
    return name;
  },
};
// The event plugin keeps its own global, and `listen()` calls into it when a
// component unmounts. Without it every unlisten throws, and the console fills
// with a failure the real runtime never has.
window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
</script>
"#;

struct Serve {
    db: Mutex<Connection>,
    install: install::Install,
    dist: PathBuf,
}

/// Runs until killed. `dist` is the built front-end; build it first.
pub fn run(port: u16, data: &Path, dist: PathBuf) -> Result<(), String> {
    let install = install::find(&[])
        .into_iter()
        .next()
        .ok_or("no Houdini install on this machine")?;
    let mut connection = db::open(data)?;
    // The browser cannot search a build that was never indexed, and this
    // server keeps its own copy of the index. Filling it takes a couple of
    // seconds the first time and nothing after that.
    if !index::status(&connection, &install.version).done {
        eprintln!("indexing {} for the harness...", install.version);
        index::pass(&mut connection, &install, &|_| {})?;
    }
    let state = Serve {
        db: Mutex::new(connection),
        install,
        dist,
    };
    let listener = TcpListener::bind(("127.0.0.1", port)).map_err(|e| e.to_string())?;
    // The harness waits for this line before it opens a browser.
    println!("listening on http://127.0.0.1:{port}");
    std::io::stdout().flush().ok();
    for stream in listener.incoming().flatten() {
        // One request at a time, on purpose: two measurements that overlap are
        // two measurements of each other.
        //
        // A browser holds its connection open after the answer, and this loop
        // would then wait on a socket that sends nothing while every other
        // request queues behind it. The timeout gives the loop back.
        let _ = stream.set_read_timeout(Some(std::time::Duration::from_secs(5)));
        if let Err(reason) = answer(&state, stream) {
            eprintln!("{reason}");
        }
    }
    Ok(())
}

fn answer(state: &Serve, mut stream: TcpStream) -> Result<(), String> {
    let mut reader = BufReader::new(stream.try_clone().map_err(|e| e.to_string())?);
    let mut line = String::new();
    if reader.read_line(&mut line).map_err(|e| e.to_string())? == 0 {
        return Ok(());
    }
    // The headers are read and thrown away; nothing here answers on one.
    let mut header = String::new();
    while reader.read_line(&mut header).map_err(|e| e.to_string())? > 2 {
        header.clear();
    }
    let target = line.split_whitespace().nth(1).unwrap_or("/").to_string();
    let (path, query) = target.split_once('?').unwrap_or((target.as_str(), ""));
    let path = decode(path);

    let (status, kind, body) = route(state, &path, query);
    let head = format!(
        "HTTP/1.1 {status}\r\nContent-Type: {kind}\r\nContent-Length: {}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n",
        body.len()
    );
    stream.write_all(head.as_bytes()).map_err(|e| e.to_string())?;
    stream.write_all(&body).map_err(|e| e.to_string())?;
    stream.flush().map_err(|e| e.to_string())
}

fn route(state: &Serve, path: &str, query: &str) -> (u16, &'static str, Vec<u8>) {
    if let Some(command) = path.strip_prefix("/api/") {
        return command_response(state, command, query);
    }
    if let Some(name) = path.strip_prefix("/asset/") {
        return match help::asset(&state.install.help, name) {
            Ok(bytes) => (200, media_type(name), bytes),
            Err(reason) => (404, "text/plain", reason.into_bytes()),
        };
    }
    if let Some(name) = path.strip_prefix("/icon/") {
        return match help::icon(&state.install.root, name) {
            Ok(bytes) => (200, "image/svg+xml", bytes),
            Err(reason) => (404, "text/plain", reason.into_bytes()),
        };
    }
    file(state, path)
}

fn command_response(state: &Serve, command: &str, query: &str) -> (u16, &'static str, Vec<u8>) {
    let json = "application/json";
    let value = match command {
        // The event plugin has nothing behind it here. The front-end listens
        // for `index` progress; the harness always drives a build that is
        // already indexed, so there is no progress to report and a listener
        // that never fires is the truthful answer.
        _ if command.starts_with("plugin:") => Ok("0".to_string()),
        "installs" => serde_json::to_string(&install::find(&[])).map_err(|e| e.to_string()),
        "user_name" => serde_json::to_string(&whoami()).map_err(|e| e.to_string()),
        // The harness always runs on the store the scene seeded, so the
        // browser build never starts clean.
        "clean_start" => Ok("false".to_string()),
        "index_status" => {
            let db = state.db.lock().map_err(|e| e.to_string()).unwrap();
            serde_json::to_string(&index::status(&db, &state.install.version))
                .map_err(|e| e.to_string())
        }
        "titles" => {
            let db = state.db.lock().unwrap();
            all_titles(&db, &state.install.version)
                .and_then(|hits| serde_json::to_string(&hits).map_err(|e| e.to_string()))
        }
        "search" => {
            let db = state.db.lock().unwrap();
            let limit = param(query, "limit").and_then(|v| v.parse().ok()).unwrap_or(6);
            find(
                &db,
                &state.install.version,
                &param(query, "query").unwrap_or_default(),
                limit,
            )
            .and_then(|hits| serde_json::to_string(&hits).map_err(|e| e.to_string()))
        }
        "page" => {
            let path = param(query, "path").unwrap_or_default();
            match read_page(&state.install, &path) {
                Ok(page) => serde_json::to_string(&page).map_err(|e| e.to_string()),
                Err(error) => {
                    let body = serde_json::to_string(&error).unwrap_or_default();
                    return (404, json, body.into_bytes());
                }
            }
        }
        // `meta` takes a list, which the stub joins with commas. It is the one
        // command whose arguments are not one value.
        "meta" => {
            let db = state.db.lock().unwrap();
            let build = &state.install.version;
            let asked = param(query, "paths").unwrap_or_default();
            let mut out = Vec::new();
            for path in asked.split(',').filter(|p| !p.is_empty()) {
                let row = db
                    .query_row(
                        "SELECT title, summary, icon FROM pages WHERE build = ?1 AND path = ?2",
                        rusqlite::params![build, path],
                        |row| {
                            Ok((
                                row.get::<_, String>(0)?,
                                row.get::<_, Option<String>>(1)?,
                                row.get::<_, Option<String>>(2)?,
                            ))
                        },
                    )
                    .ok();
                if let Some((title, summary, icon)) = row {
                    out.push(
                        serde_json::json!({ "path": path, "title": title, "summary": summary, "icon": icon }),
                    );
                }
            }
            serde_json::to_string(&out).map_err(|e| e.to_string())
        }
        // The build the app reads. The harness stands up one install, so the
        // picker has one row and it is always the current one.
        "current_install" => serde_json::to_string(&state.install).map_err(|e| e.to_string()),
        "available_installs" => serde_json::to_string(&serde_json::json!([{
            "version": state.install.version,
            "pages": index::status(&state.db.lock().unwrap(), &state.install.version).pages,
            "done": true,
            "started": true,
            "current": true,
        }]))
        .map_err(|e| e.to_string()),
        // Nothing to switch to, so this is the build it already reads.
        "select_install" => serde_json::to_string(&state.install).map_err(|e| e.to_string()),
        // No localhost server stands behind the harness, so nothing is drawn
        // for it. Zero is what the front-end reads as "no server".
        "server_port" => Ok("0".to_string()),
        "recents" => {
            let db = state.db.lock().unwrap();
            library::recents(&db).and_then(|rows| serde_json::to_string(&rows).map_err(|e| e.to_string()))
        }
        "bookmarks" => {
            let db = state.db.lock().unwrap();
            library::bookmarks(&db).and_then(|rows| serde_json::to_string(&rows).map_err(|e| e.to_string()))
        }
        "record_visit" | "toggle_bookmark" => {
            let db = state.db.lock().unwrap();
            let entry = library::Entry {
                id: None,
                path: param(query, "path").unwrap_or_default(),
                title: param(query, "title").unwrap_or_default(),
                icon: param(query, "icon"),
                at: 0,
            };
            if command == "record_visit" {
                library::record_visit(&db, &entry).map(|()| "null".to_string())
            } else {
                library::toggle_bookmark(&db, &entry)
                    .map(|kept| kept.to_string())
            }
        }
        "forget_recent" => {
            let db = state.db.lock().unwrap();
            library::forget(&db, param(query, "id").and_then(|v| v.parse().ok()).unwrap_or(-1))
                .map(|()| "null".to_string())
        }
        "get_setting" => {
            let db = state.db.lock().unwrap();
            serde_json::to_string(&db::get_setting(&db, &param(query, "key").unwrap_or_default()))
                .map_err(|e| e.to_string())
        }
        "set_setting" => {
            let db = state.db.lock().unwrap();
            db::set_setting(
                &db,
                &param(query, "key").unwrap_or_default(),
                &param(query, "value").unwrap_or_default(),
            )
            .map(|()| "null".to_string())
        }
        other => Err(format!("no command {other}")),
    };
    match value {
        Ok(body) => (200, json, body.into_bytes()),
        Err(reason) => (500, "text/plain", reason.into_bytes()),
    }
}

/// A file out of `dist/`. Anything that is not a file is the single page,
/// because the front-end routes on the hash and every route is `index.html`.
fn file(state: &Serve, path: &str) -> (u16, &'static str, Vec<u8>) {
    let wanted = state.dist.join(path.trim_start_matches('/'));
    if wanted.is_file() && wanted.starts_with(&state.dist) {
        let kind = media_type(path);
        return match std::fs::read(&wanted) {
            Ok(bytes) => (200, kind, bytes),
            Err(e) => (500, "text/plain", e.to_string().into_bytes()),
        };
    }
    let index = state.dist.join("index.html");
    let Ok(mut html) = std::fs::read_to_string(&index) else {
        return (
            404,
            "text/plain",
            format!("no {} — run `bun run build` first", index.display()).into_bytes(),
        );
    };
    html = match html.split_once("</head>") {
        Some((head, rest)) => format!("{head}{STUB}</head>{rest}"),
        None => format!("{STUB}{html}"),
    };
    (200, "text/html; charset=utf-8", html.into_bytes())
}

fn param(query: &str, name: &str) -> Option<String> {
    query
        .split('&')
        .filter_map(|pair| pair.split_once('='))
        .find(|(key, _)| *key == name)
        .map(|(_, value)| decode(&value.replace('+', " ")))
}

fn media_type(name: &str) -> &'static str {
    match name.rsplit('.').next().unwrap_or_default() {
        "html" => "text/html; charset=utf-8",
        "js" | "mjs" => "text/javascript",
        "css" => "text/css",
        "json" => "application/json",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "gif" => "image/gif",
        "webm" => "video/webm",
        "mp4" => "video/mp4",
        "woff2" => "font/woff2",
        "woff" => "font/woff",
        _ => "image/jpeg",
    }
}

fn decode(text: &str) -> String {
    let bytes = text.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match (bytes[i], bytes.get(i + 1), bytes.get(i + 2)) {
            (b'%', Some(a), Some(b)) => {
                let pair = format!("{}{}", *a as char, *b as char);
                match u8::from_str_radix(&pair, 16) {
                    Ok(byte) => {
                        out.push(byte);
                        i += 3;
                    }
                    Err(_) => {
                        out.push(bytes[i]);
                        i += 1;
                    }
                }
            }
            _ => {
                out.push(bytes[i]);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// The same answer the app's `user_name` command gives, so the greeting on
/// the landing page reads here the way it reads in the window.
fn whoami() -> String {
    std::env::var("USERNAME")
        .or_else(|_| std::env::var("USER"))
        .unwrap_or_default()
}
