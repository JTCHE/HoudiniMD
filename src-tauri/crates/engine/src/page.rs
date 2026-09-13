//! One page, read out of an install and made ready to draw.
//!
//! This never waits on the index. The first page a reader opens is parsed here
//! even if the background pass has not reached it yet.

use serde::Serialize;

use crate::{assets, examples, family, help, inherit, install, listing};

/// One page, ready to draw. The body is Markdown, which the front-end renders
/// with the same component map the site uses.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PageView {
    pub path: String,
    /// The page name, as written in the help source.
    pub name: String,
    /// The kind of page, for the header: "Geometry node", "VEX function".
    pub node_type: Option<String>,
    /// An icon path inside `icons.zip`, such as `SOP/copytopoints.svg`.
    pub icon: Option<String>,
    /// The Houdini version the node arrived in.
    pub since: Option<String>,
    pub summary: Option<String>,
    pub markdown: String,
    /// The build the page was read from.
    pub version: String,
    /// Every version of this node, newest first, for the selector in the
    /// header. The read leaves it empty: it comes out of the index, and the
    /// caller that holds the index fills it with `versions::of`.
    pub node_versions: Vec<crate::versions::NodeVersion>,
}

/// Why a page did not come back. `missing` says this build holds no such page,
/// which the front-end draws as the not-found page.
#[derive(Debug, Serialize)]
pub struct PageError {
    pub missing: bool,
    pub message: String,
}

/// Reads and parses one page, such as `nodes/sop/copytopoints`.
pub fn read(install: &install::Install, path: &str) -> Result<PageView, PageError> {
    // A folder address names the index page inside it. The view has to say
    // which page it holds: the copy-path keys hand out `<page>.md`, and
    // `nodes/sop/.md` names no page.
    let path = match path.strip_suffix('/') {
        Some(folder) => format!("{folder}/index"),
        None => path.to_string(),
    };
    let roots = install.help_roots();
    let source = help::page_layered(&roots, &path).map_err(|reason| match reason {
        help::PageError::Missing => PageError {
            missing: true,
            message: format!("no page {path} in Houdini {}", install.version),
        },
        help::PageError::Unreadable(message) => PageError { missing: false, message },
    })?;
    let mut parsed = wiki::parse(&source);
    wiki::include::resolve(&mut parsed.blocks, &path, &|target| {
        help::page_layered(&roots, target).ok().map(|source| std::sync::Arc::new(wiki::parse(&source).blocks))
    });
    listing::resolve(&roots, &path, &mut parsed.blocks);
    family::append(&install.help, &parsed.props, &mut parsed.blocks);
    let section = path.split('/').next().unwrap_or("");
    inherit::append(&install.help, section, &parsed.props, &mut parsed.blocks);
    examples::append(&install.help, &path, &mut parsed.blocks);
    let links = assets::Links {
        name_of: &|target| listing::title(&roots, target),
        exists: &|target| help::exists_layered(&roots, target),
    };
    assets::rewrite(&path, &mut parsed.blocks, &links);
    let prop = |name: &str| wiki::model::prop(&parsed.props, name).map(str::to_string);
    Ok(PageView {
        path,
        name: parsed.title_text.clone(),
        node_type: node_type(&parsed.props),
        icon: prop("icon").map(|icon| format!("{icon}.svg")),
        since: prop("since"),
        summary: parsed.summary.as_ref().map(|s| wiki::inline::plain(s)),
        markdown: wiki::markdown::blocks(&parsed.blocks, 1),
        version: install.version.clone(),
        node_versions: Vec::new(),
    })
}

/// The kind of page, for the header. Only a node page has one.
pub fn node_type(props: &wiki::Props) -> Option<String> {
    let kind = wiki::model::prop(props, "type")?;
    let context = wiki::model::prop(props, "context")?;
    if kind != "node" {
        return None;
    }
    let label = match context {
        "sop" => "Geometry node",
        "dop" => "Dynamics node",
        "obj" => "Object node",
        "cop" => "Copernicus node",
        "lop" => "LOP node",
        "out" | "rop" => "Render node",
        "top" => "TOP node",
        "chop" => "Channel node",
        "vop" => "VOP node",
        "shop" => "Shader node",
        "apex" => "APEX node",
        other => return Some(format!("{other} node")),
    };
    Some(label.to_string())
}
