//! Inline markup: styles, keys, links, icons and the typography rules.

use crate::model::{IconSize, Inline, LinkTarget};

pub fn parse(text: &str) -> Vec<Inline> {
    Parser::new(text).run()
}

/// The plain text of a run of inlines. Used for titles, headings and the index.
pub fn plain(inlines: &[Inline]) -> String {
    let mut out = String::new();
    write_plain(inlines, &mut out);
    out
}

fn write_plain(inlines: &[Inline], out: &mut String) {
    for inline in inlines {
        match inline {
            Inline::Text { text } | Inline::Raw { text } | Inline::Code { text } => {
                out.push_str(text)
            }
            Inline::Var { name } => out.push_str(name),
            Inline::Key { key } => out.push_str(key),
            Inline::Bold { body } | Inline::Italic { body } | Inline::Ui { body } => {
                write_plain(body, out)
            }
            Inline::Link { text, .. } => write_plain(text, out),
            Inline::Glyph { .. }
            | Inline::Fold { .. }
            | Inline::Image { .. }
            | Inline::Icon { .. } => {}
        }
    }
}

struct Parser<'a> {
    src: &'a [u8],
    text: &'a str,
    pos: usize,
    out: Vec<Inline>,
    buf: String,
}

impl<'a> Parser<'a> {
    fn new(text: &'a str) -> Self {
        Self {
            src: text.as_bytes(),
            text,
            pos: 0,
            out: Vec::new(),
            buf: String::new(),
        }
    }

    fn run(mut self) -> Vec<Inline> {
        while self.pos < self.src.len() {
            if self.try_token() {
                continue;
            }
            self.push_char();
        }
        self.flush();
        self.out
    }

    fn flush(&mut self) {
        if !self.buf.is_empty() {
            let text = std::mem::take(&mut self.buf);
            self.out.push(Inline::Text { text });
        }
    }

    fn push(&mut self, inline: Inline) {
        self.flush();
        self.out.push(inline);
    }

    /// Advance one character, applying the typography replacements.
    fn push_char(&mut self) {
        let rest = &self.text[self.pos..];
        for (from, to) in TYPOGRAPHY {
            if rest.starts_with(from) {
                self.buf.push_str(to);
                self.pos += from.len();
                return;
            }
        }
        let c = rest.chars().next().expect("position is on a boundary");
        self.buf.push(c);
        self.pos += c.len_utf8();
    }

