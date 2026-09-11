//! Installs Houdini MCP, which connects an agent to Houdini and to these docs.
//!
//! The installer is the `houdini-mcp-server` package on PyPI, run through `uv`.
//! This module finds the agents that installer can configure, and runs it in
//! the background with no console window.

use std::path::{Path, PathBuf};
use std::process::{Command, Output};

use serde::Serialize;

/// One agent the reader can pick. `harnesses` are the installer's own
/// `--harness` values for it: Claude Code and Claude Desktop are one Claude to
/// the reader, so that one pick configures both that are on the machine.
#[derive(Debug, Clone, Serialize)]
pub struct Agent {
    pub key: &'static str,
    pub label: &'static str,
    #[serde(skip)]
    harnesses: Vec<&'static str>,
}

/// The agents found on this machine, in the installer's own order.
pub fn agents() -> Vec<Agent> {
    let found = harnesses();
    let claude: Vec<&'static str> = found
        .iter()
        .map(|(key, _)| *key)
        .filter(|key| key.starts_with("claude-"))
        .collect();
    let mut agents = Vec::new();
    if !claude.is_empty() {
        agents.push(Agent { key: "claude", label: "Claude", harnesses: claude });
    }
    agents.extend(
        found
            .into_iter()
            .filter(|(key, _)| !key.starts_with("claude-"))
            .map(|(key, label)| Agent { key, label, harnesses: vec![key] }),
    );
    agents
}

/// The installer's harnesses found on this machine. The list and each test
/// mirror `HARNESSES` in houdini-mcp `src/bridge/onboarding/harnesses.py`.
/// That file is the source; a change there belongs here too.
fn harnesses() -> Vec<(&'static str, &'static str)> {
    let home = home();
    let config = std::env::var_os("XDG_CONFIG_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| home.join(".config"));
    let pi = std::env::var_os("PI_CODING_AGENT_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| home.join(".pi").join("agent"));

    let all = [
        ("claude-code", "Claude Code", on_path("claude") || home.join(".claude").is_dir()),
        ("claude-desktop", "Claude Desktop", claude_desktop(&home)),
        ("codex", "OpenAI Codex", on_path("codex") || home.join(".codex").is_dir()),
        ("gemini-cli", "Gemini CLI", on_path("gemini") || home.join(".gemini").is_dir()),
        ("cursor", "Cursor", home.join(".cursor").is_dir()),
        ("opencode", "opencode", on_path("opencode") || config.join("opencode").is_dir()),
        ("pi", "pi", on_path("pi") || pi.is_dir()),
    ];
    all.into_iter()
        .filter(|(_, _, found)| *found)
        .map(|(key, label, _)| (key, label))
        .collect()
}

/// Installs the Houdini plugin for `release` and registers the server with
/// the agent `key` names. Blocks for as long as the download takes, so call
/// it off the main thread.
pub fn install(release: &str, key: &str) -> Result<(), String> {
    let agent = agents()
        .into_iter()
        .find(|agent| agent.key == key)
        .ok_or_else(|| format!("{key} is not on this machine"))?;
    let uv = uv()?;
    let installed = run(Command::new(&uv).args(["tool", "install", "--force", "houdini-mcp-server"]))?;
    if !installed.status.success() {
        return Err(last_line(&installed.stderr));
    }
    // `tool run` takes the tool just installed, so the agent config names its
    // lasting path and not a cache folder.
    let mut command = Command::new(&uv);
    command.args([
        "tool", "run", "--from", "houdini-mcp-server", "houdinimcp-install",
        "--houdini-version", release, "--yes", "--json",
    ]);
    for harness in &agent.harnesses {
        command.args(["--harness", harness]);
    }
    let report = run(&mut command)?;
    if report.status.success() {
        return Ok(());
    }
    // `--json` puts the report on stdout, and its `errors` say what failed.
    let errors = serde_json::from_slice::<serde_json::Value>(&report.stdout)
        .ok()
        .and_then(|summary| {
            let list = summary["errors"].as_array()?;
            Some(list.iter().filter_map(|e| e.as_str()).collect::<Vec<_>>().join("; "))
        })
        .filter(|text| !text.is_empty());
    Err(errors.unwrap_or_else(|| last_line(&report.stderr)))
}

/// The `uv` to run. A window started from the tray keeps the PATH it had at
/// login, so a `uv` installed since then is found in its install folder first.
/// Without one, Astral's own installer puts it there, the way the MCP's
/// bootstrap scripts do.
fn uv() -> Result<PathBuf, String> {
    let local = home().join(".local").join("bin").join(if cfg!(windows) { "uv.exe" } else { "uv" });
    if local.is_file() {
        return Ok(local);
    }
    if on_path("uv") {
        return Ok(PathBuf::from("uv"));
    }
    let script = if cfg!(windows) {
        run(Command::new("powershell").args([
            "-NoProfile", "-ExecutionPolicy", "ByPass", "-Command",
            "irm https://astral.sh/uv/install.ps1 | iex",
        ]))?
    } else {
        run(Command::new("sh").args(["-c", "curl -LsSf https://astral.sh/uv/install.sh | sh"]))?
    };
    if local.is_file() {
        Ok(local)
    } else {
        Err(format!("uv did not install: {}", last_line(&script.stderr)))
    }
}

/// Runs a command with no window of its own. `CREATE_NO_WINDOW` gives it a
/// hidden console, so the tools it starts in turn inherit that one and do not
/// open theirs.
fn run(command: &mut Command) -> Result<Output, String> {
    // Houdini starts this app with its own Python on PYTHONHOME and PYTHONPATH,
    // which breaks every other Python.
    command.env_remove("PYTHONHOME").env_remove("PYTHONPATH");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000);
    }
    command.output().map_err(|e| e.to_string())
}

fn last_line(bytes: &[u8]) -> String {
    let text = String::from_utf8_lossy(bytes);
    text.lines().rev().find(|line| !line.trim().is_empty()).unwrap_or("unknown error").trim().to_string()
}

fn on_path(name: &str) -> bool {
    let Some(path) = std::env::var_os("PATH") else {
        return false;
    };
    let names: &[&str] = if cfg!(windows) { &["", ".exe", ".cmd", ".bat"] } else { &[""] };
    std::env::split_paths(&path)
        .any(|dir| names.iter().any(|ext| dir.join(format!("{name}{ext}")).is_file()))
}

fn claude_desktop(home: &Path) -> bool {
    if cfg!(windows) {
        let roaming = std::env::var_os("APPDATA").map(PathBuf::from).unwrap_or_else(|| home.join("AppData").join("Roaming"));
        let local = std::env::var_os("LOCALAPPDATA").map(PathBuf::from).unwrap_or_default();
        roaming.join("Claude").is_dir() || local.join("AnthropicClaude").is_dir()
    } else if cfg!(target_os = "macos") {
        home.join("Library/Application Support/Claude").is_dir() || Path::new("/Applications/Claude.app").is_dir()
    } else {
        home.join(".config").join("Claude").is_dir() || on_path("claude-desktop")
    }
}

fn home() -> PathBuf {
    let key = if cfg!(windows) { "USERPROFILE" } else { "HOME" };
    std::env::var_os(key).map(PathBuf::from).unwrap_or_default()
}
