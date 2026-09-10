//! The documentation engine as a Python module.
//!
//! The HoudiniMCP bridge reads Houdini's help through this instead of over
//! HTTP: same parse and same search as the desktop app, and no network.
//! Every call answers with a JSON string, which is what the bridge sends on
//! anyway.
//!
//! The caller names the folder the index lives in. This module has no folder
//! of its own and never writes into the desktop app's: a machine with only the
//! bridge on it gets only the bridge's folder.
//!
//! No documentation content ships here. Every page comes from the Houdini
//! install on the machine that asks.

use std::path::PathBuf;
use std::sync::Mutex;

use engine::install::{Cache, Install};
use engine::rusqlite::Connection;
use pyo3::exceptions::{PyRuntimeError, PyValueError};
use pyo3::prelude::*;

fn err(reason: impl ToString) -> PyErr {
    PyRuntimeError::new_err(reason.to_string())
}

fn json<T: serde::Serialize>(value: &T) -> PyResult<String> {
    serde_json::to_string(value).map_err(err)
}

/// One reader of the documentation, with its index in `data_dir`.
///
/// Keep one for the life of the process: it scans for installs once and holds
/// the index open, so a call after the first costs the query and no more.
#[pyclass(module = "houdinimd_docs")]
struct Docs {
    data: PathBuf,
    installs: Cache,
    db: Mutex<Option<Connection>>,
}

impl Docs {
    /// The install a call reads. `build` names one, such as `22.0.368`;
    /// without it the reader gets `$HFS` — the Houdini the caller is talking
    /// to — and then the newest build on the machine.
    fn install(&self, build: Option<&str>) -> PyResult<Install> {
        let found = self.installs.get();
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

    /// Runs `read` on the open index, after filling it for this build when it
    /// has never been filled. The pass runs once per build per machine — the
    /// rows stay on disk — and at full priority, because a caller is waiting
    /// on it. The app runs its pass in background mode instead; here that
    /// doubles the wait.
    fn with_index<T>(
        &self,
        py: Python<'_>,
        install: &Install,
        read: impl FnOnce(&Connection) -> Result<T, String> + Send,
    ) -> PyResult<T>
    where
        T: Send,
    {
        py.detach(|| {
            let mut db = self.db.lock().map_err(err)?;
            if db.is_none() {
                *db = Some(engine::db::open(&self.data).map_err(err)?);
            }
            let db = db.as_mut().expect("opened above");
            if !engine::index::status(db, &install.version).done {
                engine::index::pass(db, install, &|_| {}).map_err(err)?;
            }
            read(db).map_err(err)
        })
    }
}

#[pymethods]
impl Docs {
    #[new]
    fn new(data_dir: PathBuf) -> Self {
        Docs { data: data_dir, installs: Cache::new(), db: Mutex::new(None) }
    }

    /// Every Houdini install this machine holds, newest build first.
    fn installs(&self) -> PyResult<String> {
        json(&self.installs.get())
    }

    /// One page, such as `nodes/sop/copytopoints`, as Markdown ready to read.
    /// Raises `ValueError` when the build has no such page.
    ///
    /// Never waits on the index: the page is parsed out of the install on the
    /// spot, whether or not a pass has ever run.
    #[pyo3(signature = (path, build=None))]
    fn page(&self, py: Python<'_>, path: &str, build: Option<&str>) -> PyResult<String> {
        let install = self.install(build)?;
        match py.detach(|| engine::read_page(&install, path)) {
            Ok(view) => json(&view),
            Err(reason) if reason.missing => Err(PyValueError::new_err(reason.message)),
            Err(reason) => Err(err(reason.message)),
        }
    }

    /// Ranked full-text search, best first.
    #[pyo3(signature = (query, limit=5, build=None))]
    fn search(&self, py: Python<'_>, query: &str, limit: u32, build: Option<&str>) -> PyResult<String> {
        let install = self.install(build)?;
        let hits = self.with_index(py, &install, |db| engine::find(db, &install.version, query, limit))?;
        json(&hits)
    }

    /// Every page title in the build.
    #[pyo3(signature = (build=None))]
    fn titles(&self, py: Python<'_>, build: Option<&str>) -> PyResult<String> {
        let install = self.install(build)?;
        let titles = self.with_index(py, &install, |db| engine::all_titles(db, &install.version))?;
        json(&titles)
    }

    /// Fills the index for a build, when it is not filled yet, and reports
    /// what it holds.
    #[pyo3(signature = (build=None))]
    fn index(&self, py: Python<'_>, build: Option<&str>) -> PyResult<String> {
        let install = self.install(build)?;
        let status = self.with_index(py, &install, |db| Ok(engine::index::status(db, &install.version)))?;
        json(&status)
    }
}

#[pymodule]
fn houdinimd_docs(module: &Bound<'_, PyModule>) -> PyResult<()> {
    module.add_class::<Docs>()
}
