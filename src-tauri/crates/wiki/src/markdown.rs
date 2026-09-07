//! Markdown for the copy button and for agents.

use crate::model::{prop, Block, Inline, LinkTarget, Page, Props, Title};

pub fn page(page: &Page) -> String {
    let mut out = String::new();
    out.push_str("# ");
    out.push_str(&title(&page.title));
    out.push_str("\n\n");
    if let Some(summary) = &page.summary {
        out.push_str(&inlines(summary));
        out.push_str("\n\n");
    }
    out.push_str(&blocks(&page.blocks, 1));
    while out.ends_with('\n') {
        out.pop();
    }
    out.push('\n');
    out
}

pub fn title(title: &Title) -> String {
    let mut parts = Vec::new();
    if let Some(pre) = &title.pre {
        parts.push(inlines(pre));
    }
    parts.push(inlines(&title.main));
    if let Some(sub) = &title.sub {
        parts.push(inlines(sub));
    }
    parts.join(" — ")
}

pub fn blocks(blocks: &[Block], depth: u8) -> String {
    let mut out = String::new();
    let mut run: Vec<&Block> = Vec::new();
    for block in blocks {
        if matches!(block, Block::Item { name, .. } if name == "task") {
            run.push(block);
            continue;
        }
        flush_tasks(&mut run, &mut out);
        out.push_str(&one(block, depth));
    }
    flush_tasks(&mut run, &mut out);
    out
}

/// A run of `:task:` blocks is the "To.../Do this" table SideFX draws for
/// them. Markdown has no `task-desc`/`task-howto` pair of cells, so a table
/// is the closest shape it has; see `parameters()`, which does the same
/// thing for `@parameters` and every other `@`-section of `Term:` entries.
fn flush_tasks(run: &mut Vec<&Block>, out: &mut String) {
    if run.is_empty() {
        return;
    }
    out.push_str("| To... | Do this |\n| --- | --- |\n");
    for block in run.drain(..) {
        let Block::Item { label, children, .. } = block else {
            continue;
        };
        out.push_str(&format!(
            "| {} | {} |\n",
            cell_text(&inlines(label)),
            cell_text(&cell_html(children, false))
        ));
    }
    out.push('\n');
}

fn one(block: &Block, depth: u8) -> String {
    match block {
        Block::Heading {
            level,
            title: heading,
            children,
            ..
        } => {
            let level = (*level).clamp(2, 6);
            format!(
                "{} {}\n\n{}",
                "#".repeat(level as usize),
                title(heading),
                blocks(children, depth)
            )
        }
        Block::Section {
            name,
            title: label,
            children,
            ..
        } => {
            let heading = match label {
                Some(label) => inlines(label),
                None => capitalise(name),
            };
            let body = match name.as_str() {
                // `@globals` is a plain type/name/description list, the same
                // shape as `@parameters` — see `parameters()`. Every other
                // `@`-section of `Term:` entries (`methods`, `inputs`,
                // `env_variables`...) draws each entry on its own instead,
                // so only these two take the table path.
                "parameters" | "globals" => parameters(children, depth),
                _ => blocks(children, depth),
            };
            format!("## {heading}\n\n{body}")
        }
        Block::Paragraph { text } => match image_group(text) {
            Some(row) => row,
            None => format!("{}\n\n", inlines(text)),
        },
        Block::Summary { text } => format!("{}\n\n", inlines(text)),
        Block::Bullets { items } => {
            let mut out = String::new();
            for item in items {
                out.push_str(&list_item("-", &blocks(&item.blocks, depth + 1)));
            }
            out.push('\n');
            out
        }
        Block::Numbers { items } => {
            let mut out = String::new();
            for (i, item) in items.iter().enumerate() {
                let marker = format!("{}.", i + 1);
                out.push_str(&list_item(&marker, &blocks(&item.blocks, depth + 1)));
            }
            out.push('\n');
            out
        }
        Block::Definition { term, children, .. } => {
            format!(
                "**{}**\n\n{}",
                inlines(term),
                indent(&blocks(children, depth + 1))
            )
        }
        Block::Item {
            name,
            label,
            props,
            children,
            ..
        } => item(name, &inlines(label), props, children, depth),
        Block::Usage {
            signature,
            children,
        } => format!("```vex\n{signature}\n```\n\n{}", blocks(children, depth)),
        Block::Code { language, text } => {
            let language = language.clone().unwrap_or_default();
            format!("```{language}\n{text}\n```\n\n")
        }
        Block::Divider {
            label, children, ..
        } => {
            let body = blocks(children, depth);
            match label {
                Some(label) => format!("---\n\n**{}**\n\n{body}", inlines(label)),
                None => format!("---\n\n{body}"),
            }
        }
        Block::Table { rows } => table(rows, depth),
        Block::Include {
            path,
            block_id,
            contents_only,
        } => {
            let anchor = block_id
                .as_ref()
                .map(|id| format!("#{id}"))
                .unwrap_or_default();
            let slash = if *contents_only { "/" } else { "" };
            format!("<!-- include {path}{anchor}{slash} -->\n\n")
        }
        Block::Subtopic { link, children } => {
            format!(
                "- {}\n{}",
                inlines(link),
                indent(&blocks(children, depth + 1))
            )
        }
        // `tag>>` is SideFX's own pseudo-HTML, not a real element the reader's
        // markdown renderer knows — `<steps>` has no meaning to it, and a
        // `<div style="...">` layout wrapper has no page to draw its layout
        // in. Its content is already ordinary blocks (a numbered list, a
        // picture, a paragraph), so it draws as plain flow with the wrapper
        // dropped, the same as format.txt says a reader should see it: a
        // list, a picture, a paragraph, not the tag around them.
        Block::Html { children, .. } => blocks(children, depth),
        Block::RawHtml { html } => format!("{html}\n\n"),
    }
}

