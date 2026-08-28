mod help;
mod install;

use serde::Serialize;
use tauri::http::{Request, Response};

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
    let parsed = wiki::parse(&source);
    let prop = |name: &str| wiki::model::prop(&parsed.props, name).map(str::to_string);
    let name = match prop("version") {
        Some(version) => format!("{} {version}", parsed.title_text),
        None => parsed.title_text.clone(),
    };
    Ok(PageView {
        path,
        name,
        node_type: node_type(&parsed.props),
        icon: prop("icon").map(|icon| format!("{icon}.svg")),
        since: prop("since"),
        summary: parsed.summary.as_ref().map(|s| wiki::inline::plain(s)),
        markdown: wiki::markdown::blocks(&parsed.blocks, 1),
        version: install.version,
    })
}

/// The header reads "Geometry node", not "sop". The network a node lives in is
/// the only thing that names its kind, so the label is derived from it.
fn node_type(props: &wiki::Props) -> Option<String> {
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

fn current() -> Result<install::Install, String> {
    install::find()
        .into_iter()
        .next()
        .ok_or_else(|| "no Houdini install found on this machine".to_string())
}

/// Serves the figures a help page shows, straight out of `images.zip`.
/// The front-end asks for `himage://localhost/shelf/copy.jpg`.
fn image_response(request: Request<Vec<u8>>) -> Response<Vec<u8>> {
    let name = percent_decode(request.uri().path());
    match current().and_then(|install| help::image(&install.help, &name)) {
        Ok(bytes) => Response::builder()
            .header("Content-Type", media_type(&name))
            .header("Cache-Control", "max-age=31536000")
            .body(bytes)
            .unwrap(),
        Err(reason) => Response::builder()
            .status(404)
            .body(reason.into_bytes())
            .unwrap(),
    }
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
        .register_uri_scheme_protocol("himage", |_app, request| image_response(request))
        .invoke_handler(tauri::generate_handler![installs, page])
        .run(tauri::generate_context!())
        .expect("error while running the application");
}
