//! Finds the Houdini installs on this machine and the help folder in each one.
//! The app reads the docs the artist already has; it ships none of its own.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::Serialize;

/// Caches the result of `find()`, which walks Program Files. A page read, an
/// icon and an image all used to pay for that scan; now only a cold cache and
/// an explicit `refresh()` do.
pub struct Cache {
    found: Mutex<Option<Vec<Install>>>,
    /// Install folders the reader picked by hand, because the scan looks only
    /// where the installer puts a build. Persisted under `PICKED_KEY`.
    picked: Mutex<Vec<PathBuf>>,
}

impl Cache {
    pub fn new() -> Self {
        Cache {
            found: Mutex::new(None),
            picked: Mutex::new(Vec::new()),
        }
    }

    /// The cached list, scanning once if nothing is cached yet.
    pub fn get(&self) -> Vec<Install> {
        let mut cached = self.found.lock().unwrap();
        if cached.is_none() {
            *cached = Some(find(&self.picked.lock().unwrap()));
        }
        cached.clone().unwrap_or_default()
    }

    /// Rescans and replaces the cache. Called when the reader opens the
    /// version picker, never on a page read.
    pub fn refresh(&self) -> Vec<Install> {
        let found = find(&self.picked.lock().unwrap());
        *self.found.lock().unwrap() = Some(found.clone());
        found
    }

    /// Replaces the hand-picked folders and drops the scan, so the next read
    /// sees them.
    pub fn set_picked(&self, roots: Vec<PathBuf>) {
        *self.picked.lock().unwrap() = roots;
        *self.found.lock().unwrap() = None;
    }

    pub fn picked(&self) -> Vec<PathBuf> {
        self.picked.lock().unwrap().clone()
    }
}

