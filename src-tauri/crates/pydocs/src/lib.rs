//! The documentation engine as a Python module.
//!
//! The HoudiniMCP bridge reads Houdini's help through this instead of over
//! HTTP: same install, same parse, same index as the desktop app, and no
//! network. Every call answers with a JSON string, which is what the bridge
//! sends on anyway.
//!
//! No documentation content ships here. Every page comes from the Houdini
//! install on the machine that asks.

use std::path::PathBuf;

use pyo3::exceptions::{PyRuntimeError, PyValueError};
use pyo3::prelude::*;

/// Where `index.db` lives: the desktop app's own folder, so a build indexed
/// by one is a build already indexed for the other. `HOUDINIMD_DATA` points
/// somewhere else, which is what a machine without the app uses.
fn data_dir() -> PyResult<PathBuf> {
    if let Some(dir) = std::env::var_os("HOUDINIMD_DATA") {
        return Ok(PathBuf::from(dir));
    }
    let home = |var: &str| std::env::var_os(var).map(PathBuf::from);
    #[cfg(windows)]
    // A harness can start the bridge with a trimmed environment, so the
    // profile folder stands in for a missing LOCALAPPDATA.
    let dir = home("LOCALAPPDATA")
        .or_else(|| home("USERPROFILE").map(|dir| dir.join("AppData").join("Local")))
        .map(|dir| dir.join("HoudiniMD"));
    #[cfg(target_os = "macos")]
    let dir = home("HOME")
        .map(|dir| dir.join("Library/Application Support").join("com.houdinimd.app"));
    #[cfg(all(unix, not(target_os = "macos")))]
    let dir = home("XDG_DATA_HOME")
        .or_else(|| home("HOME").map(|dir| dir.join(".local/share")))
        .map(|dir| dir.join("com.houdinimd.app"));
    dir.ok_or_else(|| PyRuntimeError::new_err("no data folder on this machine; set HOUDINIMD_DATA"))
}

fn err(reason: String) -> PyErr {
    PyRuntimeError::new_err(reason)
}

fn json<T: serde::Serialize>(value: &T) -> PyResult<String> {
    serde_json::to_string(value).map_err(|e| err(e.to_string()))
}

/// The install a call reads. `build` names one; without it the reader gets
/// `$HFS` — the Houdini this bridge is talking to — and then the newest build
/// on the machine.
fn install(build: Option<&str>) -> PyResult<engine::install::Install> {
    let found = engine::install::find(&[]);
    let picked = match build {
        Some(version) => found.into_iter().find(|i| i.version == version),
        None => found.into_iter().next(),
    };
    picked.ok_or_else(|| {
        err(match build {
            Some(version) => format!("Houdini {version} is not on this machine"),
            None => "no Houdini install found on this machine".to_string(),
        })
    })
}

/// Every Houdini install this machine holds, newest build first.
#[pyfunction]
fn installs() -> PyResult<String> {
    json(&engine::install::find(&[]))
}

/// One page, such as `nodes/sop/copytopoints`, as Markdown ready to read.
///
/// Never waits on the index: the page is parsed out of the install on the
/// spot, whether or not a pass has ever run.
#[pyfunction]
#[pyo3(signature = (path, build=None))]
fn page(path: &str, build: Option<&str>) -> PyResult<String> {
    let install = install(build)?;
    match engine::read_page(&install, path) {
        Ok(view) => json(&view),
        Err(reason) if reason.missing => Err(PyValueError::new_err(reason.message)),
        Err(reason) => Err(err(reason.message)),
    }
}

/// Ranked full-text search. Needs the index, so it fills it first when this
/// build has never been indexed — a whole pass takes seconds.
#[pyfunction]
#[pyo3(signature = (query, limit=5, build=None))]
fn search(query: &str, limit: u32, build: Option<&str>) -> PyResult<String> {
    let install = install(build)?;
    let db = index_for(&install)?;
    json(&engine::find(&db, &install.version, query, limit).map_err(err)?)
}

/// Every page title in the build, for a caller that wants to match a name
/// itself.
#[pyfunction]
#[pyo3(signature = (build=None))]
fn titles(build: Option<&str>) -> PyResult<String> {
    let install = install(build)?;
    let db = index_for(&install)?;
    json(&engine::all_titles(&db, &install.version).map_err(err)?)
}

/// Fills the index for a build and reports what it holds. The pass is skipped
/// when the build is already indexed, so this is cheap to call every time.
#[pyfunction]
#[pyo3(signature = (build=None))]
fn index(build: Option<&str>) -> PyResult<String> {
    let install = install(build)?;
    let db = index_for(&install)?;
    json(&engine::index::status(&db, &install.version))
}

/// An open `index.db` with this build in it.
fn index_for(install: &engine::install::Install) -> PyResult<engine::rusqlite::Connection> {
    let data = data_dir()?;
    let mut db = engine::db::open(&data).map_err(err)?;
    if !engine::index::status(&db, &install.version).done {
        engine::index::background_priority();
        engine::index::pass(&mut db, install, &|_| {}).map_err(err)?;
    }
    Ok(db)
}

#[pymodule]
fn houdinimd_docs(module: &Bound<'_, PyModule>) -> PyResult<()> {
    module.add_function(wrap_pyfunction!(installs, module)?)?;
    module.add_function(wrap_pyfunction!(page, module)?)?;
    module.add_function(wrap_pyfunction!(search, module)?)?;
    module.add_function(wrap_pyfunction!(titles, module)?)?;
    module.add_function(wrap_pyfunction!(index, module)?)?;
    Ok(())
}
