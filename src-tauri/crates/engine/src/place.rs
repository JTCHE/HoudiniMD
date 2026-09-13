//! Where a page sits in the sidebar: the folders a reader opens, below the
//! page's branch, to reach it. Worked out once, at index time.
//! See spec: Semantic Sidebar Organisation.
//!
//! Every folder comes from something SideFX wrote, strongest first:
//! 1. The directory the page lives in, named by that directory's index page.
//! 2. The heading an index page lists it under in `@subtopics`, in the order
//!    the index gives: "Getting started" before "Guru level".
//! 3. The field an index page's `:list:` is `#groupedby`, labelled from its
//!    `#labels` file. This is how the VEX functions and `hou` are grouped.
//! 4. For a node, the TAB menu submenu it sits in, read from the shelf tools
//!    of the install. It is the grouping an artist already knows.
//! 5. When nothing above places a page, the first word of its title, if
//!    enough of its neighbours share that word.

use std::collections::HashMap;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};

use wiki::{Block, Inline, LinkTarget, Props};

/// The order of a folder or a page that SideFX gives no order for. It sorts
/// after every ordered one, and then by name.
const UNORDERED: u32 = u32::MAX;

/// A family needs this many pages, or it is not worth the row it takes.
const FAMILY_MIN: usize = 4;

/// One folder on the way to a page.
#[derive(Debug, Clone, PartialEq)]
pub struct Folder {
    pub label: String,
    /// Its place among the folders beside it, when SideFX gives one.
    pub order: u32,
}

/// Where one page sits.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Place {
    pub folders: Vec<Folder>,
    /// The page's place among the pages beside it, when SideFX gives one.
    pub rank: u32,
    /// Something SideFX wrote put the page in its last folder. A page with
    /// nothing of the kind is left for the families.
    pub grouped: bool,
}

/// The directory a branch of the sidebar opens onto. A node context is a
/// branch of its own, so a node's folders start below `nodes/sop`, not below
/// `nodes`. Mirrors `buildTree` in `src/lib/landing/tree.ts`.
fn branch_depth(path: &str) -> usize {
    if path.starts_with("nodes/") { 2 } else { 1 }
}

/// What the index pages of one section say about the pages under them, keyed
/// by directory: `vex/functions`.
pub struct Map {
    dirs: HashMap<String, Dir>,
}

#[derive(Default)]
struct Dir {
    title: String,
    /// The `@subtopics` headings, in the order the index gives them.
    headings: Vec<String>,
    /// A page or a directory the index lists, by its full path: the heading it
    /// is listed under, and its position in the whole list.
    listed: HashMap<String, (Option<usize>, u32)>,
    /// `#groupedby`: the field, and the label of each of its values.
    grouped: Option<(String, HashMap<String, String>)>,
}

impl Map {
    /// Reads the index pages among `sources`, the pages of one section.
    pub fn new(roots: &[PathBuf], sources: &[(String, String)]) -> Map {
        let dirs = sources
            .iter()
            .filter_map(|(path, source)| {
                let dir = path.strip_suffix("/index")?;
                Some((dir.to_string(), Dir::read(roots, path, dir, source)))
            })
            .collect();
        Map { dirs }
    }

    pub fn place(&self, path: &str, props: &Props, menu: &Menu) -> Place {
        let parts: Vec<&str> = path.split('/').collect();
        let leaf = parts.len() - 1;
        let mut folders = Vec::new();

        for depth in branch_depth(path)..leaf {
            let dir = parts[..=depth].join("/");
            let (heading, order) = self.listing(&parts[..depth].join("/"), &dir);
            folders.extend(heading);
            let title = self.dirs.get(&dir).map(|d| d.title.clone()).filter(|t| !t.is_empty());
            folders.push(Folder { label: title.unwrap_or_else(|| readable(parts[depth])), order });
        }

        let dir = parts[..leaf].join("/");
        let (heading, rank) = self.listing(&dir, path);
        let grouped = match heading {
            Some(heading) => vec![heading],
            None => self.group(&dir, props).or_else(|| menu.submenu(path, props)).unwrap_or_default(),
        };
        Place { grouped: !grouped.is_empty() || rank != UNORDERED, folders: [folders, grouped].concat(), rank }
    }

