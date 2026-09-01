//! Finds the Houdini installs on this machine and the help folder in each one.
//! The app reads the docs the artist already has; it ships none of its own.

use std::path::{Path, PathBuf};

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct Install {
    /// The build string, taken from the install folder name: `22.0.368`.
    pub version: String,
    /// `$HFS`, the install root. Icons and other assets hang off it.
    pub root: PathBuf,
    /// `$HFS/houdini/help`, which holds one zip per doc section.
    pub help: PathBuf,
}

/// Newest build first, so the caller can take the first one as the default.
pub fn find() -> Vec<Install> {
    let mut found: Vec<Install> = Vec::new();

    // A running Houdini sets HFS. It is the install the artist pressed F1 in,
    // so it wins over anything the scan finds.
    if let Some(install) = std::env::var_os("HFS").map(PathBuf::from).and_then(read) {
        found.push(install);
    }

    for root in roots() {
        let Ok(entries) = std::fs::read_dir(root) else {
            continue;
        };
        for entry in entries.flatten() {
            if let Some(install) = read(hfs(entry.path())) {
                if !found.iter().any(|i| i.version == install.version) {
                    found.push(install);
                }
            }
        }
    }

    found.sort_by(|a, b| parts(&b.version).cmp(&parts(&a.version)));
    found
}

/// Reads one install folder. `None` when it holds no help.
fn read(root: PathBuf) -> Option<Install> {
    let help = root.join("houdini").join("help");
    if !help.is_dir() {
        return None;
    }
    Some(Install {
        version: version(&root)?,
        root,
        help,
    })
}

/// The build number the path carries, read from the end backwards. Every
/// platform writes it into one folder along the way, and no two write it the
/// same: `Houdini 22.0.368` on Windows, `Houdini22.0.368` on macOS, `hfs22.0`
/// on Linux. The last folder of a macOS install is `Resources`, so the name of
/// the folder itself is not enough.
fn version(root: &Path) -> Option<String> {
    root.components()
        .rev()
        .filter_map(|part| part.as_os_str().to_str())
        .find_map(build)
}

fn build(name: &str) -> Option<String> {
    let rest = name
        .strip_prefix("Houdini")
        .or_else(|| name.strip_prefix("hfs"))
        .unwrap_or(name)
        .trim_start();
    rest.starts_with(|c: char| c.is_ascii_digit())
        .then(|| rest.to_string())
}

/// Where the installer puts builds. One entry per drive letter it offers.
#[cfg(windows)]
fn roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    for var in ["ProgramFiles", "ProgramFiles(x86)"] {
        if let Some(dir) = std::env::var_os(var) {
            roots.push(PathBuf::from(dir).join("Side Effects Software"));
        }
    }
    roots
}

#[cfg(not(windows))]
fn roots() -> Vec<PathBuf> {
    vec![PathBuf::from("/Applications/Houdini")]
}

/// `$HFS` is the install folder on Windows and a framework inside it on macOS,
/// so what the scan finds is not what the reader gets.
#[cfg(windows)]
fn hfs(entry: PathBuf) -> PathBuf {
    entry
}

#[cfg(not(windows))]
fn hfs(entry: PathBuf) -> PathBuf {
    entry.join("Frameworks/Houdini.framework/Versions/Current/Resources")
}

/// Sorts `22.0.368` above `20.5.487`, which a string compare gets wrong.
fn parts(version: &str) -> Vec<u32> {
    version.split('.').filter_map(|p| p.parse().ok()).collect()
}