/// Pictures SideFX wrote on consecutive lines of one paragraph. That shared
/// paragraph is the "these belong side by side" signal: a comparison row, such
/// as one fracture shown as concrete, glass and wood. Markdown has no row, so
/// the row is raw HTML and `rehype-raw` renders it. The figures match heights
/// in the front-end; see `.image-group` in `globals.css`.
fn image_group(text: &[Inline]) -> Option<String> {
    let mut sources = Vec::new();
    for inline in text {
        match inline {
            Inline::Image { src } => sources.push(src),
            Inline::Text { text } if text.trim().is_empty() => {}
            _ => return None,
        }
    }
    if sources.len() < 2 {
        return None;
    }
    let figures: String = sources
        .iter()
        .map(|src| format!("<figure><img src=\"{}\" alt=\"\" /></figure>", attribute(src)))
        .collect();
    Some(format!(
        "<div class=\"not-prose image-group\">{figures}</div>\n\n"
    ))
}

/// One pseudo-HTML element, on one line, with its content inside it.
fn html(tag: &str, attributes: &str, children: &[Block]) -> String {
    let head = match attributes.is_empty() {
        true => tag.to_string(),
        false => format!("{tag} {attributes}"),
    };
    format!("<{head}>{}</{tag}>", cell_html(children, true))
}

/// A value going into a double-quoted HTML attribute.
fn attribute(value: &str) -> String {
    value.replace('&', "&amp;").replace('"', "&quot;")
}

fn item(name: &str, label: &str, props: &Props, children: &[Block], depth: u8) -> String {
    let body = blocks(children, depth + 1);
    match name {
        // Markdown has no video, and the app renders the raw tag with the same
        // component that draws a picture. `loop` and `autoplay` are the page's
        // own, so a demonstration that repeats keeps repeating here.
        "video" => {
            let src = attribute(prop(props, "src").unwrap_or_default());
            let flag = |name: &str| match prop(props, name) == Some("true") {
                true => format!(" {name}"),
                false => String::new(),
            };
            let muted = if prop(props, "autoplay") == Some("true") {
                " muted"
            } else {
                ""
            };
            format!(
                "<video src=\"{src}\" controls{}{}{muted}></video>

",
                flag("loop"),
                flag("autoplay")
            )
        }
        name if admonition(name).is_some() => {
            let (kind, head) = admonition(name).expect("the name is an admonition");
            // A blockquote that opens with `[!KIND]` is a callout to the
            // front-end. What follows the marker is its title, so a release
            // note keeps the kind of change it announces.
            let title = match (head, label.is_empty()) {
                (None, true) => String::new(),
                (None, false) => format!(" {label}"),
                (Some(head), true) => format!(" {head}"),
                (Some(head), false) => format!(" {head}: {label}"),
            };
            quote(&format!("[!{kind}]{title}\n\n{body}"))
        }
        // Only reached when `:usage:` was not one clean signature — see
        // `clean_signature` in blocks.rs. The label is running text, not a
        // marker to draw as a block.
        "usage" => match label.is_empty() {
            true => body,
            false => format!("{label}\n\n{body}"),
        },
        "col" | "box" | "tab" | "task" | "disclosure" | "bubble" | "fig" | "caption" => {
            if label.is_empty() {
                body
            } else {
                format!("**{label}**\n\n{body}")
            }
        }
        _ => {
            let head = capitalise(name);
            if label.is_empty() {
                format!("**{head}**\n\n{body}")
            } else {
                format!("**{head}: {label}**\n\n{body}")
            }
        }
    }
}

