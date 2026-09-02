//! Turns a picture or video reference on a help page into the path the
//! `himage` protocol reads.
//!
//! A page writes its assets the way the SideFX help server serves them, which
//! is not the way the install stores them:
//!
//! - `/images/playbar/timeline.png` is `playbar/timeline.png` in `images.zip`.
//! - `../images/BasisSOP.jpg` on `nodes/sop/basis` is `nodes/BasisSOP.jpg` in
//!   the same zip. The `images` segment is a serving path, not a folder.
//! - `/videos/tween.webm` is a loose file under `$HFS/houdini/help/videos`.
//!
//! Both come back as one shape, `images/…` or `videos/…`, so the protocol
//! handler has one thing to read and the front-end has nothing to know.

use wiki::{Block, Inline};

/// The asset path for `src` as written on the page at `page`, or `None` when
/// the reference names nothing this app can read.
pub fn resolve(page: &str, src: &str) -> Option<String> {
    // `opdef:` and `./MainImage.jpg` name a picture inside an HDA, which is
    // not a file in the install. Only the pages about writing help use them.
    if src.starts_with("opdef:") || src.contains('?') || src.is_empty() {
        return None;
    }

    let mut parts: Vec<&str> = Vec::new();
    if !src.starts_with('/') {
        // A relative reference stands beside the page, so the page's own name
        // is not part of the base.
        let dir = page
            .trim_matches('/')
            .rsplit_once('/')
            .map_or("", |(d, _)| d);
        parts.extend(dir.split('/'));
    }
    parts.extend(src.split('/'));

    let mut path: Vec<&str> = Vec::new();
    for part in parts {
        match part {
            "" | "." => {}
            ".." => {
                path.pop()?;
            }
            part => path.push(part),
        }
    }

    // The first `images` or `videos` segment says which store holds the file.
    // Everything before it is the section the page lives in, which the store
    // keeps as its own top folder.
    let at = path.iter().position(|p| *p == "images" || *p == "videos")?;
    let store = path.remove(at);
    if path.len() <= at {
        return None;
    }
    Some(format!("{store}/{}", path.join("/")))
}

/// Rewrites every asset reference in a page to the path the `himage` protocol
/// reads. A reference that names nothing readable is dropped, so the reader
/// gets the text without a broken frame in the middle of it.
pub fn rewrite(page: &str, blocks: &mut [Block]) {
    for block in blocks {
        match block {
            Block::Item {
                name,
                label,
                props,
                children,
            } => {
                if name == "video" {
                    for (key, value) in props.iter_mut() {
                        if key == "src" {
                            *value = resolve(page, value).unwrap_or_default();
                        }
                    }
                }
                inlines(page, label);
                rewrite(page, children);
            }
            Block::Heading {
                title, children, ..
            } => {
                inlines(page, &mut title.main);
                rewrite(page, children);
            }
            Block::Section { children, .. } => rewrite(page, children),
            Block::Definition { term, children, .. } => {
                inlines(page, term);
                rewrite(page, children);
            }
            Block::Usage { children, .. } => rewrite(page, children),
            Block::Paragraph { text } | Block::Summary { text } => inlines(page, text),
            Block::Subtopic { link, children } => {
                inlines(page, link);
                rewrite(page, children);
            }
            Block::Bullets { items } | Block::Numbers { items } => {
                for item in items {
                    rewrite(page, &mut item.blocks);
                }
            }
            Block::Table { rows } => {
                for row in rows {
                    for cell in row {
                        rewrite(page, &mut cell.blocks);
                    }
                }
            }
            Block::Html { children, .. } => rewrite(page, children),
            Block::Code { .. }
            | Block::Divider { .. }
            | Block::Include { .. }
            | Block::RawHtml { .. } => {}
        }
    }
}

fn inlines(page: &str, inlines: &mut Vec<Inline>) {
    inlines.retain_mut(|inline| match inline {
        Inline::Image { src } => match resolve(page, src) {
            Some(path) => {
                *src = path;
                true
            }
            None => false,
        },
        Inline::Bold { body } | Inline::Italic { body } | Inline::Ui { body } => {
            self::inlines(page, body);
            true
        }
        Inline::Link { text, .. } => {
            self::inlines(page, text);
            true
        }
        _ => true,
    });
}

#[cfg(test)]
mod tests {
    use super::resolve;

    #[test]
    fn absolute_image_drops_the_serving_folder() {
        assert_eq!(
            resolve("basics/playbar", "/images/playbar/timeline.png").as_deref(),
            Some("images/playbar/timeline.png")
        );
    }

    #[test]
    fn a_relative_image_keeps_the_section_it_came_from() {
        assert_eq!(
            resolve("nodes/sop/basis", "../images/BasisSOP.jpg").as_deref(),
            Some("images/nodes/BasisSOP.jpg")
        );
        assert_eq!(
            resolve("nodes/cop2/rotoshape", "../images/RotoShapeEditMode.jpg").as_deref(),
            Some("images/nodes/RotoShapeEditMode.jpg")
        );
    }

    #[test]
    fn an_empty_segment_is_not_a_folder() {
        assert_eq!(
            resolve(
                "nodes/lop/rendergeometrysettings",
                "//images/solaris/kug/a.jpg"
            )
            .as_deref(),
            Some("images/solaris/kug/a.jpg")
        );
    }

    #[test]
    fn a_video_reads_from_the_videos_folder() {
        assert_eq!(
            resolve("anim/animtoolbar", "/videos/animtoolbar_tween.webm").as_deref(),
            Some("videos/animtoolbar_tween.webm")
        );
    }

    #[test]
    fn a_picture_inside_an_asset_is_not_a_file() {
        assert_eq!(resolve("help/nodes", "opdef:.?test.png"), None);
        assert_eq!(
            resolve("help/nodes", "opdef:matt::Sop/e::1.0?test.png"),
            None
        );
        assert_eq!(resolve("help/nodes", "./MainImage.jpg"), None);
    }

    #[test]
    fn a_reference_that_leaves_the_help_root_is_refused() {
        assert_eq!(resolve("basics/playbar", "../../../images/x.png"), None);
        assert_eq!(resolve("basics/playbar", "/images"), None);
    }
}
