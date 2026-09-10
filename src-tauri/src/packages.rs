//! Finds the extra doc roots a Houdini install reads besides its own.
//!
//! Houdini answers "where do node docs live?" with the Houdini Path, not with
//! `$HFS` alone: `basics/houdinipath.txt` in the install's own help says it
//! looks for a `help` subdirectory under EVERY directory the package system
//! adds. SideFX Labs is not special-cased here — it is just the first package
//! to use that mechanism. A user's own HDA package reaches the app the same
//! way, through the same scan.
//!
//! This is not Houdini's package loader. It does not evaluate `enable`
//! conditions, and it only expands the handful of variables a package
//! actually needs to name its own directory (`$HFS`, `$HOUDINI_USER_PREF_DIR`,
//! `$HOUDINI_PACKAGE_PATH`, and the package's own `env` block). A package that
//! is disabled, or whose path depends on something else, is skipped by simply
//! not resolving to a real directory — the same best-effort spirit
//! `install::find` already scans Program Files with.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

/// Every package root this install's Houdini Path adds, each one holding its
/// own `help/` and `config/Icons/` the same way `$HFS/houdini/` does.
pub fn discover(root: &Path, version: &str) -> Vec<PathBuf> {
    let mut vars = HashMap::new();
    vars.insert("HFS".to_string(), display(root));
    if let Some(prefs) = user_pref_dir(version) {
        vars.insert("HOUDINI_USER_PREF_DIR".to_string(), display(&prefs));
    }

    let mut found = Vec::new();
    let mut seen = std::collections::HashSet::new();
    let mut dirs = vec![root.join("packages")];
    if let Some(prefs) = user_pref_dir(version) {
        dirs.push(prefs.join("packages"));
    }

    // `package_dirs.json` files point at more folders of `.json` files, one
    // level deep — the shape `sidefx_packages` uses. Real Houdini walks this
    // to a fixed point; one extra level covers every install seen so far.
    let mut queue = dirs;
    let mut indirect = Vec::new();
    for _ in 0..2 {
        let mut next = Vec::new();
        for dir in &queue {
            for (path, json) in package_jsons(dir) {
                if let Some(more) = json.get("package_path").and_then(|v| v.as_str()) {
                    let resolved = expand(more, &vars);
                    let dir = PathBuf::from(resolved);
                    if seen.insert(dir.clone()) {
                        next.push(dir);
                    }
                } else {
                    indirect.push((path, json));
                }
            }
        }
        if next.is_empty() {
            break;
        }
        queue = next;
    }

    for (json_path, json) in indirect {
        let package_dir = json_path.parent().map(display).unwrap_or_default();
        let mut local = vars.clone();
        local.insert("HOUDINI_PACKAGE_PATH".to_string(), package_dir);
        for value in json.get("env").and_then(|v| v.as_array()).into_iter().flatten() {
            let Some(obj) = value.as_object() else { continue };
            for (key, value) in obj {
                if let Some(text) = env_value(value) {
                    let resolved = expand(text, &local);
                    local.insert(key.clone(), resolved);
                }
            }
        }
        for key in ["path", "hpath"] {
            for entry in json.get(key).and_then(|v| v.as_array()).into_iter().flatten() {
                let Some(text) = entry.as_str() else { continue };
                let resolved = expand(text, &local);
                found.push(PathBuf::from(resolved));
            }
        }
    }

    found.retain(|dir| dir.is_dir());
    found.sort();
    found.dedup();
    found
}

/// The `.json` package descriptors directly inside one folder, parsed.
fn package_jsons(dir: &Path) -> Vec<(PathBuf, serde_json::Value)> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    entries
        .flatten()
        .filter(|entry| entry.path().extension().is_some_and(|e| e == "json"))
        .filter_map(|entry| {
            let path = entry.path();
            let text = std::fs::read_to_string(&path).ok()?;
            let json = parse_lenient(&text)?;
            Some((path, json))
        })
        .collect()
}

/// Houdini's own package reader accepts a bare `\` in a string, such as a
/// Windows path an installer wrote straight into `package_dirs.json` with no
/// escaping. That is not valid JSON — `serde_json` rejects `\H` as an unknown
/// escape — so a package written that way is retried with every `\` that is
/// not already the start of a real escape doubled into `\\`.
fn parse_lenient(text: &str) -> Option<serde_json::Value> {
    serde_json::from_str(text)
        .ok()
        .or_else(|| serde_json::from_str(&escape_backslashes(text)).ok())
}

