//! Points Houdini's F1 at this app, and takes the pointer back.
//!
//! Houdini reads the external help server from two preferences. There is no
//! environment variable for either, and a Houdini package cannot set a
//! preference, so `houdini.pref` is the only way in. That file belongs to the
//! reader, so every write here is recorded and reversible.
//! See spec: Local — Localhost Server and Houdini Hook.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

/// The keys Houdini reads. Verified on 22.0.368 against `libFUSE.dll` and
/// `help.zip/central.txt`.
const USE_EXTERNAL: &str = "misc.useexternalhelp.val";
const EXTERNAL_URL: &str = "misc.externalhelpurl.val";

/// What this app wrote, so it can put back exactly what was there.
const RECORD: &str = "houdini-hook.json";

/// One Houdini release series, which is what a preferences directory covers.
/// `22.0.368` and `22.0.401` share `houdini22.0`, so the hook is per series and
/// never per build.
#[derive(Debug, Clone, Serialize)]
pub struct Release {
    /// `22.0`, taken from the directory name.
    pub release: String,
    pub prefs: PathBuf,
    /// The help URL this release points at now, if it points anywhere.
    pub url: Option<String>,
    /// Whether this release uses an external help server at all.
    pub external: bool,
    /// Whether the URL is this app's server on `port`.
    pub ours: bool,
}

/// What one release looked like before the hook touched it. A key that was
/// absent is `None`, and reverting removes it again rather than writing a
/// default the reader never chose.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct Previous {
    prefs: PathBuf,
    use_external: Option<String>,
    url: Option<String>,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct Record {
    port: u16,
    releases: BTreeMap<String, Previous>,
}

/// Every release series with a preferences directory on this machine, newest
/// first. A directory with no `houdini.pref` still counts: Houdini writes that
/// file on exit, and the hook can create it.
pub fn releases(port: u16) -> Vec<Release> {
    let mut found: Vec<Release> = Vec::new();
    let Some(parent) = prefs_root() else {
        return found;
    };
    let Ok(entries) = std::fs::read_dir(&parent) else {
        return found;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let Some(release) = series(&path) else {
            continue;
        };
        let text = read(&path.join("houdini.pref")).unwrap_or_default();
        let url = value(&text, EXTERNAL_URL);
        let external = value(&text, USE_EXTERNAL).as_deref() == Some("1");
        found.push(Release {
            ours: url.as_deref().is_some_and(|url| is_ours(url, port)),
            release,
            prefs: path,
            url,
            external,
        });
    }
    found.sort_by(|a, b| parts(&b.release).cmp(&parts(&a.release)));
    found
}

/// Turns F1 towards this app for the named releases, and records what it
/// replaced. Applying twice writes the same file, so the installer can run it
/// on every launch without asking whether it ran before.
pub fn apply(data: &Path, port: u16, wanted: &[String]) -> Result<Vec<String>, String> {
    let mut record = load(data);
    record.port = port;
    // The trailing slash is not decoration. Houdini joins the help path onto
    // this string, and without it the pane only ever asks for the base URL.
    let url = format!("http://localhost:{port}/");
    let mut changed = Vec::new();

    for release in releases(port) {
        if !wanted.is_empty() && !wanted.contains(&release.release) {
            continue;
        }
        if running(&release.release) {
            return Err(format!(
                "Houdini {} is open. It writes houdini.pref when it exits, which would undo this. Close it first.",
                release.release
            ));
        }
        let file = release.prefs.join("houdini.pref");
        let before = read(&file).unwrap_or_default();

        // Record the first state this app ever saw, never a later one, or a
        // second apply would record its own writing as the reader's choice.
        record.releases.entry(release.release.clone()).or_insert_with(|| Previous {
            prefs: release.prefs.clone(),
            use_external: value(&before, USE_EXTERNAL),
            url: value(&before, EXTERNAL_URL),
        });

        let after = set(&set(&before, USE_EXTERNAL, "1"), EXTERNAL_URL, &quoted(&url));
        if after != before {
            backup(&file)?;
            write(&file, &after)?;
            changed.push(release.release);
        }
    }

    save(data, &record)?;
    Ok(changed)
}

/// Puts back what was there before the first apply, then forgets the release.
/// A key the reader never had is removed, not set to a default.
pub fn revert(data: &Path) -> Result<Vec<String>, String> {
    let mut record = load(data);
    let mut restored = Vec::new();

    for (release, previous) in std::mem::take(&mut record.releases) {
        if running(&release) {
            record.releases.insert(release.clone(), previous);
            return Err(format!(
                "Houdini {release} is open. Close it first, or it will write the old value back."
            ));
        }
        let file = previous.prefs.join("houdini.pref");
        let before = read(&file).unwrap_or_default();
        let after = apply_previous(&before, &previous);
        if after != before {
            write(&file, &after)?;
            restored.push(release);
        }
    }

    save(data, &record)?;
    Ok(restored)
}