    fn rest(&self) -> &'a str {
        &self.text[self.pos..]
    }

    fn try_token(&mut self) -> bool {
        let rest = self.rest();
        match self.src[self.pos] {
            b'`' => self.code(rest),
            b'[' => self.bracket(rest),
            b'<' if rest.starts_with("<<") => {
                self.wrapped(rest, "<<", ">>", |name| Inline::Var { name })
            }
            b'(' if rest.starts_with("((") => {
                self.wrapped(rest, "((", "))", |key| Inline::Key { key })
            }
            b'+' if rest.starts_with("+(") => {
                self.wrapped(rest, "+(", ")", |name| Inline::Glyph { name })
            }
            b'_' if rest.starts_with("__") => self.style(rest, "__", |body| Inline::Ui { body }),
            b'*' => self.style(rest, "*", |body| Inline::Bold { body }),
            b'_' => self.style(rest, "_", |body| Inline::Italic { body }),
            _ => false,
        }
    }

    fn code(&mut self, rest: &str) -> bool {
        let Some(end) = rest[1..].find('`') else {
            return false;
        };
        let text = rest[1..1 + end].to_string();
        self.push(Inline::Code { text });
        self.pos += end + 2;
        true
    }

    fn wrapped(
        &mut self,
        rest: &str,
        open: &str,
        close: &str,
        make: impl Fn(String) -> Inline,
    ) -> bool {
        let Some(end) = rest[open.len()..].find(close) else {
            return false;
        };
        let body = rest[open.len()..open.len() + end].to_string();
        self.push(make(body));
        self.pos += open.len() + end + close.len();
        true
    }

    /// A style marker only opens at a word boundary and only closes on
    /// non-space, so `4x4`, `snake_case` and `a * b` stay as they are.
    fn style(&mut self, rest: &str, marker: &str, make: impl Fn(Vec<Inline>) -> Inline) -> bool {
        if !self.at_word_start() {
            return false;
        }
        let body_start = marker.len();
        if rest[body_start..].starts_with(char::is_whitespace) {
            return false;
        }
        let mut search = body_start;
        let end = loop {
            let Some(found) = rest[search..].find(marker) else {
                return false;
            };
            let at = search + found;
            let before = rest[..at].chars().next_back();
            let after = &rest[at + marker.len()..];
            let closes = before.is_some_and(|c| !c.is_whitespace())
                && (after.is_empty()
                    || after
                        .chars()
                        .next()
                        .is_some_and(|c| !c.is_alphanumeric() || marker == "__"));
            if closes {
                break at;
            }
            search = at + marker.len();
        };
        let body = parse(&rest[body_start..end]);
        self.push(make(body));
        self.pos += end + marker.len();
        true
    }

    fn at_word_start(&self) -> bool {
        match self.text[..self.pos].chars().next_back() {
            None => true,
            Some(c) => !c.is_alphanumeric(),
        }
    }

    /// `[...]` covers links, shortcuts, images, icons and folds.
    fn bracket(&mut self, rest: &str) -> bool {
        let Some(end) = find_close_bracket(rest) else {
            return false;
        };
        let body = &rest[1..end];
        let Some(inline) = parse_bracket(body) else {
            return false;
        };
        self.push(inline);
        self.pos += end + 1;
        true
    }
}

/// Brackets nest, because link text can hold an icon.
fn find_close_bracket(rest: &str) -> Option<usize> {
    let mut depth = 0usize;
    for (i, c) in rest.char_indices() {
        match c {
            '[' => depth += 1,
            ']' => {
                depth -= 1;
                if depth == 0 {
                    return Some(i);
                }
            }
            _ => {}
        }
    }
    None
}

fn parse_bracket(body: &str) -> Option<Inline> {
    let (text, target) = match body.split_once('|') {
        Some((text, target)) => (Some(text.trim()), target.trim()),
        None => (None, body.trim()),
    };
    if target.is_empty() {
        return None;
    }
    if let Some((scheme, value)) = split_shortcut(target) {
        let value = value.trim();
        let target_kind = match scheme.as_str() {
            "image" => return Some(Inline::Image { src: value.into() }),
            "smallicon" => {
                return Some(Inline::Icon {
                    src: value.into(),
                    size: IconSize::Small,
                });
            }
            "icon" => {
                return Some(Inline::Icon {
                    src: value.into(),
                    size: IconSize::Normal,
                });
            }
            "largeicon" => {
                return Some(Inline::Icon {
                    src: value.into(),
                    size: IconSize::Large,
                });
            }
            "fold" => return Some(Inline::Fold { name: value.into() }),
            // `Link:` says nothing about the target beyond "this is a link";
            // what follows is an ordinary help path, relative or not.
            "link" => wiki_target(value),
            // A shelf tool lives under the shelf section, the same way a node
            // lives under `nodes`. Left alone, the name reads as a page beside
            // whatever page wrote the link.
            "shelf" => wiki_target(&format!("/shelf/{value}")),
            "node" => LinkTarget::Node { path: value.into() },
            "exp" => LinkTarget::Expression { name: value.into() },
            "vex" => LinkTarget::Vex { name: value.into() },
            "mantra" => LinkTarget::Mantra { name: value.into() },
            "cmd" => LinkTarget::HScript { name: value.into() },
            // Every HAPI cross-reference is written against the `hapi`
            // module, so the doc build drops it from the path and keeps it
            // only in the label: `hapi.AttributeInfo#count` links to
            // `AttributeInfo.html#count`.
            "py" => {
                let value = value.strip_prefix("hapi.").unwrap_or(value);
                let (path, member) = match value.split_once('#') {
                    Some((path, member)) => (path.to_string(), Some(member.to_string())),
                    None => (value.to_string(), None),
                };
                LinkTarget::Py { path, member }
            }
            "wp" => LinkTarget::Wikipedia {
                article: value.into(),
            },
            "hom" => {
                let (path, member) = match value.split_once('#') {
                    Some((path, member)) => (path.to_string(), Some(member.to_string())),
                    None => (value.to_string(), None),
                };
                LinkTarget::Hom { path, member }
            }
            "http" | "https" | "ftp" | "mailto" => LinkTarget::Web {
                url: target.to_string(),
            },
            _ => wiki_target(target),
        };
        return Some(link(text, target, target_kind));
    }
    Some(link(text, target, wiki_target(target)))
}

