//! Splits a rendered page into the sections the search list shows under it.
//!
//! A search hit is a SECTION, not a page: the reader wants "Copy to Points >
//! Fracturing objects", not the page and a guess at where in it. So the FTS
//! table holds one row per section, which is the whole body once over and not
//! twice — the sections ARE the body, cut at its headings.
//!
//! The anchor each section carries has to be the id the page will really
//! render, so `slug` mirrors `src/lib/markdown/headings.ts`. The two must agree
//! or a sub-hit scrolls nowhere.

/// One heading and the text under it. Section 0 of a page is what stands above
/// the first heading; it has no heading and no anchor.
#[derive(Debug, Clone, PartialEq)]
pub struct Section {
    pub heading: String,
    pub slug: String,
    pub body: String,
}

/// Cuts a rendered markdown body at its headings.
pub fn split(markdown: &str) -> Vec<Section> {
    let mut slugger = Slugger::default();
    let mut sections = vec![Section { heading: String::new(), slug: String::new(), body: String::new() }];
    let mut fenced = false;

    for line in markdown.lines() {
        // A `## ` inside a code fence is code, not a heading.
        if line.trim_start().starts_with("```") {
            fenced = !fenced;
        }
        match heading(line).filter(|_| !fenced) {
            Some(text) => {
                let slug = slugger.slug(&text);
                sections.push(Section { heading: text, slug, body: String::new() });
            }
            None => {
                let body = &mut sections.last_mut().expect("one section always exists").body;
                body.push_str(line);
                body.push('\n');
            }
        }
    }

    sections.retain(|section| !section.heading.is_empty() || !section.body.trim().is_empty());
    // A page with no body at all still needs one row, or its title is indexed
    // nowhere and the page cannot be found by name.
    if sections.is_empty() {
        sections.push(Section { heading: String::new(), slug: String::new(), body: String::new() });
    }
    sections
}

/// The text of an ATX heading below level 1. `#` alone is the page title, which
/// the header draws and the table of contents leaves out.
fn heading(line: &str) -> Option<String> {
    let hashes = line.len() - line.trim_start_matches('#').len();
    if !(2..=6).contains(&hashes) {
        return None;
    }
    let rest = line[hashes..].strip_prefix(' ')?;
    let text = plain(rest);
    (!text.is_empty()).then_some(text)
}

/// Markdown the heading source carries but the rendered heading does not.
/// Images go before links, or the generic link rule leaves a stray `!`.
fn plain(source: &str) -> String {
    let mut text = strip_tags(source);
    text = strip_links(&text, true);
    text = strip_links(&text, false);
    text = text.replace(['`', '*', '_'], "");
    for (entity, character) in [("&lt;", "<"), ("&gt;", ">"), ("&amp;", "&"), ("&quot;", "\""), ("&#39;", "'")] {
        text = text.replace(entity, character);
    }
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn strip_tags(source: &str) -> String {
    let mut out = String::with_capacity(source.len());
    let mut inside = false;
    for character in source.chars() {
        match character {
            '<' => inside = true,
            '>' => inside = false,
            _ if !inside => out.push(character),
            _ => {}
        }
    }
    out
}

/// Keeps the label of `[label](target)`, and of `![label](target)` when
/// `image` is set. Anything unbalanced is left as written.
fn strip_links(source: &str, image: bool) -> String {
    let bytes: Vec<char> = source.chars().collect();
    let mut out = String::with_capacity(source.len());
    let mut i = 0;
    while i < bytes.len() {
        let opens = bytes[i] == '[' && (!image || (i > 0 && bytes[i - 1] == '!'));
        let Some((label, after)) = opens.then(|| link(&bytes, i)).flatten() else {
            out.push(bytes[i]);
            i += 1;
            continue;
        };
        if image {
            out.pop();
        }
        out.push_str(&label);
        i = after;
    }
    out
}

/// `[label](target)` beginning at `at`, as its label and the index after it.
fn link(chars: &[char], at: usize) -> Option<(String, usize)> {
    let close = (at + 1..chars.len()).find(|&i| chars[i] == ']')?;
    if chars.get(close + 1) != Some(&'(') {
        return None;
    }
    let end = (close + 2..chars.len()).find(|&i| chars[i] == ')')?;
    Some((chars[at + 1..close].iter().collect(), end + 1))
}

/// The `github-slugger` rule, which is what the page itself is slugged with:
/// lower case, drop everything but word characters and dashes, spaces to
/// dashes, and a `-1`, `-2`… tail on a repeat.
#[derive(Default)]
struct Slugger {
    seen: std::collections::HashMap<String, u32>,
}

impl Slugger {
    fn slug(&mut self, text: &str) -> String {
        let base: String = text
            .to_lowercase()
            .chars()
            .filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_' || *c == ' ')
            .map(|c| if c == ' ' { '-' } else { c })
            .collect();
        let count = self.seen.entry(base.clone()).or_insert(0);
        let slug = if *count == 0 { base } else { format!("{base}-{count}") };
        *count += 1;
        slug
    }
}

#[cfg(test)]
mod tests {
    use super::{split, Slugger};

    #[test]
    fn the_text_above_the_first_heading_is_its_own_section() {
        let sections = split("Intro line.\n\n## Parameters\n\nWhat it takes.\n");
        assert_eq!(sections.len(), 2);
        assert_eq!(sections[0].heading, "");
        assert_eq!(sections[0].body.trim(), "Intro line.");
        assert_eq!(sections[1].heading, "Parameters");
        assert_eq!(sections[1].slug, "parameters");
    }

    #[test]
    fn an_empty_page_still_gets_one_row() {
        assert_eq!(split("").len(), 1);
    }

    #[test]
    fn a_page_with_no_lead_in_starts_at_its_first_heading() {
        let sections = split("## Overview\n\nText.\n");
        assert_eq!(sections.len(), 1);
        assert_eq!(sections[0].heading, "Overview");
    }

    #[test]
    fn a_hash_inside_a_fence_is_code() {
        let sections = split("## Example\n\n```python\n## not a heading\n```\n");
        assert_eq!(sections.len(), 1);
        assert!(sections[0].body.contains("## not a heading"));
    }

    #[test]
    fn the_page_title_is_not_a_section() {
        let sections = split("# Copy to Points\n\nBody.\n");
        assert_eq!(sections.len(), 1);
        assert_eq!(sections[0].heading, "");
    }

    #[test]
    fn a_heading_is_slugged_the_way_the_page_slugs_it() {
        let sections = split("## Copy to `Points` 2.0\n\na\n\n## What's new?\n\nb\n");
        assert_eq!(sections[0].heading, "Copy to Points 2.0");
        assert_eq!(sections[0].slug, "copy-to-points-20");
        assert_eq!(sections[1].slug, "whats-new");
    }

    #[test]
    fn a_heading_keeps_its_link_label_and_loses_its_image() {
        let sections = split("## See [Box](/nodes/sop/box) ![i](x.svg)\n\na\n");
        assert_eq!(sections[0].heading, "See Box i");
    }

    #[test]
    fn a_repeated_heading_takes_a_numbered_anchor() {
        let mut slugger = Slugger::default();
        assert_eq!(slugger.slug("Notes"), "notes");
        assert_eq!(slugger.slug("Notes"), "notes-1");
        assert_eq!(slugger.slug("Notes"), "notes-2");
    }
}