/// The `@parameters` section, as the two-column table SideFX draws.
///
/// The doc build gives every parameter a `div.parameter.sbs-item`, which is a
/// name in a narrow left column and its help beside it. The markup underneath
/// is a plain definition — `Group:` with an indented body — so rendering the
/// definition as written gives a bold line with a paragraph under it, and a
/// node with twenty parameters becomes a page of forty stacked blocks with no
/// column to read down. The table is what the reader is meant to see.
///
/// A parameter FOLDER is a heading inside the section. It keeps its heading
/// and gets a table of its own, so the folders stay separable.
fn parameters(children: &[Block], depth: u8) -> String {
    let mut out = String::new();
    let mut run: Vec<&Block> = Vec::new();

    let flush = |run: &mut Vec<&Block>, out: &mut String| {
        if run.is_empty() {
            return;
        }
        out.push_str("| Parameter | Description |\n| --- | --- |\n");
        for block in run.drain(..) {
            let Block::Definition { term, children, .. } = block else {
                continue;
            };
            out.push_str(&format!(
                "| **{}** | {} |\n",
                cell_text(&inlines(term)),
                cell_text(&cell_html(children, false))
            ));
        }
        out.push('\n');
        // Shares its row format with `flush_side_by_side`; kept separate
        // because a parameter table also has to split on a folder heading
        // and a group divider, which no other side-by-side content does.
    };

    for child in children {
        match child {
            Block::Definition { .. } => run.push(child),
            Block::Heading {
                level,
                title: heading,
                children,
                ..
            } => {
                flush(&mut run, &mut out);
                let level = (*level).clamp(3, 6);
                out.push_str(&format!(
                    "{} {}\n\n{}",
                    "#".repeat(level as usize),
                    title(heading),
                    parameters(children, depth)
                ));
            }
            // A divider inside `@parameters` is a parameter group, not a rule.
            // Its label names the group and its children are parameters, so
            // they stay in the table instead of dropping out of it as prose.
            Block::Divider {
                label, children, ..
            } => {
                flush(&mut run, &mut out);
                if let Some(label) = label {
                    out.push_str(&format!("### {}\n\n", inlines(label)));
                }
                out.push_str(&parameters(children, depth));
            }
            other => {
                flush(&mut run, &mut out);
                out.push_str(&one(other, depth));
            }
        }
    }
    flush(&mut run, &mut out);
    out
}

/// A parameter's help, as one line of HTML that can sit in a table cell.
///
/// Markdown has no block inside a cell, so everything a parameter body can
/// hold — paragraphs, the menu of values under it, a small table of attribute
/// names — becomes HTML that `rehype-raw` renders. Nested tables are written
/// as a list: a table inside a table cell is parsed apart by the HTML parser
/// before the front-end ever sees it.
fn cell_html(blocks: &[Block], raw: bool) -> String {
    let mut out = String::new();
    let gap = |out: &mut String| {
        if !out.is_empty() {
            out.push_str("<br><br>");
        }
    };
    for block in blocks {
        match block {
            Block::Paragraph { text } | Block::Summary { text } => {
                gap(&mut out);
                out.push_str(&text_in(text, raw));
            }
            // The menu of values under a parameter — `Static`, `Animated`.
            Block::Definition { term, children, .. } => {
                gap(&mut out);
                out.push_str(&format!(
                    "<strong>{}</strong><br>{}",
                    text_in(term, raw),
                    cell_html(children, raw)
                ));
            }
            Block::Bullets { items } | Block::Numbers { items } => {
                let tag = matches!(block, Block::Numbers { .. })
                    .then_some("ol")
                    .unwrap_or("ul");
                let rows: String = items
                    .iter()
                    .map(|item| format!("<li>{}</li>", cell_html(&item.blocks, raw)))
                    .collect();
                out.push_str(&format!("<{tag}>{rows}</{tag}>"));
            }
            Block::Code { text, .. } => {
                out.push_str(&format!("<pre><code>{}</code></pre>", escape(text)));
            }
            Block::Table { rows } => {
                let rows: String = rows
                    .iter()
                    .map(|row| {
                        let cells: Vec<String> =
                            row.iter().map(|cell| cell_html(&cell.blocks, raw)).collect();
                        match cells.split_first() {
                            Some((first, rest)) if !rest.is_empty() => {
                                format!("<li><strong>{first}</strong> {}</li>", rest.join(" "))
                            }
                            _ => format!("<li>{}</li>", cells.join(" ")),
                        }
                    })
                    .collect();
                out.push_str(&format!("<ul>{rows}</ul>"));
            }
            Block::Html {
                tag,
                attributes,
                children,
            } => out.push_str(&html(tag, attributes, children)),
            Block::Item { children, .. } => {
                gap(&mut out);
                out.push_str(&cell_html(children, raw));
            }
            other => {
                gap(&mut out);
                out.push_str(one(other, 1).trim());
            }
        }
    }
    out
}