fn link(text: Option<&str>, target_text: &str, target: LinkTarget) -> Inline {
    let text = match text {
        Some(text) => parse(text),
        None => default_text(&target, target_text),
    };
    Inline::Link { text, target }
}

/// A shortcut with no text of its own shows the name it points at.
fn default_text(target: &LinkTarget, raw: &str) -> Vec<Inline> {
    let text = match target {
        LinkTarget::Node { path } => path.rsplit('/').next().unwrap_or(path).to_string(),
        LinkTarget::Expression { name }
        | LinkTarget::Vex { name }
        | LinkTarget::Mantra { name }
        | LinkTarget::HScript { name } => name.clone(),
        LinkTarget::Hom { path, member } => match member {
            Some(member) => format!("{path}.{member}"),
            None => path.clone(),
        },
        LinkTarget::Py { path, member } => match member {
            Some(member) => format!("hapi.{path}.{member}"),
            None => format!("hapi.{path}"),
        },
        LinkTarget::Wikipedia { article } => article.replace('_', " "),
        _ => raw.to_string(),
    };
    vec![Inline::Text { text }]
}

fn wiki_target(target: &str) -> LinkTarget {
    // `[trace|drawing|#trace]` is written in the help with one pipe too many.
    // The label was taken from the first field, so what is left here is the
    // target and the leftovers of the typo. The last field is the real target.
    let target = target.rsplit('|').next().unwrap_or(target);
    if let Some(rest) = target.strip_prefix('#') {
        return LinkTarget::Wiki {
            path: String::new(),
            anchor: Some(rest.to_string()),
        };
    }
    let (path, anchor) = match target.split_once('#') {
        Some((path, anchor)) => (path, Some(anchor.to_string())),
        None => (target, None),
    };
    LinkTarget::Wiki {
        // The help links to the page the doc build WRITES, which is HTML. The
        // app reads the source the build writes it from, and that has no
        // suffix at all.
        path: path.strip_suffix(".html").unwrap_or(path).to_string(),
        anchor,
    }
}

/// `Node:sop/copy` gives `("node", "sop/copy")`. A path such as `/nodes/sop`
/// and a time such as `12:30` must not match, so the scheme is letters only.
fn split_shortcut(target: &str) -> Option<(String, &str)> {
    let (scheme, rest) = target.split_once(':')?;
    if scheme.is_empty() || !scheme.chars().all(|c| c.is_ascii_alphabetic()) {
        return None;
    }
    Some((scheme.to_ascii_lowercase(), rest))
}

const TYPOGRAPHY: &[(&str, &str)] = &[
    ("<-", "\u{2190}"),
    ("->", "\u{2192}"),
    ("<=", "\u{2264}"),
    ("=>", "\u{21d2}"),
    ("...", "\u{2026}"),
    ("(c)", "\u{a9}"),
    ("(C)", "\u{a9}"),
    ("(tm)", "\u{2122}"),
    ("(TM)", "\u{2122}"),
    ("(r)", "\u{ae}"),
    ("(R)", "\u{ae}"),
];