impl Default for Cache {
    fn default() -> Self {
        Self::new()
    }
}

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
pub fn find(picked: &[PathBuf]) -> Vec<Install> {
    let mut found: Vec<Install> = Vec::new();

    // A running Houdini sets HFS. It is the install the artist pressed F1 in,
    // so it wins over anything the scan finds.
    if let Some(install) = std::env::var_os("HFS").map(PathBuf::from).and_then(read) {
        found.push(install);
    }

    for root in picked {
        if let Some(install) = read(root.clone())
            && !found.iter().any(|i| i.version == install.version)
        {
            found.push(install);
        }
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
pub fn read(root: PathBuf) -> Option<Install> {
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

/// The setting key the chosen build is persisted under.
const BUILD_KEY: &str = "build";

/// The setting key the hand-picked install folders are persisted under, one
/// path per line.
const PICKED_KEY: &str = "picked_installs";

/// Fills the cache with the folders the reader picked in an earlier session.
pub fn load_picked(cache: &Cache, db: &rusqlite::Connection) {
    let stored = crate::db::get_setting(db, PICKED_KEY).unwrap_or_default();
    cache.set_picked(
        stored
            .lines()
            .filter(|line| !line.trim().is_empty())
            .map(PathBuf::from)
            .collect(),
    );
}

/// Takes a folder the reader chose in the file picker and returns the install
/// in it. The picker gives back whatever folder was open, so this also accepts
/// a folder inside the install: `.../Houdini 21.0.829/houdini/help` names the
/// same build as its root does.
pub fn add_picked(
    cache: &Cache,
    db: &rusqlite::Connection,
    chosen: PathBuf,
) -> Result<Install, String> {
    let install = std::iter::successors(Some(chosen.as_path()), |dir| dir.parent())
        .take(3)
        .find_map(|dir| read(dir.to_path_buf()))
        .ok_or_else(|| format!("{} holds no Houdini help", chosen.display()))?;

    let mut roots = cache.picked();
    if !roots.contains(&install.root) {
        roots.push(install.root.clone());
    }
    crate::db::set_setting(
        db,
        PICKED_KEY,
        &roots
            .iter()
            .map(|root| root.display().to_string())
            .collect::<Vec<_>>()
            .join("\n"),
    )?;
    cache.set_picked(roots);
    Ok(install)
}

/// The install every reader-facing read uses: the reader's own choice, kept
/// warm in `chosen` so this runs once per process and not once per request.
///
/// Falls back to `$HFS` and then to the newest install — both already the
/// first entry `Cache::get` returns — when nothing is chosen yet, or when the
/// chosen build is no longer on the machine. Writes the result back as the
/// choice, so a fallback taken once is not taken again.
pub fn resolve(
    chosen: &mut Option<Install>,
    cache: &Cache,
    db: &rusqlite::Connection,
) -> Result<Install, String> {
    if let Some(install) = chosen.as_ref() {
        if install.help.is_dir() {
            return Ok(install.clone());
        }
    }
    let found = cache.get();
    let wanted = crate::db::get_setting(db, BUILD_KEY);
    let picked = wanted
        .as_deref()
        .and_then(|version| found.iter().find(|i| i.version == version).cloned())
        .or_else(|| found.first().cloned())
        .ok_or_else(|| "no Houdini install found on this machine".to_string())?;
    let _ = crate::db::set_setting(db, BUILD_KEY, &picked.version);
    *chosen = Some(picked.clone());
    Ok(picked)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_db() -> rusqlite::Connection {
        use std::sync::atomic::{AtomicU32, Ordering};
        static NEXT: AtomicU32 = AtomicU32::new(0);
        let n = NEXT.fetch_add(1, Ordering::Relaxed);
        let data =
            std::env::temp_dir().join(format!("houdinimd-install-test-{}-{n}", std::process::id()));
        crate::db::open(&data).unwrap()
    }

    fn fake_install(version: &str) -> Install {
        Install { version: version.to_string(), root: PathBuf::new(), help: PathBuf::new() }
    }

    /// A one-shot cache that never scans the disk — `resolve` should only ever
    /// need what it is given.
    fn cache_of(installs: Vec<Install>) -> Cache {
        let cache = Cache::new();
        *cache.found.lock().unwrap() = Some(installs);
        cache
    }

    #[test]
    fn nothing_chosen_yet_falls_back_to_the_first_found_install() {
        let db = temp_db();
        let cache = cache_of(vec![fake_install("22.0.368"), fake_install("21.0.829")]);
        let mut chosen = None;
        let picked = resolve(&mut chosen, &cache, &db).unwrap();
        assert_eq!(picked.version, "22.0.368");
        // The fallback is written back, so a restart reads the same build.
        assert_eq!(crate::db::get_setting(&db, BUILD_KEY).as_deref(), Some("22.0.368"));
    }

    #[test]
    fn a_build_removed_from_the_machine_falls_back_and_overwrites_the_choice() {
        let db = temp_db();
        crate::db::set_setting(&db, BUILD_KEY, "19.5.000").unwrap();
        let cache = cache_of(vec![fake_install("22.0.368")]);
        let mut chosen = None;
        let picked = resolve(&mut chosen, &cache, &db).unwrap();
        assert_eq!(picked.version, "22.0.368");
        assert_eq!(crate::db::get_setting(&db, BUILD_KEY).as_deref(), Some("22.0.368"));
    }

    #[test]
    fn a_chosen_build_still_on_the_machine_is_kept() {
        let db = temp_db();
        crate::db::set_setting(&db, BUILD_KEY, "21.0.829").unwrap();
        let cache = cache_of(vec![fake_install("22.0.368"), fake_install("21.0.829")]);
        let mut chosen = None;
        let picked = resolve(&mut chosen, &cache, &db).unwrap();
        assert_eq!(picked.version, "21.0.829");
    }

    #[test]
    fn a_resolved_install_is_kept_warm_without_asking_the_cache_again() {
        let db = temp_db();
        // A cache with nothing in it: if `resolve` asked it a second time
        // instead of trusting `chosen`, this would fail to find anything.
        let cache = Cache::new();
        let mut chosen = Some(fake_install("22.0.368"));
        // `Install.help` is empty here, which is not a directory, so the
        // freshness check below matters: a fake install has no help folder,
        // and this test's whole point is that `resolve` never checks past
        // `chosen` when the caller already trusts it — see the version test
        // above for the "gone from disk" path instead.
        chosen.as_mut().unwrap().help = std::env::temp_dir();
        let picked = resolve(&mut chosen, &cache, &db).unwrap();
        assert_eq!(picked.version, "22.0.368");
    }
}