fn escape_backslashes(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut chars = text.chars().peekable();
    while let Some(c) = chars.next() {
        if c != '\\' {
            out.push(c);
            continue;
        }
        match chars.peek() {
            Some('"' | '\\' | '/' | 'b' | 'f' | 'n' | 'r' | 't' | 'u') => out.push('\\'),
            _ => out.push_str("\\\\"),
        }
    }
    out
}

/// A package's `env` entry names one value directly, or a list of
/// alternatives — real packages use the list form for a platform-conditional
/// value. The first plain string is close enough for finding a directory.
fn env_value(value: &serde_json::Value) -> Option<&str> {
    match value {
        serde_json::Value::String(s) => Some(s),
        serde_json::Value::Array(items) => items.iter().find_map(|v| v.as_str()),
        _ => None,
    }
}

/// Replaces `$NAME` and `${NAME}` with `vars[NAME]`. A variable this map does
/// not know is left as written, which almost always fails the `is_dir` check
/// the caller applies afterward — the same as skipping it, without needing to
/// track failure through the expansion.
fn expand(text: &str, vars: &HashMap<String, String>) -> String {
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(dollar) = rest.find('$') {
        out.push_str(&rest[..dollar]);
        let after = &rest[dollar + 1..];
        let braced = after.starts_with('{');
        let name_start = if braced { 1 } else { 0 };
        let name_len = after[name_start..]
            .find(|c: char| !(c.is_ascii_alphanumeric() || c == '_'))
            .unwrap_or(after.len() - name_start);
        let name = &after[name_start..name_start + name_len];
        if name.is_empty() {
            out.push('$');
            rest = after;
            continue;
        }
        let closes = braced && after[name_start + name_len..].starts_with('}');
        match vars.get(name) {
            Some(value) => out.push_str(value),
            None => {
                out.push('$');
                out.push_str(&after[..name_start + name_len + usize::from(closes)]);
            }
        }
        rest = &after[name_start + name_len + usize::from(closes)..];
    }
    out.push_str(rest);
    out
}

fn display(path: &Path) -> String {
    path.display().to_string()
}

/// `$HOUDINI_USER_PREF_DIR`, undocumented for anything but the default: on
/// Windows and Linux it is `$HOME/houdiniMAJOR.MINOR`; on macOS it is the same
/// folder if the reader already has one, else the Library/Preferences form.
/// See `basics/houdinipath.txt`.
fn user_pref_dir(version: &str) -> Option<PathBuf> {
    let home = home_dir()?;
    let hver = version.splitn(3, '.').take(2).collect::<Vec<_>>().join(".");
    let default = home.join(format!("houdini{hver}"));
    if cfg!(target_os = "macos") && !default.is_dir() {
        return Some(home.join("Library").join("Preferences").join("houdini").join(hver));
    }
    Some(default)
}

#[cfg(windows)]
fn home_dir() -> Option<PathBuf> {
    std::env::var_os("USERPROFILE").map(PathBuf::from)
}

#[cfg(not(windows))]
fn home_dir() -> Option<PathBuf> {
    std::env::var_os("HOME").map(PathBuf::from)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_plain_variable_expands() {
        let mut vars = HashMap::new();
        vars.insert("SIDEFXLABS".to_string(), "C:/pkg/Labs".to_string());
        assert_eq!(expand("$SIDEFXLABS/help", &vars), "C:/pkg/Labs/help");
        assert_eq!(expand("${SIDEFXLABS}/help", &vars), "C:/pkg/Labs/help");
    }

    #[test]
    fn an_unknown_variable_is_left_written() {
        let vars = HashMap::new();
        assert_eq!(expand("$NOPE/help", &vars), "$NOPE/help");
    }

    #[test]
    fn a_variable_can_reference_another() {
        let mut vars = HashMap::new();
        vars.insert("HOUDINI_PACKAGE_PATH".to_string(), "C:/pkgs".to_string());
        vars.insert(
            "SIDEFXLABS".to_string(),
            expand("$HOUDINI_PACKAGE_PATH/SideFXLabs21.0", &vars),
        );
        assert_eq!(vars["SIDEFXLABS"], "C:/pkgs/SideFXLabs21.0");
    }
}
