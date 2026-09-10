//! Finds the Houdini installs on this machine and the help folder in each one.
//! The app reads the docs the artist already has; it ships none of its own.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::Serialize;

/// The install every read in this process uses, resolved once by
/// `resolve` and kept warm across calls. Shared as one `Arc` between the
/// desktop window and the localhost server, so a build switched in one is a
/// build switched in both — see spec: Local — window and pane read the same
/// build.
#[derive(Default)]
pub struct Chosen(Mutex<Option<Install>>);

impl Chosen {
    pub fn new() -> Self {
        Self::default()
    }
}

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
    /// The build string: `22.0.368`. Read from the registry when the install
    /// came from there, since that name is authoritative; guessed from the
    /// install folder's own name otherwise.
    pub version: String,
    /// `$HFS`, the install root. Icons and other assets hang off it.
    pub root: PathBuf,
    /// `$HFS/houdini/help`, which holds one zip per doc section.
    pub help: PathBuf,
    /// Every package root this build's Houdini Path adds — SideFX Labs and
    /// any other package, including a reader's own — each shaped like `root`
    /// itself: a `help/` and a `config/Icons/` of its own. See `packages.rs`.
    pub packages: Vec<PathBuf>,
}

impl Install {
    /// Every place a page might live, this build's own help first, then each
    /// package's — the order `page_layered` and `asset_layered` search in.
    pub fn help_roots(&self) -> Vec<PathBuf> {
        std::iter::once(self.help.clone())
            .chain(self.packages.iter().map(|p| p.join("help")))
            .collect()
    }
}

/// Two paths that name the same install folder. The registry writes a
/// trailing separator and the scan does not, and Windows does not care about
/// case, so the text of a path is not what makes it one install or two.
fn same_root(a: &Path, b: &Path) -> bool {
    fn key(path: &Path) -> String {
        let text = path.to_string_lossy().replace('\\', "/");
        text.trim_end_matches('/').to_lowercase()
    }
    key(a) == key(b)
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
            && !found.iter().any(|i| same_root(&i.root, &install.root))
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
                if !found.iter().any(|i| same_root(&i.root, &install.root)) {
                    found.push(install);
                }
            }
        }
    }

    for (version, root) in registry_roots() {
        if let Some(install) = read_versioned(root, version)
            && !found.iter().any(|i| same_root(&i.root, &install.root))
        {
            found.push(install);
        }
    }

    found.sort_by(|a, b| parts(&b.version).cmp(&parts(&a.version)));
    found
}

/// Reads one install folder. `None` when it holds no help.
pub fn read(root: PathBuf) -> Option<Install> {
    let version = version(&root)?;
    read_versioned(root, version)
}

