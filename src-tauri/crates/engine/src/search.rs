//! Ranked search over the index, the title list, and link tooltips.

use serde::Serialize;

use crate::{db, help, install};

/// A page in the title list, and a search hit. The front-end draws both the
/// same way, so they are one shape.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Hit {
    pub path: String,
    pub title: String,
    pub node_type: Option<String>,
    pub icon: Option<String>,
    /// What the page says it does, shown when nothing under a heading matched.
    pub summary: Option<String>,
    /// The sections of this page that matched, best first. Empty for a
    /// title-list entry, which matched no text at all.
    pub headings: Vec<Section>,
    /// How well the words match, larger being better. The front-end weights
    /// this by what KIND of page it is, which is a question about the reader
    /// and not about the text — see `weight` in `search.ts`. Zero for a
    /// title-list entry.
    pub score: f64,
    /// The sidebar folders above the page, outermost first. Only the title
    /// list carries them. See `place.rs`.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub place: Vec<String>,
}

/// One matching section of a page: the row the list nests under it.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Section {
    /// Empty when the words were above the first heading.
    pub heading: String,
    /// The anchor to open the page at. Empty with an empty heading.
    pub slug: String,
    /// The words themselves, as they read on the page.
    pub excerpt: String,
}

/// What a link hover shows: the page name, and the line under it.
#[derive(Serialize)]
pub struct Meta {
    pub path: String,
    pub title: String,
    pub summary: Option<String>,
    /// The page's own icon, so a link to it can carry the same mark the panel
    /// and the search draw for it.
    pub icon: Option<String>,
}

/// At most this many matching sections are listed under one page. Past three
/// the list is a page of one result, and the reader has stopped comparing.
const SECTIONS_PER_PAGE: usize = 3;

/// Full-text search over the page bodies, ranked with `bm25()`.
///
/// A row of the index is a section, so the ranking is over sections and the
/// pages come out of it: the first section of a page decides where the page
/// sits, and its other matching sections are listed beneath it. That is what
/// the result list draws, and it is why the query asks for more rows than the
/// caller wants pages.
///
/// The title and heading columns are weighted above the body, so a page named
/// for the words beats a page that only mentions them.
pub fn find(
    db: &rusqlite::Connection,
    build: &str,
    query: &str,
    limit: u32,
) -> Result<Vec<Hit>, String> {
    let Some(match_query) = db::match_query(query) else {
        return Ok(Vec::new());
    };
    let mut statement = db
        .prepare(
            "SELECT pages_fts.path, p.title, p.node_type, p.icon, p.summary,
                    pages_fts.heading, pages_fts.slug,
                    snippet(pages_fts, 5, '', '', '…', 14),
                    bm25(pages_fts, 0.0, 0.0, 0.0, 4.0, 10.0, 1.0) AS rank
             FROM pages_fts
             JOIN pages p ON p.build = pages_fts.build AND p.path = pages_fts.path
             WHERE pages_fts MATCH ?1 AND pages_fts.build = ?2
             ORDER BY rank
             LIMIT ?3",
        )
        .map_err(|e| e.to_string())?;

    let wanted = limit as usize;
    let rows = statement
        .query_map(
            rusqlite::params![match_query, build, (wanted * SECTIONS_PER_PAGE * 4) as u32],
            |row| {
                Ok((
                    Hit {
                        path: row.get(0)?,
                        title: row.get(1)?,
                        node_type: row.get(2)?,
                        icon: row.get(3)?,
                        summary: row.get(4)?,
                        headings: Vec::new(),
                        // `bm25()` is more negative the better the match. The
                        // front-end multiplies by a weight in 0..1, so the sign
                        // is turned here and never there.
                        score: -row.get::<_, f64>(8)?,
                        place: Vec::new(),
                    },
                    Section {
                        heading: row.get(5)?,
                        slug: row.get(6)?,
                        excerpt: row.get(7)?,
                    },
                ))
            },
        )
        .map_err(|e| e.to_string())?;

    let mut hits: Vec<Hit> = Vec::new();
    let mut at: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
    for row in rows {
        let (hit, section) = row.map_err(|e| e.to_string())?;
        let index = match at.get(&hit.path) {
            Some(index) => *index,
            None => {
                if hits.len() == wanted {
                    continue;
                }
                at.insert(hit.path.clone(), hits.len());
                hits.push(hit);
                hits.len() - 1
            }
        };
        if hits[index].headings.len() < SECTIONS_PER_PAGE && !section.excerpt.trim().is_empty() {
            hits[index].headings.push(section);
        }
    }
    Ok(hits)
}

/// Every page title in the current build, one per node: an older version of a
/// node is reached from the selector on its newest page.
///
/// The whole list goes to the front-end once and stays in memory there, which
/// is what makes the pick in the search field instant. It comes in the order
/// the sidebar draws it, so the sidebar never sorts.
pub fn all_titles(db: &rusqlite::Connection, build: &str) -> Result<Vec<Hit>, String> {
    let mut statement = db
        .prepare(
            "SELECT path, title, node_type, icon, summary, place FROM pages
             WHERE build = ?1 AND rank = 0 ORDER BY seq",
        )
        .map_err(|e| e.to_string())?;
    let rows = statement
        .query_map([build], |row| {
            Ok(Hit {
                path: row.get(0)?,
                title: row.get(1)?,
                node_type: row.get(2)?,
                icon: row.get(3)?,
                summary: row.get(4)?,
                headings: Vec::new(),
                score: 0.0,
                place: row
                    .get::<_, String>(5)?
                    .split('\n')
                    .filter(|label| !label.is_empty())
                    .map(str::to_string)
                    .collect(),
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<_, _>>().map_err(|e| e.to_string())
}

/// The tooltip text for a set of pages, asked for in one call.
///
/// The index answers most of it. A page the background pass has not reached is
/// read and parsed here instead, so a tooltip on a fresh install says the same
/// thing it will say later.
pub fn read_meta(
    db: &rusqlite::Connection,
    install: &install::Install,
    paths: &[String],
) -> Result<Vec<Meta>, String> {
    let build = &install.version;
    let mut found: Vec<Meta> = Vec::new();
    let mut missing: Vec<String> = Vec::new();
    {
        let mut statement = db
            .prepare("SELECT title, summary, icon FROM pages WHERE build = ?1 AND path = ?2")
            .map_err(|e| e.to_string())?;
        for path in paths {
            let row = statement
                .query_row(rusqlite::params![build, path], |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, Option<String>>(1)?,
                        row.get::<_, Option<String>>(2)?,
                    ))
                })
                .ok();
            match row {
                Some((title, summary, icon)) => found.push(Meta {
                    path: path.clone(),
                    title,
                    summary,
                    icon,
                }),
                None => missing.push(path.clone()),
            }
        }
    }
    if missing.is_empty() {
        return Ok(found);
    }
    let roots = install.help_roots();
    for path in missing {
        let Ok(source) = help::page_layered(&roots, &path) else {
            continue;
        };
        let parsed = wiki::parse(&source);
        found.push(Meta {
            path,
            title: parsed.title_text.clone(),
            summary: parsed.summary.as_ref().map(|s| wiki::inline::plain(s)),
            icon: wiki::model::prop(&parsed.props, "icon").map(|icon| format!("{icon}.svg")),
        });
    }
    Ok(found)
}