    /// The heading `dir`'s index lists `child` under, and where in its list.
    fn listing(&self, dir: &str, child: &str) -> (Option<Folder>, u32) {
        let Some(index) = self.dirs.get(dir) else { return (None, UNORDERED) };
        let Some(&(heading, at)) = index.listed.get(child) else { return (None, UNORDERED) };
        let heading = heading.map(|h| Folder { label: index.headings[h].clone(), order: h as u32 });
        (heading, at)
    }

    /// The group `dir`'s index sorts this page into by one of its fields. A
    /// page can also name its own `#group` where no index lists by it, as the
    /// expression functions do.
    fn group(&self, dir: &str, props: &Props) -> Option<Vec<Folder>> {
        let grouped = self.dirs.get(dir).and_then(|d| d.grouped.as_ref());
        let field = grouped.map_or("group", |(field, _)| field);
        let key = wiki::model::prop(props, field).map(str::trim).filter(|k| !k.is_empty())?;
        let label = grouped.and_then(|(_, labels)| labels.get(key).cloned()).unwrap_or_else(|| readable(key));
        Some(vec![Folder { label, order: UNORDERED }])
    }
}

impl Dir {
    fn read(roots: &[PathBuf], path: &str, dir: &str, source: &str) -> Dir {
        let page = wiki::parse(source);
        let mut read = Dir { title: page.title_text.clone(), ..Dir::default() };
        read.walk(roots, path, dir, &page.blocks, &mut None);
        read
    }

    /// `heading` is the one the next subtopic falls under. A heading nests the
    /// blocks after it, and a `:col:` holds a heading of its own, so it is
    /// carried down and across both.
    fn walk(&mut self, roots: &[PathBuf], path: &str, dir: &str, blocks: &[Block], heading: &mut Option<usize>) {
        for block in blocks {
            match block {
                Block::Heading { title, children, .. } => {
                    self.headings.push(wiki::inline::plain(&title.main));
                    *heading = Some(self.headings.len() - 1);
                    self.walk(roots, path, dir, children, heading);
                }
                Block::Subtopic { link, .. } => {
                    let Some(target) = link.iter().find_map(|inline| match inline {
                        Inline::Link { target: LinkTarget::Wiki { path, .. }, .. } => resolve(dir, path),
                        _ => None,
                    }) else {
                        continue;
                    };
                    // Only what lives directly under this directory. An index
                    // also links to other sections, and those have their own.
                    let at = self.listed.len() as u32;
                    if target.rsplit_once('/').is_some_and(|(parent, _)| parent == dir) {
                        self.listed.entry(target).or_insert((*heading, at));
                    }
                }
                Block::Item { name, props, children, .. } => {
                    if (name == "list" || name == "suite_list")
                        && let Some(field) = wiki::model::prop(props, "groupedby")
                    {
                        let labels = wiki::model::prop(props, "labels")
                            .map(|file| crate::listing::labels(roots, path, file))
                            .unwrap_or_default();
                        self.grouped = Some((field.trim().to_string(), labels));
                    }
                    self.walk(roots, path, dir, children, heading);
                }
                Block::Section { children, .. }
                | Block::Definition { children, .. }
                | Block::Divider { children, .. }
                | Block::Html { children, .. } => self.walk(roots, path, dir, children, heading),
                _ => {}
            }
        }
    }
}

/// A link written on the index of `dir`, as the full path it names. A link to
/// a directory, `contexts/` or `kug/index`, names the directory.
fn resolve(dir: &str, target: &str) -> Option<String> {
    if target.is_empty() || target.contains(':') {
        return None;
    }
    let full = match target.strip_prefix('/') {
        Some(absolute) => absolute.to_string(),
        None => format!("{dir}/{target}"),
    };
    let full = full.strip_suffix("/index").unwrap_or(&full).trim_end_matches('/');
    Some(full.to_string())
}

/// A directory with no index page to name it: `pop_state` reads as "Pop state".
fn readable(name: &str) -> String {
    let words = name.replace('_', " ");
    let mut chars = words.chars();
    chars.next().map(|first| first.to_uppercase().chain(chars).collect()).unwrap_or_default()
}

