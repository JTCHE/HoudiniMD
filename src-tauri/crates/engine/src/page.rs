//! One page, read out of an install and made ready to draw.
//!
//! This never waits on the index. The first page a reader opens is parsed here
//! even if the background pass has not reached it yet.

use serde::Serialize;

use crate::{assets, examples, family, help, inherit, install};

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
    let path = path.to_string();
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
        help::page_layered(&roots, target).ok()
    });
    family::append(&install.help, &parsed.props, &mut parsed.blocks);
    let section = path.split('/').next().unwrap_or("");
    inherit::append(&install.help, section, &parsed.props, &mut parsed.blocks);
    examples::append(&install.help, &path, &mut parsed.blocks);
    assets::rewrite(&path, &mut parsed.blocks);
    let prop = |name: &str| wiki::model::prop(&parsed.props, name).map(str::to_string);
    Ok(PageView {
        path,
        name: display_name(&parsed),
        node_type: node_type(&parsed.props),
        icon: prop("icon").map(|icon| format!("{icon}.svg")),
        since: prop("since"),
        summary: parsed.summary.as_ref().map(|s| wiki::inline::plain(s)),
        markdown: wiki::markdown::blocks(&parsed.blocks, 1),
        version: install.version.clone(),
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

/// The name a reader sees. A page that carries a `version` property is one
/// entry of many under the same title, so the version is part of the name.
pub fn display_name(parsed: &wiki::Page) -> String {
    match wiki::model::prop(&parsed.props, "version") {
        Some(version) => format!("{} {version}", parsed.title_text),
        None => parsed.title_text.clone(),
    }
}
