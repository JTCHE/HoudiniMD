//! Reads help pages and icons out of the zips in a Houdini install.
//! Nothing is extracted to disk. See spec: Local — Image and Asset Serving.

use std::collections::HashMap;
use std::fs::File;
use std::io::{BufReader, Read};
use std::path::{Path, PathBuf};
use std::sync::{LazyLock, Mutex};

/// The archives this process has opened, kept open.
///
/// `icons.zip` holds about ten thousand entries. Opening it means reading and
/// parsing that whole central directory, and the sidebar asks for a dozen
/// icons in the time it takes to draw one list — so the first row of a list
/// used to cost as much as all the rest of it together. The archive is parsed
/// once and every later read seeks inside it.
static ARCHIVES: LazyLock<Mutex<HashMap<PathBuf, zip::ZipArchive<BufReader<File>>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

/// Why a page could not be read. `Missing` is the reader's problem — this build
/// holds no such page — and the front-end draws the not-found page for it.
#[derive(Debug)]
pub enum PageError {
    Missing,
    Unreadable(String),
}

/// `nodes/sop/box` lives in `nodes.zip` as `sop/box.txt`. A path that names a
/// directory, such as `vex/contexts`, reads that directory's `index.txt` — the
/// help links to both forms.
///
/// Not every section is a zip. `examples`, `licenses`, `heightfields` and six
/// more ship as plain folders beside the zips, about 1,220 pages the reader
/// could not reach at all while this only opened archives.
/// See spec: Local — Pages missing from the app index.
pub fn page(help: &Path, path: &str) -> Result<String, PageError> {
    let path = path.trim_matches('/');
    if path.is_empty() {
        return Err(PageError::Missing);
    }
    // `network/` names the section's own index page, and the help writes that
    // form as often as it writes `network/index`.
    let (section, rest) = path.split_once('/').unwrap_or((path, "index"));
    if rest.contains("..") {
        return Err(PageError::Missing);
    }
    let names = [format!("{rest}.txt"), format!("{rest}/index.txt")];

    let zip = help.join(format!("{section}.zip"));
    let mut found = None;
    if zip.is_file() {
        for name in &names {
            found = read(&zip, name).map_err(PageError::Unreadable)?;
            if found.is_some() {
                break;
            }
        }
    }
    let folder = help.join(section);
    if found.is_none() && folder.is_dir() {
        found = names.iter().find_map(|name| std::fs::read(folder.join(name)).ok());
    }
    let bytes = found.ok_or(PageError::Missing)?;
    String::from_utf8(bytes).map_err(|e| PageError::Unreadable(e.to_string()))
}

/// `SOP/box.svg` lives in `config/Icons/icons.zip` under the same name.
pub fn icon(install_root: &Path, name: &str) -> Result<Vec<u8>, String> {
    let zip = install_root
        .join("houdini")
        .join("config")
        .join("Icons")
        .join("icons.zip");
    found(read(&zip, name.trim_matches('/')), &format!("no icon {name}"))
}

/// Reads one asset, named the way `assets::resolve` writes it.
///
/// `images/shelf/copy.jpg` is an entry in `images.zip`. `videos/tween.webm` is
/// a loose file: the install ships 958 of them beside the zips, not inside one.
pub fn asset(help: &Path, path: &str) -> Result<Vec<u8>, String> {
    let absent = format!("no asset {path}");
    let Some((store, name)) = path.trim_matches('/').split_once('/') else {
        return Err(absent);
    };
    match store {
        "images" => found(read(&help.join("images.zip"), name), &absent),
        "videos" => video(help, name).ok_or(absent),
        _ => Err(absent),
    }
}

/// A video is read whole. The `himage` handler serves the range the player
/// asked for out of these bytes; the largest file in the install is 6.3 MB.
fn video(help: &Path, name: &str) -> Option<Vec<u8>> {
    if name.contains("..") {
        return None;
    }
    std::fs::read(help.join("videos").join(name)).ok()
}

fn found(read: Result<Option<Vec<u8>>, String>, absent: &str) -> Result<Vec<u8>, String> {
    read.map_err(|_| absent.to_string())?
        .ok_or_else(|| absent.to_string())
}

/// `Ok(None)` means the archive holds no such entry. `Err` means the archive
/// itself could not be read.
fn read(zip: &Path, name: &str) -> Result<Option<Vec<u8>>, String> {
    if name.contains("..") {
        return Err("a path cannot leave its archive".into());
    }
    let mut open = ARCHIVES.lock().map_err(|e| e.to_string())?;
    if !open.contains_key(zip) {
        let file = File::open(zip).map_err(|e| format!("{}: {e}", zip.display()))?;
        let archive = zip::ZipArchive::new(BufReader::new(file)).map_err(|e| e.to_string())?;
        open.insert(zip.to_path_buf(), archive);
    }
    let archive = open.get_mut(zip).expect("just inserted");
    let Ok(mut entry) = archive.by_name(name) else {
        return Ok(None);
    };
    let mut bytes = Vec::with_capacity(entry.size() as usize);
    entry.read_to_end(&mut bytes).map_err(|e| e.to_string())?;
    Ok(Some(bytes))
}
