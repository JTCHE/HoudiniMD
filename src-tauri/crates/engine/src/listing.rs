//! A page that lists other pages: `:list:` with a `#query:`, such as the node
//! index of a context (`nodes/sop/index`). SideFX's help server answers the
//! query from its own search index at read time; the markup carries only the
//! query, so a page read without this is a heading over nothing.
//! See spec: Faulty Home Page Quick Links & Category Indexes.
//!
//! The catalog is the head of every page in the install — title, summary and
//! `#` properties — read once per install and kept, the way `family.rs` keeps
//! `vex.zip`. Not in the `wiki` crate: this reads every page of the install.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, LazyLock, Mutex};

use rayon::prelude::*;
use wiki::model::{ListItem, Title};
use wiki::{Block, Inline, LinkTarget, Props};

struct Card {
    /// `/nodes/sop/box`, the form a query's `path:` is written against.
    path: String,
    title: String,
    summary: Option<String>,
    props: Props,
}

static CACHE: LazyLock<Mutex<HashMap<Vec<PathBuf>, Arc<Vec<Card>>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

fn catalog(roots: &[PathBuf]) -> Arc<Vec<Card>> {
    let mut cache = CACHE.lock().expect("the listing cache is not poisoned");
    if let Some(found) = cache.get(roots) {
        return found.clone();
    }
    let built = Arc::new(build(roots));
    cache.insert(roots.to_vec(), built.clone());
    built
}

/// Builds the catalog now, so the first index page the reader opens does not
/// wait the second it takes.
pub fn warm(roots: &[PathBuf]) {
    catalog(roots);
}

/// Parsing only the head of each page keeps the whole install to a second.
fn build(roots: &[PathBuf]) -> Vec<Card> {
    let sections = crate::index::sections(roots);
    sections
        .par_iter()
        .flat_map_iter(|(section, _)| roots.iter().flat_map(|root| crate::index::read_section(root, section)))
        .map(|(path, source)| {
            let page = head(&source);
            // A few pages carry no title line; the reader still needs a name.
            let title = match page.title_text.is_empty() {
                true => path.rsplit('/').next().unwrap_or(&path).to_string(),
                false => page.title_text,
            };
            Card {
                path: format!("/{path}"),
                title,
                summary: page.summary.map(|s| wiki::inline::plain(&s)),
                props: page.props,
            }
        })
        .collect()
}

/// The head of a page: the title line, the properties and the summary, which
/// the help writes before any section. Forty lines holds it on every page.
fn head(source: &str) -> wiki::Page {
    wiki::parse(&source.lines().take(40).collect::<Vec<_>>().join("\n"))
}

/// The title of the page at `path`, for a link that names a page and nothing
/// else. One small read per link; a page carries a few dozen at most.
pub fn title(roots: &[PathBuf], path: &str) -> Option<String> {
    let source = crate::help::page_layered(roots, path).ok()?;
    Some(head(&source).title_text).filter(|t| !t.is_empty())
}

/// Replaces every `:list:` that carries a `#query:` with the pages it names.
/// `page` is the path of the page being read, which a `#labels:` file sits
/// beside.
pub fn resolve(roots: &[PathBuf], page: &str, blocks: &mut Vec<Block>) {
    let mut at = 0;
    while at < blocks.len() {
        if let Block::Item { name, props, .. } = &blocks[at]
            && (name == "list" || name == "suite_list")
            && let Some(query) = wiki::model::prop(props, "query").and_then(Query::parse)
        {
            let listed = list(roots, page, &query, props);
            let count = listed.len();
            blocks.splice(at..=at, listed);
            at += count;
            continue;
        }
        if let Block::Heading { children, .. }
        | Block::Section { children, .. }
        | Block::Definition { children, .. }
        | Block::Item { children, .. }
        | Block::Divider { children, .. }
        | Block::Html { children, .. } = &mut blocks[at]
        {
            resolve(roots, page, children);
        }
        at += 1;
    }
}

