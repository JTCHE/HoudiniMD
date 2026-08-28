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
            if let Some(install) = read(entry.path()) {
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

/// `Houdini 22.0.368` names build 22.0.368.
fn version(root: &Path) -> Option<String> {
    let name = root.file_name()?.to_str()?;
    let build = name.rsplit(' ').next()?;
    build
        .starts_with(|c: char| c.is_ascii_digit())
        .then(|| build.to_string())
}

/// Where the installer puts builds. One entry per drive letter it offers.
fn roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    for var in ["ProgramFiles", "ProgramFiles(x86)"] {
        if let Some(dir) = std::env::var_os(var) {
            roots.push(PathBuf::from(dir).join("Side Effects Software"));
        }
    }
    roots
}

/// Sorts `22.0.368` above `20.5.487`, which a string compare gets wrong.
fn parts(version: &str) -> Vec<u32> {
    version.split('.').filter_map(|p| p.parse().ok()).collect()
}
