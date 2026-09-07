//! Where data lives, and how the app checks for a new version of itself.
//!
//! See the "Installer and Portable Layout" and "Update Channel and Signing
//! Keys" specs. Updates are pulled by the front-end through
//! `tauri-plugin-updater`. The check runs at launch, before the window is on
//! screen, so a reader either sees the new version or sees the old one — never
//! a window that replaces itself while they are reading.

use std::io;
use std::path::PathBuf;
use std::time::Duration;

use tauri::{Manager, Runtime};
use tauri_plugin_updater::UpdaterExt;

/// The file that marks a portable install. Its presence beside the
/// executable, plus a writable folder, is the whole test — no registry, no
/// environment variable.
const PORTABLE_MARKER: &str = ".portable";

/// Where `index.db`, `user.db`, and the log go.
///
/// A portable copy keeps its data beside the executable: the marker file
/// sits there, and opening it for append proves the folder still accepts
/// writes (an install under `Program Files` never does, so a copied marker
/// left there by mistake is harmless). Anything else — the per-user or
/// all-users install — uses `app_data_dir()`, which Tauri already resolves
/// to `%LOCALAPPDATA%\HoudiniMD`.
///
/// Same `Result<PathBuf, _>` shape as `app.path().app_data_dir()`, so the
/// call site is a one-line swap.
pub fn data_dir<R: Runtime>(app: &impl Manager<R>) -> io::Result<PathBuf> {
    if let Some(dir) = portable_dir()? {
        return Ok(dir);
    }
    app.path()
        .app_data_dir()
        .map_err(|e| io::Error::other(e.to_string()))
}

fn portable_dir() -> io::Result<Option<PathBuf>> {
    let exe = std::env::current_exe()?;
    let Some(dir) = exe.parent() else {
        return Ok(None);
    };
    let writable = std::fs::OpenOptions::new()
        .append(true)
        .open(dir.join(PORTABLE_MARKER))
        .is_ok();
    Ok(writable.then(|| dir.to_path_buf()))
}

/// The updater plugin, configured from `tauri.conf.json` (public key,
/// endpoint). Register with `.plugin(update::plugin())` in `run()`.
pub fn plugin<R: Runtime>() -> tauri::plugin::TauriPlugin<R, tauri_plugin_updater::Config> {
    tauri_plugin_updater::Builder::new().build()
}

/// How long the launch check may hold the window back.
///
/// The window is hidden until this returns, so this is time the reader spends
/// looking at nothing. A machine with no network answers in well under a
/// second; one behind a captive portal never answers at all, and that is what
/// the limit is for.
const CHECK_LIMIT: Duration = Duration::from_secs(4);

/// Looks for a new version, installs it, and shows the window.
///
/// The window starts hidden (`"visible": false` in `tauri.conf.json`), so this
/// owns the moment it appears. Every path out of here shows it, including the
/// failures: no network, no answer, a bad signature. Only a successful install
/// leaves without showing, because that path restarts the app.
pub fn start(app: &tauri::AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(reason) = install(&app).await {
            eprintln!("update check failed: {reason}");
        }
        show(&app);
    });
}

fn show(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

async fn install(app: &tauri::AppHandle) -> tauri_plugin_updater::Result<()> {
    // Debug builds have no signed bundle to update to, and the check would
    // just time out against the live endpoint on every `bun run app`.
    if cfg!(debug_assertions) || !wanted(app) {
        return Ok(());
    }
    let Some(update) = app
        .updater_builder()
        .timeout(CHECK_LIMIT)
        .build()?
        .check()
        .await?
    else {
        return Ok(());
    };
    eprintln!("installing update {}", update.version);
    update.download_and_install(|_, _| {}, || {}).await?;
    app.restart();
}

/// The setting behind the launch check. Absent means on: a reader who has never
/// touched the switch gets updates.
const AUTO_KEY: &str = "auto_update";

fn wanted(app: &tauri::AppHandle) -> bool {
    let Some(db) = app.try_state::<crate::Db>() else {
        return true;
    };
    let Ok(db) = db.0.lock() else {
        return true;
    };
    crate::db::get_setting(&db, AUTO_KEY).as_deref() != Some("0")
}