/// Puts the pages of one section in the order the sidebar draws them, and
/// gathers what nothing placed into families. `title` reads a row's title.
///
/// The order is the whole tree walked depth first: at each level the folders
/// first, by SideFX's order and then by name, then the pages. The front-end
/// draws the rows in the order it gets them, so it never sorts.
pub fn arrange<T>(rows: &mut Vec<T>, title: impl Fn(&T) -> &str, place: impl Fn(&mut T) -> &mut Place) {
    // Families form among the pages nothing placed, folder by folder.
    let mut words: HashMap<(Vec<String>, String), usize> = HashMap::new();
    let key = |row: &mut T, title: &str| {
        let place = place(row);
        let folders = place.folders.iter().map(|f| f.label.clone()).collect::<Vec<_>>();
        (!place.grouped).then(|| (folders, first_word(title).to_lowercase()))
    };
    for row in rows.iter_mut() {
        let name = title(row).to_string();
        if let Some(key) = key(row, &name) {
            *words.entry(key).or_default() += 1;
        }
    }
    for row in rows.iter_mut() {
        let name = title(row).to_string();
        if let Some(key) = key(row, &name)
            && words[&key] >= FAMILY_MIN
        {
            place(row).folders.push(Folder { label: first_word(&name).to_string(), order: UNORDERED });
        }
    }

    let mut keyed: Vec<(Vec<(u8, u32, String)>, T)> = rows
        .drain(..)
        .map(|mut row| {
            let name = title(&row).to_lowercase();
            let place = place(&mut row);
            let mut steps: Vec<(u8, u32, String)> =
                place.folders.iter().map(|f| (0, f.order, f.label.to_lowercase())).collect();
            steps.push((1, place.rank, name));
            (steps, row)
        })
        .collect();
    keyed.sort_by(|a, b| a.0.cmp(&b.0));
    rows.extend(keyed.into_iter().map(|(_, row)| row));
}

/// "Attribute" of "Attribute Blur", and "array" of the APEX node "array::Add".
fn first_word(title: &str) -> &str {
    let word = title.split_whitespace().next().unwrap_or_default();
    word.split("::").next().unwrap_or(word)
}

/// Node type to the TAB menu submenu it sits in: `sop/box` to `Primitive`.
pub struct Menu(HashMap<String, String>);

impl Menu {
    /// Reads every shelf tool beside each help root: the `toolbar/` shelves,
    /// and the `Tools.shelf` inside each asset of `otls/`. A package is shaped
    /// the same way, so its nodes find their submenus too.
    pub fn read(roots: &[PathBuf]) -> Menu {
        let mut menu = HashMap::new();
        for dir in roots.iter().filter_map(|help| help.parent()) {
            for file in files(&dir.join("toolbar"), &["shelf"]) {
                if let Ok(xml) = std::fs::read_to_string(&file) {
                    tools(&xml, None, &mut menu);
                }
            }
            for file in files(&dir.join("otls"), &["hda", "otl"]) {
                for (name, xml) in hda_shelves(&file) {
                    tools(&xml, Some(&name), &mut menu);
                }
            }
        }
        Menu(menu)
    }

    fn submenu(&self, path: &str, props: &Props) -> Option<Vec<Folder>> {
        let rest = path.strip_prefix("nodes/")?;
        let (context, leaf) = rest.split_once('/')?;
        // The operator table the shelf names, where it differs from the folder.
        let table = match context {
            "obj" => "object",
            "out" => "driver",
            other => other,
        };
        let name = match wiki::model::prop(props, "internal") {
            Some(internal) => internal.to_string(),
            None => leaf.replace("--", "::"),
        };
        let found = self.0.get(&type_key(&format!("{table}/{name}")))?;
        Some(found.split('/').map(|part| Folder { label: part.trim().to_string(), order: UNORDERED }).collect())
    }
}

