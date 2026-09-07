//! The example files that ship for a node, as a section at the foot of its
//! page.
//!
//! An example is a scene file plus a page beside it, under
//! `help/examples/<node path>/`. The node page itself never names them —
//! SideFX's doc build finds them by their place on the disk and writes the
//! Examples section from what it finds. See spec: Local — Whole sections are
//! dropped from pages.
//!
//! Not in the `wiki` crate: the crate reads no file, and this reads a
//! directory. Same reason as `family.rs`. See `agents/architecture.md`.

use std::path::Path;

use wiki::model::ListItem;
use wiki::{Block, Inline, LinkTarget};

/// Appends an Examples section when the install ships examples for this page.
///
/// `path` is the page's own help path, `nodes/sop/file`. The examples for it
/// sit under `examples/` at the same path.
pub fn append(help: &Path, path: &str, blocks: &mut Vec<Block>) {
    if path.starts_with("examples/") {
        return;
    }
    let mut dir = help.join("examples");
    for part in path.split('/') {
        dir.push(part);
    }
    let Ok(entries) = std::fs::read_dir(&dir) else {
        return;
    };
    let mut names: Vec<String> = entries
        .flatten()
        .filter_map(|entry| {
            let file = entry.file_name().into_string().ok()?;
            file.strip_suffix(".txt").map(str::to_string)
        })
        .collect();
    if names.is_empty() {
        return;
    }
    names.sort_unstable();

    let items = names
        .into_iter()
        .map(|name| ListItem {
            blocks: vec![Block::Paragraph {
                text: vec![Inline::Link {
                    text: vec![Inline::Text { text: name.clone() }],
                    target: LinkTarget::Wiki {
                        path: format!("/examples/{path}/{name}"),
                        anchor: None,
                    },
                }],
            }],
            props: Vec::new(),
        })
        .collect();
    blocks.push(Block::Section {
        name: "examples".to_string(),
        title: None,
        props: Vec::new(),
        children: vec![Block::Bullets { items }],
    });
}