fn list(roots: &[PathBuf], page: &str, query: &Query, props: &Props) -> Vec<Block> {
    let all = catalog(roots);
    let sorted_by = wiki::model::prop(props, "sortedby").unwrap_or("title");
    let mut found: Vec<&Card> = all.iter().filter(|card| query.matches(card)).collect();
    found.sort_by_cached_key(|card| field(card, sorted_by).unwrap_or_else(|| card.title.to_lowercase()));
    found.dedup_by(|a, b| a.path == b.path);

    let Some(grouped_by) = wiki::model::prop(props, "groupedby") else {
        return vec![bullets(&found)];
    };
    let labels = wiki::model::prop(props, "labels").map(|file| labels(roots, page, file)).unwrap_or_default();
    let mut groups: Vec<(String, Vec<&Card>)> = Vec::new();
    for card in found {
        let key = wiki::model::prop(&card.props, grouped_by).unwrap_or("").trim().to_string();
        match groups.iter_mut().find(|(k, _)| *k == key) {
            Some((_, cards)) => cards.push(card),
            None => groups.push((key, vec![card])),
        }
    }
    let label = |key: &str| labels.get(key).cloned().unwrap_or_else(|| key.to_string());
    // Named groups in label order; what carries no group comes last.
    groups.sort_by_cached_key(|(key, _)| (key.is_empty(), label(key).to_lowercase()));
    groups
        .into_iter()
        .map(|(key, cards)| Block::Heading {
            level: 3,
            id: None,
            title: Title {
                main: vec![Inline::Text { text: if key.is_empty() { "Other".into() } else { label(&key) } }],
                ..Title::default()
            },
            props: Vec::new(),
            children: vec![bullets(&cards)],
        })
        .collect()
}

fn bullets(cards: &[&Card]) -> Block {
    let items = cards
        .iter()
        .map(|card| {
            let mut text = vec![Inline::Link {
                text: vec![Inline::Text { text: card.title.clone() }],
                target: LinkTarget::Wiki { path: card.path.clone(), anchor: None },
            }];
            if let Some(summary) = card.summary.as_deref().filter(|s| !s.is_empty()) {
                text.push(Inline::Text { text: format!(" — {summary}") });
            }
            ListItem { blocks: vec![Block::Paragraph { text }], props: Vec::new() }
        })
        .collect();
    Block::Bullets { items }
}

/// `_groups_en.ini` beside the page: `key=Label` lines under `[Labels]`.
fn labels(roots: &[PathBuf], page: &str, file: &str) -> HashMap<String, String> {
    let (section, rest) = page.split_once('/').unwrap_or((page, ""));
    let dir = rest.rsplit_once('/').map(|(dir, _)| format!("{dir}/")).unwrap_or_default();
    let text = roots
        .iter()
        .find_map(|root| crate::help::text(&root.join(format!("{section}.zip")), &format!("{dir}{file}")))
        .unwrap_or_default();
    text.lines()
        .filter_map(|line| line.split_once('='))
        .map(|(key, label)| (key.trim().to_string(), label.trim().to_string()))
        .collect()
}

/// What a query's `field:` reads on one page, lower-cased.
fn field(card: &Card, name: &str) -> Option<String> {
    let value = match name {
        "path" => Some(card.path.clone()),
        "title" => Some(card.title.clone()),
        "isindex" => Some(card.path.ends_with("/index").to_string()),
        "sortkey" => wiki::model::prop(&card.props, "sortkey").map(str::to_string).or(Some(card.title.clone())),
        // A Python page names its module in its title: `hapi.addAttribute`.
        "py_parent" => wiki::model::prop(&card.props, "py_parent")
            .map(str::to_string)
            .or_else(|| card.title.rsplit_once('.').map(|(parent, _)| parent.to_string())),
        other => wiki::model::prop(&card.props, other).map(str::to_string),
    };
    value.map(|v| v.to_lowercase())
}

/// The query language of SideFX's help search: `field:value` terms, joined by
/// `AND` (or nothing), `OR` and `ANDNOT`, with parentheses. `*` is a wildcard.
#[derive(Debug, PartialEq)]
enum Query {
    Term(String, String),
    And(Box<Query>, Box<Query>),
    Or(Box<Query>, Box<Query>),
    AndNot(Box<Query>, Box<Query>),
}

impl Query {
    fn parse(text: &str) -> Option<Query> {
        let spaced = text.replace('(', " ( ").replace(')', " ) ");
        let mut tokens = spaced.split_whitespace().peekable();
        let query = Self::or(&mut tokens)?;
        tokens.next().is_none().then_some(query)
    }

