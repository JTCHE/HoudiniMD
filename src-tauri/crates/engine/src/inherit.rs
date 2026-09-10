//! The methods a class page gets from the classes above it.
//!
//! A Python class page names its parent with `#superclass:` and nothing more.
//! SideFX's own doc build reads that marker and writes one "Methods from X"
//! section per ancestor, so the page shows every call the reader can make on
//! the object. The page source carries none of it, so a class that adds no
//! method of its own reaches the reader with an empty body. See spec:
//! Local — Some pages come back with an empty body.
//!
//! Not in the `wiki` crate: the crate reads no file, and this reads the
//! ancestor pages. Same reason as `family.rs`. See `agents/architecture.md`.

use std::path::Path;

use wiki::Block;

/// How far up the chain to walk. A `hou` class is three or four deep. The cap
/// is what stops a source that names an ancestor already on the chain.
const DEPTH: usize = 8;

/// Appends one section per ancestor that has methods, nearest ancestor first.
///
/// `section` is the first part of the page's own path — `tops` for
/// `tops/pdg/WorkItemDataType` — because a superclass is written in dotted
/// form, `pdg.BaseType`, and lives beside its child under the same section.
pub fn append(help: &Path, section: &str, props: &wiki::Props, blocks: &mut Vec<Block>) {
    let mut next = wiki::model::prop(props, "superclass").map(str::to_string);
    let mut walked: Vec<String> = Vec::new();
    for _ in 0..DEPTH {
        let Some(name) = next.take() else {
            break;
        };
        if walked.contains(&name) {
            break;
        }
        walked.push(name.clone());
        let path = format!("{section}/{}", name.replace('.', "/"));
        let Ok(source) = crate::help::page(help, &path) else {
            break;
        };
        let (props, parsed) = wiki::blocks::parse_source(&source);
        if let Some(children) = methods(parsed) {
            blocks.push(Block::Section {
                // The name is what the renderer switches on, so it stays
                // `methods`. The title is what the reader sees, and it has to
                // say WHICH class these came from.
                name: "methods".to_string(),
                title: Some(vec![wiki::Inline::Text {
                    text: format!("Methods from {name}"),
                }]),
                props: Vec::new(),
                children,
            });
        }
        next = wiki::model::prop(&props, "superclass").map(str::to_string);
    }
}

fn methods(blocks: Vec<Block>) -> Option<Vec<Block>> {
    blocks.into_iter().find_map(|block| match block {
        Block::Section { name, children, .. } if name == "methods" && !children.is_empty() => {
            Some(children)
        }
        _ => None,
    })
}