/// `Sop/labs::foo::2.0` and the page `sop/foo-2.0` both come to `sop/foo`.
/// A namespace and a version are not what the menu groups by.
fn type_key(name: &str) -> String {
    let lower = name.trim().to_lowercase();
    let (table, name) = lower.split_once('/').unwrap_or(("", &lower));
    let mut parts: Vec<&str> = name.split("::").collect();
    if parts.len() > 1 && parts.last().is_some_and(|v| v.chars().all(|c| c.is_ascii_digit() || c == '.')) {
        parts.pop();
    }
    let name = parts.last().copied().unwrap_or_default();
    // The docs keep an old version at `name-` or `name-2.0`.
    let name = match name.split_once('-') {
        Some((base, version)) if version.chars().all(|c| c.is_ascii_digit() || c == '.') => base,
        _ => name,
    };
    format!("{table}/{name}")
}

/// Every `<tool>` in a shelf file that names a submenu. A tool inside an
/// asset names its node as `$HDA_TABLE_AND_NAME`, so the asset's own name is
/// the key there.
fn tools(xml: &str, asset: Option<&str>, menu: &mut HashMap<String, String>) {
    for tool in between(xml, "<tool ", "</tool>") {
        let Some(submenu) = between(tool, "<toolSubmenu>", "</toolSubmenu>").next() else { continue };
        let named: Vec<&str> = match asset {
            Some(asset) => vec![asset],
            None => between(tool, "<contextOpType>", "</contextOpType>")
                .chain(between(tool, "<helpURL>operator:", "</helpURL>"))
                .collect(),
        };
        for name in named {
            menu.entry(type_key(name)).or_insert_with(|| submenu.trim().to_string());
        }
    }
}

/// Each run of text between `open` and the next `close`.
fn between<'a>(text: &'a str, open: &'a str, close: &'a str) -> impl Iterator<Item = &'a str> + 'a {
    text.split(open).skip(1).filter_map(move |rest| rest.split_once(close).map(|(inside, _)| inside))
}

fn files(dir: &Path, extensions: &[&str]) -> Vec<PathBuf> {
    let Ok(entries) = std::fs::read_dir(dir) else { return Vec::new() };
    entries
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| path.extension().and_then(|e| e.to_str()).is_some_and(|e| extensions.contains(&e)))
        .collect()
}

/// The `Tools.shelf` of each asset in an HDA library, by the asset's type
/// name. Reads the tables of contents and those sections only, never the
/// whole file: the install ships libraries of fifty megabytes.
fn hda_shelves(file: &Path) -> Vec<(String, String)> {
    let Ok(file) = std::fs::File::open(file) else { return Vec::new() };
    let mut file = std::io::BufReader::new(file);
    let Some((base, assets)) = hda_index(&mut file, 0) else { return Vec::new() };
    assets
        .into_iter()
        .filter(|(name, ..)| name.contains('/'))
        .filter_map(|(name, offset, _)| {
            let (inner, sections) = hda_index(&mut file, base + offset)?;
            let (_, at, size) = sections.into_iter().find(|(section, ..)| section == "Tools.shelf")?;
            let mut bytes = vec![0; size as usize];
            file.seek(SeekFrom::Start(inner + at)).ok()?;
            file.read_exact(&mut bytes).ok()?;
            Some((name, String::from_utf8_lossy(&bytes).into_owned()))
        })
        .collect()
}

