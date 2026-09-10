//! The sibling list a VEX function or statement page carries at its foot:
//! every other page that shares one of its `#tags`, one heading per tag.
//!
//! SideFX's own doc build writes this from a tag index that sits outside the
//! page source, so the raw wiki markup never carries it — the app rebuilds it
//! from its own reading of `vex.zip` instead. See spec: Local — VEX pages lose
//! the family index.
//!
//! Not in the `wiki` crate: the crate reads no file, and this reads every VEX
//! page once to answer one page. See `agents/architecture.md`.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, LazyLock, Mutex};

use wiki::model::ListItem;
use wiki::{Block, Inline, LinkTarget};

struct Entry {
    name: String,
    tags: Vec<String>,
}

/// `vex.zip` read once per install and reused for every function page after
/// the first. About 1,100 small pages; parsing them again for every page open
/// would cost more than the page itself.
static CACHE: LazyLock<Mutex<HashMap<PathBuf, Arc<Vec<Entry>>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

fn entries(help: &Path) -> Arc<Vec<Entry>> {
    let zip = help.join("vex.zip");
    let mut cache = CACHE.lock().expect("the family cache is not poisoned");
    if let Some(found) = cache.get(&zip) {
        return found.clone();
    }
    let built = Arc::new(read(&zip));
    cache.insert(zip, built.clone());
    built
}

fn read(zip: &Path) -> Vec<Entry> {
    let names = crate::help::entries(zip, "functions/")
        .into_iter()
        .chain(crate::help::entries(zip, "statements/"));
    let mut out = Vec::new();
    for name in names {
        let stem = name
            .rsplit('/')
            .next()
            .unwrap_or(&name)
            .trim_end_matches(".txt");
        // A page written to be included by another, not a function of its own.
        if stem.starts_with('_') {
            continue;
        }
        let Some(source) = crate::help::text(zip, &name) else {
            continue;
        };
        let (props, _) = wiki::blocks::parse_source(&source);
        if !matches!(wiki::model::prop(&props, "type"), Some("vex" | "vexstatement")) {
            continue;
        }
        let Some(tags) = wiki::model::prop(&props, "tags") else {
            continue;
        };
        let tags = tags
            .split(',')
            .map(str::trim)
            .filter(|t| !t.is_empty())
            .map(str::to_string)
            .collect();
        out.push(Entry { name: stem.to_string(), tags });
    }
    out
}

/// Appends one `Block::Section` per tag the page carries, each an
/// alphabetical list of every VEX function or statement with that tag
/// (this page included), in the order the page's own `#tags` lists them.
pub fn append(help: &Path, props: &wiki::Props, blocks: &mut Vec<Block>) {
    if !matches!(wiki::model::prop(props, "type"), Some("vex" | "vexstatement")) {
        return;
    }
    let Some(own_tags) = wiki::model::prop(props, "tags") else {
        return;
    };
    let all = entries(help);
    for tag in own_tags.split(',').map(str::trim).filter(|t| !t.is_empty()) {
        let mut names: Vec<&str> = all
            .iter()
            .filter(|entry| entry.tags.iter().any(|t| t == tag))
            .map(|entry| entry.name.as_str())
            .collect();
        names.sort_unstable();
        names.dedup();
        if names.is_empty() {
            continue;
        }
        let items = names
            .into_iter()
            .map(|name| ListItem {
                blocks: vec![Block::Paragraph {
                    text: vec![Inline::Link {
                        text: vec![Inline::Text { text: name.to_string() }],
                        target: LinkTarget::Vex { name: name.to_string() },
                    }],
                }],
                props: Vec::new(),
            })
            .collect();
        blocks.push(Block::Section {
            name: tag.to_string(),
            title: None,
            props: Vec::new(),
            children: vec![Block::Bullets { items }],
        });
    }
}