fn apply_previous(text: &str, previous: &Previous) -> String {
    let text = match &previous.use_external {
        Some(value) => set(text, USE_EXTERNAL, value),
        None => remove(text, USE_EXTERNAL),
    };
    match &previous.url {
        Some(value) => set(&text, EXTERNAL_URL, value),
        None => remove(&text, EXTERNAL_URL),
    }
}

/// A URL this app serves. The port can move, so the host decides, not the
/// whole string — a reader who kept an older port still counts as hooked.
fn is_ours(url: &str, port: u16) -> bool {
    let url = url.trim_matches('"');
    url.starts_with(&format!("http://localhost:{port}"))
        || url.starts_with(&format!("http://127.0.0.1:{port}"))
}

/// Reads `key := value;` out of a preferences file. Quotes stay on, because
/// that is how the value must go back.
fn value(text: &str, key: &str) -> Option<String> {
    text.lines()
        .find_map(|line| line.trim().strip_prefix(key)?.trim().strip_prefix(":=").map(str::trim))
        .map(|value| value.trim_end_matches(';').trim().to_string())
}

/// Writes one key, keeping every other line and the file's own line ending.
/// Houdini writes the file sorted, so a new key goes in sorted position.
fn set(text: &str, key: &str, value: &str) -> String {
    let end = if text.contains("\r\n") { "\r\n" } else { "\n" };
    let line = format!("{key} := {value};");
    let mut out: Vec<String> = Vec::new();
    let mut written = false;

    for existing in text.lines() {
        if existing.trim().starts_with(&format!("{key} :=")) {
            out.push(line.clone());
            written = true;
        } else {
            if !written && existing.trim() > line.as_str() && !existing.trim().is_empty() {
                out.push(line.clone());
                written = true;
            }
            out.push(existing.to_string());
        }
    }
    if !written {
        out.push(line);
    }
    let mut text = out.join(end);
    text.push_str(end);
    text
}

fn remove(text: &str, key: &str) -> String {
    let end = if text.contains("\r\n") { "\r\n" } else { "\n" };
    let kept: Vec<&str> = text
        .lines()
        .filter(|line| !line.trim().starts_with(&format!("{key} :=")))
        .collect();
    let mut text = kept.join(end);
    if !text.is_empty() {
        text.push_str(end);
    }
    text
}

fn quoted(value: &str) -> String {
    format!("\"{value}\"")
}

/// One copy of the reader's own file, made before this app first writes it.
/// A later apply must not overwrite it, or the original is lost.
fn backup(file: &Path) -> Result<(), String> {
    let kept = file.with_extension("pref.houdinimd-backup");
    if kept.exists() || !file.exists() {
        return Ok(());
    }
    std::fs::copy(file, &kept)
        .map(|_| ())
        .map_err(|e| format!("{}: {e}", kept.display()))
}

fn read(file: &Path) -> Option<String> {
    std::fs::read(file).ok().map(|bytes| String::from_utf8_lossy(&bytes).into_owned())
}

fn write(file: &Path, text: &str) -> Result<(), String> {
    if let Some(parent) = file.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("{}: {e}", parent.display()))?;
    }
    std::fs::write(file, text).map_err(|e| format!("{}: {e}", file.display()))
}