/// An HDA table of contents at `at`: `INDX`, eight bytes, a count, then for
/// each entry a name, an offset, a size and a time. All numbers are 32-bit
/// big-endian, and every offset counts from the end of the table. An asset's
/// own data opens with a table of the same shape.
fn hda_index(file: &mut (impl Read + Seek), at: u64) -> Option<(u64, Vec<(String, u64, u64)>)> {
    fn word(file: &mut impl Read) -> Option<u32> {
        let mut bytes = [0; 4];
        file.read_exact(&mut bytes).ok()?;
        Some(u32::from_be_bytes(bytes))
    }
    let mut head = [0; 12];
    file.seek(SeekFrom::Start(at)).ok()?;
    file.read_exact(&mut head).ok()?;
    if &head[..4] != b"INDX" {
        return None;
    }
    let count = word(file)?;
    let mut entries = Vec::new();
    for _ in 0..count.min(100_000) {
        let length = word(file)?;
        if length > 4096 {
            return None;
        }
        let mut name = vec![0; length as usize];
        file.read_exact(&mut name).ok()?;
        let (offset, size, _time) = (word(file)?, word(file)?, word(file)?);
        entries.push((String::from_utf8_lossy(&name).into_owned(), offset as u64, size as u64));
    }
    Some((file.stream_position().ok()?, entries))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_namespace_and_a_version_do_not_split_a_node_from_its_menu() {
        assert_eq!(type_key("Sop/labs::foo::2.0"), "sop/foo");
        assert_eq!(type_key("sop/foo-2.0"), "sop/foo");
        assert_eq!(type_key("sop/foo-"), "sop/foo");
        assert_eq!(type_key("Sop/apex::addgroom"), "sop/addgroom");
        assert_eq!(type_key("Sop/copytopoints::2.0"), "sop/copytopoints");
    }

    #[test]
    fn an_index_link_names_a_page_or_a_directory() {
        assert_eq!(resolve("vex", "lang").as_deref(), Some("vex/lang"));
        assert_eq!(resolve("vex", "contexts/").as_deref(), Some("vex/contexts"));
        assert_eq!(resolve("solaris", "kug/index").as_deref(), Some("solaris/kug"));
        assert_eq!(resolve("basics", "/network/").as_deref(), Some("network"));
        assert_eq!(resolve("ref", "https://example.com/"), None);
    }

    fn map(pages: &[(&str, &str)]) -> Map {
        let sources: Vec<(String, String)> = pages.iter().map(|(p, s)| (p.to_string(), s.to_string())).collect();
        Map::new(&[], &sources)
    }

    #[test]
    fn a_subtopic_heading_is_a_folder_and_a_directory_is_named_by_its_index() {
        let map = map(&[
            ("lang/index", "= Lang =\n\n@subtopics\n\n== Start ==\n\n:: [intro]\n\n== Reference ==\n\n:: [functions/]\n"),
            ("lang/functions/index", "= Lang |> Functions =\n"),
        ]);
        let menu = Menu(HashMap::new());
        let intro = map.place("lang/intro", &Vec::new(), &menu);
        assert_eq!(intro.folders, vec![Folder { label: "Start".into(), order: 0 }]);
        assert_eq!(intro.rank, 0);
        let len = map.place("lang/functions/len", &Vec::new(), &menu);
        let labels: Vec<&str> = len.folders.iter().map(|f| f.label.as_str()).collect();
        assert_eq!(labels, ["Reference", "Functions"]);
        assert!(!len.grouped);
    }

    #[test]
    fn a_grouped_list_puts_each_page_under_its_field() {
        let map = map(&[(
            "lang/functions/index",
            "= Functions =\n\n:list:\n    #query: type:vex\n    #groupedby: group\n",
        )]);
        let props = vec![("group".to_string(), "array".to_string())];
        let place = map.place("lang/functions/len", &props, &Menu(HashMap::new()));
        assert_eq!(place.folders.last().unwrap().label, "Array");
        assert!(place.grouped);
    }

    #[test]
    fn a_node_sits_in_its_tab_submenu_below_its_context() {
        let mut shelf = HashMap::new();
        tools(
            "<tool name=\"x\"><contextOpType>Sop/polyextrude::2.0</contextOpType><toolSubmenu>Geometry/Polygons</toolSubmenu></tool>",
            None,
            &mut shelf,
        );
        let place = map(&[]).place("nodes/sop/polyextrude", &Vec::new(), &Menu(shelf));
        let labels: Vec<&str> = place.folders.iter().map(|f| f.label.as_str()).collect();
        assert_eq!(labels, ["Geometry", "Polygons"]);
    }

    #[test]
    fn pages_nothing_placed_form_families_and_folders_come_before_pages() {
        let mut rows: Vec<(String, Place)> = ["Attribute Blur", "Attribute Cast", "Attribute Copy", "Attribute Wrangle", "Box"]
            .iter()
            .map(|t| (t.to_string(), Place { rank: UNORDERED, ..Place::default() }))
            .collect();
        arrange(&mut rows, |row| &row.0, |row| &mut row.1);
        assert_eq!(rows[0].1.folders[0].label, "Attribute");
        assert_eq!(rows[4].0, "Box");
        assert!(rows[4].1.folders.is_empty());
    }
}
