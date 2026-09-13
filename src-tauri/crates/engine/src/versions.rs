//! The versions of one node: `nodes/sop/rbdmaterialfracture` and the older
//! pages beside it, `-3.0`, `-2.0`, and a bare `-` for the first.
//!
//! The family is the file name with its version suffix cut off. `#internal:`
//! cannot be the key: across the 22.0 help one family writes it as `clip`,
//! `clip::2.0` and `pyro_sourcefromlayer-2.0`, while the file names never
//! disagree. The order comes from the version number and not from the file
//! name, because in some families the suffixed page is the newer node:
//! `cop/geotolayer-2.0` replaces `cop/geotolayer`.
//!
//! The index pass groups the families and writes them as columns. A page read
//! stays one file read. See spec: Node Version Selector.

use std::cmp::Ordering;
use std::collections::{HashMap, HashSet};

use rusqlite::Connection;
use serde::Serialize;

/// One version of a node, as the selector lists it.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct NodeVersion {
    pub path: String,
    pub label: String,
}

/// What one node page says about its own version.
#[derive(Debug, Clone)]
pub struct Mark {
    path: String,
    family: String,
    file: File,
    /// `4.0` as `[4]`: trailing zeros cut, so `2` and `2.0` are one number.
    number: Option<(Vec<u32>, String)>,
}

/// The file name's suffix. The order is the tie-break between two pages that
/// give the same version number, or none: SideFX writes the current page
/// unsuffixed and freezes the old one under a suffix.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
enum File {
    /// `-`: the first version, frozen when the second shipped.
    Bare,
    /// `-3.0`.
    Numbered,
    Unsuffixed,
}

/// Reads the version of a node page from its path and its properties. `None`
/// for a page that is not a node.
pub fn mark(path: &str, props: &wiki::Props) -> Option<Mark> {
    let prop = |name: &str| wiki::model::prop(props, name).map(str::trim);
    if prop("type") != Some("node") {
        return None;
    }
    let (family, file, from_file) = match path.rsplit_once('-') {
        Some((stem, "")) => (stem, File::Bare, None),
        Some((stem, tail)) if parse(tail).is_some() => (stem, File::Numbered, Some(tail)),
        _ => (path, File::Unsuffixed, None),
    };
    // `clip::2.0` and `gltf-2.0` carry the number in the node's type name.
    // A bare page does not count it: `sop/shotsculpt-` says `shotsculpt::2.0`
    // beside a real `shotsculpt-2.0`, and it is the older of the two.
    let from_internal = || {
        prop("internal")?
            .rsplit([':', '-'])
            .next()
            .filter(|_| file == File::Unsuffixed)
    };
    let number = prop("version")
        .filter(|v| parse(v).is_some())
        .or(from_file)
        .or_else(|| from_internal().filter(|v| parse(v).is_some()))
        .map(|text| (parse(text).expect("checked above"), text.to_string()));
    Some(Mark { path: path.to_string(), family: family.to_string(), file, number })
}

/// `3.0` to `[3]`, or `None` for text that is not a version number.
fn parse(text: &str) -> Option<Vec<u32>> {
    let mut parts = text
        .split('.')
        .map(|part| part.parse::<u32>().ok().filter(|_| part.bytes().all(|b| b.is_ascii_digit())))
        .collect::<Option<Vec<u32>>>()?;
    while parts.len() > 1 && parts.last() == Some(&0) {
        parts.pop();
    }
    Some(parts)
}

/// Newest first: a page with a number before a page without, the higher
/// number first, then the file order.
fn newest_first(a: &Mark, b: &Mark) -> Ordering {
    let key = |m: &Mark| (m.number.as_ref().map(|(n, _)| n.clone()), m.file);
    key(b).cmp(&key(a))
}

/// Where one page sits in its family.
#[derive(Debug, Clone, PartialEq)]
pub struct Place {
    pub family: String,
    pub label: String,
    /// 0 for the newest page. Only that page goes in the title list and in
    /// the search.
    pub rank: u32,
}

/// Groups the marks of one section into families and places each page. A
/// family of one page is no family, and its page gets no place.
pub fn place(marks: Vec<Mark>) -> HashMap<String, Place> {
    let mut families: HashMap<String, Vec<Mark>> = HashMap::new();
    for mark in marks {
        let members = families.entry(mark.family.clone()).or_default();
        // A package can ship a page the install already has.
        if !members.iter().any(|m| m.path == mark.path) {
            members.push(mark);
        }
    }
    let mut placed = HashMap::new();
    for (family, mut members) in families {
        if members.len() < 2 {
            continue;
        }
        members.sort_by(newest_first);
        for (rank, (path, label)) in labels(&members).into_iter().enumerate() {
            placed.insert(path, Place { family: family.clone(), label, rank: rank as u32 });
        }
    }
    placed
}

/// One label per page, newest first, and never the same label twice. A page
/// with no number is `1.0` when it is the oldest and nothing else is `1.0`;
/// otherwise it says where it sits.
fn labels(members: &[Mark]) -> Vec<(String, String)> {
    let one = parse("1").expect("a version");
    let one_taken = members.iter().any(|m| m.number.as_ref().is_some_and(|(n, _)| *n == one));
    let last = members.len() - 1;
    let mut used = HashSet::new();
    members
        .iter()
        .enumerate()
        .map(|(at, m)| {
            let label = match &m.number {
                Some((number, text)) if used.insert(number.clone()) => text.clone(),
                None if at == last && !one_taken => "1.0".to_string(),
                _ if at == 0 => "Latest".to_string(),
                _ => "Earlier".to_string(),
            };
            (m.path.clone(), label)
        })
        .collect()
}