    fn or<'a>(tokens: &mut std::iter::Peekable<impl Iterator<Item = &'a str>>) -> Option<Query> {
        let mut left = Self::and(tokens)?;
        while tokens.peek() == Some(&"OR") {
            tokens.next();
            left = Query::Or(Box::new(left), Box::new(Self::and(tokens)?));
        }
        Some(left)
    }

    fn and<'a>(tokens: &mut std::iter::Peekable<impl Iterator<Item = &'a str>>) -> Option<Query> {
        let mut left = Self::atom(tokens)?;
        loop {
            match tokens.peek() {
                None | Some(&")") | Some(&"OR") => return Some(left),
                Some(&"ANDNOT") => {
                    tokens.next();
                    left = Query::AndNot(Box::new(left), Box::new(Self::atom(tokens)?));
                }
                Some(&"AND") => {
                    tokens.next();
                    left = Query::And(Box::new(left), Box::new(Self::atom(tokens)?));
                }
                Some(_) => left = Query::And(Box::new(left), Box::new(Self::atom(tokens)?)),
            }
        }
    }

    fn atom<'a>(tokens: &mut std::iter::Peekable<impl Iterator<Item = &'a str>>) -> Option<Query> {
        let token = tokens.next()?;
        if token == "(" {
            let inner = Self::or(tokens)?;
            return (tokens.next() == Some(")")).then_some(inner);
        }
        let (name, value) = token.split_once(':')?;
        Some(Query::Term(name.to_lowercase(), value.to_lowercase()))
    }

    fn matches(&self, card: &Card) -> bool {
        match self {
            Query::And(a, b) => a.matches(card) && b.matches(card),
            Query::Or(a, b) => a.matches(card) || b.matches(card),
            Query::AndNot(a, b) => a.matches(card) && !b.matches(card),
            Query::Term(name, value) => {
                let Some(have) = field(card, name) else { return false };
                // A field is a list of keywords: one word of the title, one
                // tag, one of `#context: fog, light, surface`.
                glob(value, have.trim())
                    || (!matches!(name.as_str(), "path" | "sortkey")
                        && have.split(|c: char| c == ',' || c.is_whitespace()).any(|word| glob(value, word)))
            }
        }
    }
}

/// `*` matches any run of characters, anything else matches itself.
fn glob(pattern: &str, text: &str) -> bool {
    match pattern.split_once('*') {
        None => pattern == text,
        Some((head, rest)) => {
            let Some(text) = text.strip_prefix(head) else { return false };
            rest.is_empty() || (0..=text.len()).filter(|&i| text.is_char_boundary(i)).any(|i| glob(rest, &text[i..]))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn card(path: &str, title: &str, props: &[(&str, &str)]) -> Card {
        Card {
            path: path.into(),
            title: title.into(),
            summary: None,
            props: props.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect(),
        }
    }

    #[test]
    fn a_context_index_lists_its_nodes_and_not_itself() {
        let q = Query::parse("type:node context:sop  ANDNOT isindex:true").unwrap();
        assert!(q.matches(&card("/nodes/sop/box", "Box", &[("type", "node"), ("context", "sop")])));
        assert!(!q.matches(&card("/nodes/sop/index", "Geometry nodes", &[("type", "node"), ("context", "sop")])));
        assert!(!q.matches(&card("/nodes/dop/box", "Box", &[("type", "node"), ("context", "dop")])));
    }

    #[test]
    fn parentheses_or_and_wildcards() {
        let q = Query::parse("(type:vex OR type:vexstatement) ANDNOT sortkey:__*").unwrap();
        assert!(q.matches(&card("/vex/functions/abs", "abs", &[("type", "vex")])));
        assert!(!q.matches(&card("/vex/functions/x", "x", &[("type", "vex"), ("sortkey", "__x")])));
        let q = Query::parse("type:node path:/gallery/shop/vopmaterial/*").unwrap();
        assert!(q.matches(&card("/gallery/shop/vopmaterial/wood", "Wood", &[("type", "node")])));
    }

    #[test]
    fn python_parent_and_tags() {
        let q = Query::parse("(type:pyclass OR type:pyfunction) AND py_parent:pdgd ANDNOT tags:internal").unwrap();
        assert!(q.matches(&card("/tops/pdgd/A", "pdgd.A", &[("type", "pyclass")])));
        assert!(!q.matches(&card("/tops/pdgd/B", "pdgd.B", &[("type", "pyclass"), ("tags", "message internal")])));
    }

    #[test]
    fn a_broken_query_is_refused() {
        assert_eq!(Query::parse("(type:vex"), None);
        assert_eq!(Query::parse("<<search query>>`:"), None);
    }
}