fn load(data: &Path) -> Record {
    read(&data.join(RECORD))
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

fn save(data: &Path, record: &Record) -> Result<(), String> {
    let text = serde_json::to_string_pretty(record).map_err(|e| e.to_string())?;
    write(&data.join(RECORD), &text)
}

/// `houdini22.0` names release `22.0`.
fn series(path: &Path) -> Option<String> {
    let name = path.file_name()?.to_str()?;
    let rest = name.strip_prefix("houdini")?;
    rest.starts_with(|c: char| c.is_ascii_digit()).then(|| rest.to_string())
}

fn parts(release: &str) -> Vec<u32> {
    release.split('.').filter_map(|part| part.parse().ok()).collect()
}

/// Where Houdini keeps one preferences directory per release.
///
/// On Windows this is `Documents`, not the home directory. A shell that sets
/// `HOME` — Git Bash does — moves Houdini's idea of it, so the environment
/// wins where it is set and the documented default is the fallback.
#[cfg(windows)]
fn prefs_root() -> Option<PathBuf> {
    if let Some(home) = std::env::var_os("HOUDINI_USER_PREF_DIR").map(PathBuf::from) {
        return home.parent().map(Path::to_path_buf);
    }
    let profile = std::env::var_os("USERPROFILE")?;
    Some(PathBuf::from(profile).join("Documents"))
}

#[cfg(target_os = "macos")]
fn prefs_root() -> Option<PathBuf> {
    let home = std::env::var_os("HOME")?;
    Some(PathBuf::from(home).join("Library/Preferences/houdini"))
}

#[cfg(all(unix, not(target_os = "macos")))]
fn prefs_root() -> Option<PathBuf> {
    std::env::var_os("HOME").map(PathBuf::from)
}

/// Whether a Houdini of this release is open. It rewrites `houdini.pref` when
/// it exits, so a write made while it runs is thrown away without a word.
#[cfg(windows)]
fn running(_release: &str) -> bool {
    // Houdini's own name is the only one that matters: hython does not save
    // preferences.
    process_named("houdini.exe")
}

#[cfg(not(windows))]
fn running(_release: &str) -> bool {
    false
}

#[cfg(windows)]
fn process_named(name: &str) -> bool {
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::System::ProcessStatus::{EnumProcesses, GetModuleBaseNameA};
    use windows_sys::Win32::System::Threading::{
        OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION,
    };

    let mut ids = vec![0u32; 2048];
    let mut used = 0u32;
    let size = (ids.len() * size_of::<u32>()) as u32;
    if unsafe { EnumProcesses(ids.as_mut_ptr(), size, &mut used) } == 0 {
        return false;
    }
    let count = used as usize / size_of::<u32>();

    for &id in &ids[..count] {
        let handle = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, id) };
        if handle.is_null() {
            continue;
        }
        let mut buffer = [0u8; 260];
        let length =
            unsafe { GetModuleBaseNameA(handle, std::ptr::null_mut(), buffer.as_mut_ptr(), buffer.len() as u32) };
        unsafe { CloseHandle(handle) };
        if length > 0 {
            let found = String::from_utf8_lossy(&buffer[..length as usize]).to_lowercase();
            if found == name {
                return true;
            }
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = "anim.slope.val := 0;\r\nmisc.helpaddress.val := \"0.0.0.0\";\r\nui.parm.help := 1;\r\n";

    #[test]
    fn a_missing_key_lands_in_sorted_position() {
        let out = set(SAMPLE, EXTERNAL_URL, "\"http://localhost:48800\"");
        let keys: Vec<&str> = out.lines().map(|l| l.split(" :=").next().unwrap()).collect();
        assert_eq!(
            keys,
            vec!["anim.slope.val", "misc.externalhelpurl.val", "misc.helpaddress.val", "ui.parm.help"]
        );
    }

    #[test]
    fn an_existing_key_is_replaced_in_place() {
        let out = set(SAMPLE, "misc.helpaddress.val", "\"127.0.0.1\"");
        assert_eq!(out.lines().count(), 3);
        assert_eq!(value(&out, "misc.helpaddress.val").as_deref(), Some("\"127.0.0.1\""));
    }

    #[test]
    fn the_file_keeps_its_own_line_ending() {
        assert!(set(SAMPLE, USE_EXTERNAL, "1").contains("\r\n"));
        assert!(!set("a.val := 1;\n", USE_EXTERNAL, "1").contains('\r'));
    }

    #[test]
    fn applying_twice_writes_the_same_file() {
        let once = set(&set(SAMPLE, USE_EXTERNAL, "1"), EXTERNAL_URL, "\"http://localhost:48800\"");
        let twice = set(&set(&once, USE_EXTERNAL, "1"), EXTERNAL_URL, "\"http://localhost:48800\"");
        assert_eq!(once, twice);
    }

    #[test]
    fn reverting_puts_back_exactly_what_was_there() {
        let previous = Previous {
            prefs: PathBuf::new(),
            use_external: value(SAMPLE, USE_EXTERNAL),
            url: value(SAMPLE, EXTERNAL_URL),
        };
        let hooked = set(&set(SAMPLE, USE_EXTERNAL, "1"), EXTERNAL_URL, "\"http://localhost:48800\"");
        assert_eq!(apply_previous(&hooked, &previous), SAMPLE);
    }

    #[test]
    fn a_key_the_reader_never_had_is_removed_not_defaulted() {
        let hooked = set(SAMPLE, USE_EXTERNAL, "1");
        assert!(hooked.contains(USE_EXTERNAL));
        assert!(!remove(&hooked, USE_EXTERNAL).contains(USE_EXTERNAL));
    }


    #[test]
    fn our_url_is_recognised_by_host_and_port() {
        assert!(is_ours("\"http://localhost:48800\"", 48800));
        assert!(is_ours("http://127.0.0.1:48800/", 48800));
        assert!(!is_ours("\"https://houdinimd.com\"", 48800));
    }
}