/// Every version of the node at `path`, newest first. Empty for a page with
/// no other version, and for a page the index pass has not reached yet.
pub fn of(db: &Connection, build: &str, path: &str) -> Vec<NodeVersion> {
    let Ok(mut statement) = db.prepare_cached(
        "SELECT v.path, v.label FROM pages p
         JOIN pages v ON v.build = p.build AND v.family = p.family
         WHERE p.build = ?1 AND p.path = ?2
         ORDER BY v.rank",
    ) else {
        return Vec::new();
    };
    statement
        .query_map([build, path], |row| Ok(NodeVersion { path: row.get(0)?, label: row.get(1)? }))
        .and_then(|rows| rows.collect())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn node(path: &str, props: &[(&str, &str)]) -> Mark {
        let mut all: wiki::Props = vec![("type".into(), "node".into())];
        all.extend(props.iter().map(|(k, v)| (k.to_string(), v.to_string())));
        mark(path, &all).expect("a node page")
    }

    /// The labels of one family, newest first.
    fn family(marks: Vec<Mark>) -> Vec<(String, String)> {
        let mut placed: Vec<_> = place(marks).into_iter().collect();
        placed.sort_by_key(|(_, place)| place.rank);
        placed.into_iter().map(|(path, place)| (path, place.label)).collect()
    }

    fn pairs(list: &[(&str, &str)]) -> Vec<(String, String)> {
        list.iter().map(|(a, b)| (a.to_string(), b.to_string())).collect()
    }

    #[test]
    fn the_unsuffixed_page_is_newest_when_it_says_so() {
        let got = family(vec![
            node("s/fracture-", &[]),
            node("s/fracture-3.0", &[("version", "3.0")]),
            node("s/fracture", &[("version", "4.0")]),
            node("s/fracture-2.0", &[("version", "2.0")]),
        ]);
        let want = [("s/fracture", "4.0"), ("s/fracture-3.0", "3.0"), ("s/fracture-2.0", "2.0"), ("s/fracture-", "1.0")];
        assert_eq!(got, pairs(&want));
    }

    #[test]
    fn a_suffixed_page_can_be_the_newer_node() {
        // `cop/geotolayer`: the plain page is the first node, `-2.0` replaced it.
        let got = family(vec![node("c/geo", &[("internal", "geo")]), node("c/geo-2.0", &[("internal", "geo::2.0")])]);
        assert_eq!(got, pairs(&[("c/geo-2.0", "2.0"), ("c/geo", "1.0")]));
    }

    #[test]
    fn the_number_can_come_from_the_type_name() {
        // `sop/debrissource` says `debrissource::2.0` and has no `#version:`.
        let got = family(vec![node("s/debris-", &[]), node("s/debris", &[("internal", "debris::2.0")])]);
        assert_eq!(got, pairs(&[("s/debris", "2.0"), ("s/debris-", "1.0")]));
    }

    #[test]
    fn a_bare_page_ignores_the_type_name() {
        // `sop/shotsculpt-` says `shotsculpt::2.0` beside the real 2.0 page.
        let got = family(vec![
            node("s/shot", &[("version", "3.0")]),
            node("s/shot-2.0", &[("version", "2.0")]),
            node("s/shot-", &[("internal", "shot::2.0")]),
        ]);
        assert_eq!(got, pairs(&[("s/shot", "3.0"), ("s/shot-2.0", "2.0"), ("s/shot-", "1.0")]));
    }

    #[test]
    fn two_pages_never_share_a_label() {
        // `cop/pyro_activate`: neither page gives a number.
        let got = family(vec![node("c/pyro-", &[]), node("c/pyro", &[])]);
        assert_eq!(got, pairs(&[("c/pyro", "Latest"), ("c/pyro-", "1.0")]));
        // `dop/clothsolver`: two pages say 2.0.
        let got = family(vec![
            node("d/cloth-2.0", &[("version", "2.0")]),
            node("d/cloth", &[("version", "2.0")]),
            node("d/cloth-", &[("version", "1.0")]),
        ]);
        assert_eq!(got, pairs(&[("d/cloth", "2.0"), ("d/cloth-2.0", "Earlier"), ("d/cloth-", "1.0")]));
        // A Labs node: the unversioned asset is older than its `-1.0`.
        let got = family(vec![node("s/labs--a", &[]), node("s/labs--a-1.0", &[])]);
        assert_eq!(got, pairs(&[("s/labs--a-1.0", "1.0"), ("s/labs--a", "Earlier")]));
    }

    #[test]
    fn a_lone_page_and_a_name_with_a_dash_are_no_family() {
        assert!(family(vec![node("s/labs--only-1.0", &[])]).is_empty());
        let m = node("s/labs--repair", &[]);
        assert_eq!(m.family, "s/labs--repair");
        assert!(mark("l/sil-ofl-1.1", &Vec::new()).is_none());
    }
}