/// Text inside a table cell, in the notation that cell's reader understands.
///
/// A markdown table cell is parsed as markdown, so ``P`` there becomes a code
/// pill. The content of a RAW HTML element is not parsed as markdown at all,
/// so the same backticks would reach the reader as backticks — that content
/// has to be written as HTML.
fn text_in(text: &[Inline], raw: bool) -> String {
    match raw {
        false => inlines(text),
        true => raw_inlines(text),
    }
}

/// The same inline text as `inlines`, in HTML.
///
/// Not `html::inlines`: that one writes the icons and glyphs the HTML page
/// draws, and the front-end's markdown renderer has no component for them.
/// This writes only what a table cell needs, and drops what `inlines` drops.
fn raw_inlines(text: &[Inline]) -> String {
    let mut out = String::new();
    for inline in text {
        match inline {
            Inline::Text { text } => out.push_str(&escape(text)),
            Inline::Raw { text } => out.push_str(text),
            Inline::Bold { body } | Inline::Ui { body } => {
                out.push_str(&format!("<strong>{}</strong>", raw_inlines(body)))
            }
            Inline::Italic { body } => out.push_str(&format!("<em>{}</em>", raw_inlines(body))),
            Inline::Code { text } => out.push_str(&format!("<code>{}</code>", escape(text))),
            Inline::Var { name } => out.push_str(&format!("<code>&lt;{}&gt;</code>", escape(name))),
            Inline::Key { key } => out.push_str(&format!("<code>{}</code>", escape(key))),
            Inline::Glyph { .. } | Inline::Fold { .. } | Inline::Icon { .. } => {}
            Inline::Image { src } => {
                out.push_str(&format!("<img src=\"{}\" alt=\"\">", attribute(src)))
            }
            Inline::Link { text, target } => out.push_str(&format!(
                "<a href=\"{}\">{}</a>",
                attribute(&url(target)),
                raw_inlines(text)
            )),
        }
    }
    out
}