/// Reads one install folder whose version is already known — the registry
/// names it, so there is nothing to guess from the folder's own name. `None`
/// when it holds no help.
fn read_versioned(root: PathBuf, version: String) -> Option<Install> {
    let help = root.join("houdini").join("help");
    if !help.is_dir() {
        return None;
    }
    let packages = crate::packages::discover(&root, &version);
    Some(Install { version, root, help, packages })
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

/// The installer writes its own path into the registry, so a build on another
/// drive or in a studio's own folder — anywhere `roots()` does not look — is
/// still found. `HKLM\SOFTWARE\Side Effects Software\Houdini` holds one value
/// per build, keyed by its four-part version, e.g. `21.0.0.729`. That value
/// name is the version, taken as-is: an install folder that carries no
/// version in its own name (a studio's `C:\Houdini21`, say) has nowhere else
/// to read one from.
#[cfg(windows)]
fn registry_roots() -> Vec<(String, PathBuf)> {
    use winreg::enums::HKEY_LOCAL_MACHINE;
    use winreg::RegKey;

    let Ok(key) = RegKey::predef(HKEY_LOCAL_MACHINE)
        .open_subkey(r"SOFTWARE\Side Effects Software\Houdini")
    else {
        return Vec::new();
    };
    key.enum_values()
        .filter_map(|entry| entry.ok())
        .filter_map(|(name, value)| {
            let root = value.to_string().parse::<PathBuf>().ok()?;
            Some((name, root))
        })
        .collect()
}

#[cfg(not(windows))]
fn registry_roots() -> Vec<(String, PathBuf)> {
    Vec::new()
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

/// The setting key the chosen build is persisted under. This crate never
/// writes a setting itself — the caller owns the store, and these are the
/// names it should keep them under.
pub const BUILD_KEY: &str = "build";

/// The setting key the hand-picked install folders are persisted under, one
/// path per line.
pub const PICKED_KEY: &str = "picked_installs";

/// Fills the cache with the folders the reader picked in an earlier session,
/// as `PICKED_KEY` holds them.
pub fn load_picked(cache: &Cache, stored: &str) {
    cache.set_picked(
        stored
            .lines()
            .filter(|line| !line.trim().is_empty())
            .map(PathBuf::from)
            .collect(),
    );
}

/// Takes a folder the reader chose in the file picker and returns the install
/// in it, with the new `PICKED_KEY` value for the caller to persist. The
/// picker gives back whatever folder was open, so this also accepts a folder
/// inside the install: `.../Houdini 21.0.829/houdini/help` names the same
/// build as its root does.
pub fn add_picked(cache: &Cache, chosen: PathBuf) -> Result<(Install, String), String> {
    let install = std::iter::successors(Some(chosen.as_path()), |dir| dir.parent())
        .take(3)
        .find_map(|dir| read(dir.to_path_buf()))
        .ok_or_else(|| format!("{} holds no Houdini help", chosen.display()))?;

    let mut roots = cache.picked();
    if !roots.contains(&install.root) {
        roots.push(install.root.clone());
    }
    let stored = roots
        .iter()
        .map(|root| root.display().to_string())
        .collect::<Vec<_>>()
        .join("\n");
    cache.set_picked(roots);
    Ok((install, stored))
}

/// The install every reader-facing read uses: the reader's own choice, kept
/// warm in `chosen` so this runs once per process and not once per request.
///
/// `wanted` is the build the reader chose, as `BUILD_KEY` holds it. Falls back
/// to `$HFS` and then to the newest install — both already the first entry
/// `Cache::get` returns — when nothing is chosen yet, or when the chosen build
/// is no longer on the machine. The caller writes the result back under
/// `BUILD_KEY`, so a fallback taken once is not taken again.
pub fn resolve(chosen: &Chosen, cache: &Cache, wanted: Option<&str>) -> Result<Install, String> {
    let mut chosen = chosen.0.lock().map_err(|e| e.to_string())?;
    if let Some(install) = chosen.as_ref() {
        if install.help.is_dir() {
            return Ok(install.clone());
        }
    }
    let found = cache.get();
    let picked = wanted
        .and_then(|version| found.iter().find(|i| i.version == version).cloned())
        .or_else(|| found.first().cloned())
        .ok_or_else(|| "no Houdini install found on this machine".to_string())?;
    *chosen = Some(picked.clone());
    Ok(picked)
}

/// Overwrites what `resolve` hands out next, without touching the persisted
/// choice's freshness check — used when the reader switches build by hand, so
/// the window and the F1 pane pick it up on their very next read.
pub fn set_chosen(chosen: &Chosen, install: Install) -> Result<(), String> {
    *chosen.0.lock().map_err(|e| e.to_string())? = Some(install);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fake_install(version: &str) -> Install {
        Install {
            version: version.to_string(),
            root: PathBuf::new(),
            help: PathBuf::new(),
            packages: Vec::new(),
        }
    }

    fn chosen_of(install: Option<Install>) -> Chosen {
        Chosen(Mutex::new(install))
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
        let cache = cache_of(vec![fake_install("22.0.368"), fake_install("21.0.829")]);
        let chosen = chosen_of(None);
        let picked = resolve(&chosen, &cache, None).unwrap();
        assert_eq!(picked.version, "22.0.368");
    }

    #[test]
    fn a_build_removed_from_the_machine_falls_back_and_overwrites_the_choice() {
        let cache = cache_of(vec![fake_install("22.0.368")]);
        let chosen = chosen_of(None);
        let picked = resolve(&chosen, &cache, Some("19.5.000")).unwrap();
        assert_eq!(picked.version, "22.0.368");
    }

    #[test]
    fn a_chosen_build_still_on_the_machine_is_kept() {
        let cache = cache_of(vec![fake_install("22.0.368"), fake_install("21.0.829")]);
        let chosen = chosen_of(None);
        let picked = resolve(&chosen, &cache, Some("21.0.829")).unwrap();
        assert_eq!(picked.version, "21.0.829");
    }

    #[test]
    fn a_resolved_install_is_kept_warm_without_asking_the_cache_again() {
        // A cache with nothing in it: if `resolve` asked it a second time
        // instead of trusting `chosen`, this would fail to find anything.
        let cache = Cache::new();
        let mut warm = fake_install("22.0.368");
        // `Install.help` is empty here, which is not a directory, so the
        // freshness check below matters: a fake install has no help folder,
        // and this test's whole point is that `resolve` never checks past
        // `chosen` when the caller already trusts it — see the version test
        // above for the "gone from disk" path instead.
        warm.help = std::env::temp_dir();
        let chosen = chosen_of(Some(warm));
        let picked = resolve(&chosen, &cache, None).unwrap();
        assert_eq!(picked.version, "22.0.368");
    }

    #[test]
    fn switching_the_build_is_seen_by_every_reader_of_the_same_chosen() {
        // The bug this guards: the window and the F1 pane used to hold their
        // own separate `chosen`, so a build switched in one was invisible to
        // the other until its cached install vanished from disk. One
        // `Chosen`, shared, is the fix — this is the regression test for it.
        let chosen = chosen_of(None);
        let cache = cache_of(vec![fake_install("22.0.368")]);
        assert_eq!(resolve(&chosen, &cache, None).unwrap().version, "22.0.368");

        let mut switched = fake_install("21.0.829");
        switched.help = std::env::temp_dir();
        set_chosen(&chosen, switched).unwrap();

        // A cache that would now resolve differently, to prove this reads
        // `chosen` and not the cache.
        let cache = cache_of(vec![fake_install("22.0.368")]);
        assert_eq!(resolve(&chosen, &cache, None).unwrap().version, "21.0.829");
    }
}