/// Anything going into a pipe-table cell. A cell is one line, and a bar in it
/// ends the cell.
fn cell_text(body: &str) -> String {
    body.replace('|', "\\|")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn escape(text: &str) -> String {
    text.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;")
}

fn table(rows: &[Vec<crate::model::Cell>], depth: u8) -> String {
    let width = rows.iter().map(|r| r.len()).max().unwrap_or(0);
    if width == 0 {
        return String::new();
    }
    // A table inside a cell has no markdown of its own to fall back on: a
    // pipe table is a run of whole lines, and a cell is one line of one. The
    // parameters table already writes nested content as HTML for the same
    // reason; a nested table takes that route too, instead of running the
    // pipe-table renderer a second time and flattening its own pipes into
    // the cell's text.
    let cell = |cell: &crate::model::Cell| {
        let text = if cell.blocks.iter().any(|b| matches!(b, Block::Table { .. })) {
            cell_html(&cell.blocks, false)
        } else {
            blocks(&cell.blocks, depth + 1)
        };
        cell_text(&text)
    };
    let mut out = String::new();
    let heading = rows.first().is_some_and(|r| r.iter().all(|c| c.heading));
    let mut rows = rows.iter();
    let header: Vec<String> = match heading {
        true => rows
            .next()
            .expect("the table has a row")
            .iter()
            .map(cell)
            .collect(),
        false => vec![String::new(); width],
    };
    out.push_str(&format!("| {} |\n", pad(&header, width).join(" | ")));
    out.push_str(&format!("|{}\n", " --- |".repeat(width)));
    for row in rows {
        let cells: Vec<String> = row.iter().map(cell).collect();
        out.push_str(&format!("| {} |\n", pad(&cells, width).join(" | ")));
    }
    out.push('\n');
    out
}

fn pad(cells: &[String], width: usize) -> Vec<String> {
    let mut cells = cells.to_vec();
    cells.resize(width, String::new());
    cells
}

fn list_item(marker: &str, body: &str) -> String {
    let body = body.trim_end();
    let mut out = String::new();
    for (i, line) in body.lines().enumerate() {
        if i == 0 {
            out.push_str(&format!("{marker} {line}\n"));
        } else if line.is_empty() {
            out.push('\n');
        } else {
            out.push_str(&format!("  {line}\n"));
        }
    }
    out
}

fn indent(body: &str) -> String {
    let mut out = String::new();
    for line in body.trim_end().lines() {
        if line.is_empty() {
            out.push('\n');
        } else {
            out.push_str(&format!("  {line}\n"));
        }
    }
    out.push('\n');
    out
}

/// The GitHub-style admonition a `:name:` block becomes, and the title written
/// after the marker.
///
/// `remark-callouts` on the front-end reads the marker and draws the coloured
/// surface. It knows five kinds, so a release note is one of those five with a
/// title that says which kind of change it announces.
fn admonition(name: &str) -> Option<(&'static str, Option<&'static str>)> {
    match name {
        "note" => Some(("NOTE", None)),
        // A per-platform note is a note. The platform is its title, which the
        // site drops and this keeps.
        "platform" => Some(("NOTE", None)),
        "tip" => Some(("TIP", None)),
        "warning" => Some(("WARNING", None)),
        "new" => Some(("NOTE", Some("New"))),
        "improved" => Some(("NOTE", Some("Improved"))),
        "changed" => Some(("IMPORTANT", Some("Changed"))),
        "dev" => Some(("NOTE", Some("For developers"))),
        "fixed" => Some(("TIP", Some("Fixed"))),
        "bug" => Some(("CAUTION", Some("Bug"))),
        _ => None,
    }
}

fn quote(body: &str) -> String {
    let mut out = String::new();
    for line in body.trim_end().lines() {
        if line.is_empty() {
            out.push_str(">\n");
        } else {
            out.push_str(&format!("> {line}\n"));
        }
    }
    out.push('\n');
    out
}

fn capitalise(name: &str) -> String {
    let mut chars = name.chars();
    match chars.next() {
        Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
        None => String::new(),
    }
}

pub fn inlines(inlines: &[Inline]) -> String {
    let mut out = String::new();
    for inline in inlines {
        match inline {
            Inline::Text { text } | Inline::Raw { text } => out.push_str(text),
            Inline::Bold { body } | Inline::Ui { body } => {
                out.push_str(&format!("**{}**", self::inlines(body)))
            }
            Inline::Italic { body } => out.push_str(&format!("_{}_", self::inlines(body))),
            Inline::Code { text } => out.push_str(&format!("`{text}`")),
            Inline::Var { name } => out.push_str(&format!("`<{name}>`")),
            Inline::Key { key } => out.push_str(&format!("`{key}`")),
            Inline::Glyph { .. } | Inline::Fold { .. } => {}
            Inline::Image { src } => out.push_str(&format!("![]({src})")),
            // An icon is a Houdini icon name, not a file. It carries no
            // meaning in text, so it is left out.
            Inline::Icon { .. } => {}
            Inline::Link { text, target } => {
                out.push_str(&format!("[{}]({})", self::inlines(text), url(target)))
            }
        }
    }
    out
}

/// The path a link points at inside the app.
pub fn url(target: &LinkTarget) -> String {
    match target {
        LinkTarget::Wiki { path, anchor } => match anchor {
            Some(anchor) => format!("{path}#{anchor}"),
            None => path.clone(),
        },
        LinkTarget::Web { url } => url.clone(),
        LinkTarget::Node { path } => format!("/nodes/{path}"),
        LinkTarget::Expression { name } => format!("/expressions/{name}"),
        LinkTarget::Vex { name } => format!("/vex/functions/{name}"),
        LinkTarget::Mantra { name } => format!("/props/mantra#{name}"),
        LinkTarget::Hom { path, member } => match member {
            Some(member) => format!("/hom/{}#{member}", path.replace('.', "/")),
            None => format!("/hom/{}", path.replace('.', "/")),
        },
        LinkTarget::Py { path, member } => match member {
            Some(member) => format!("/hapi/{path}#{member}"),
            None => format!("/hapi/{path}"),
        },
        LinkTarget::HScript { name } => format!("/commands/{name}"),
        LinkTarget::Wikipedia { article } => {
            format!("https://en.wikipedia.org/wiki/{article}")
        }
    }
}
