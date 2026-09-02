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
    for block in blocks {
        out.push_str(&one(block, depth));
    }
    out
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
            format!("## {heading}\n\n{}", blocks(children, depth))
        }
        Block::Paragraph { text } => format!("{}\n\n", inlines(text)),
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
        Block::Divider { label, .. } => match label {
            Some(label) => format!("---\n\n**{}**\n\n", inlines(label)),
            None => "---\n\n".to_string(),
        },
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
        Block::Html { tag, children, .. } => {
            format!("<{tag}>\n\n{}\n</{tag}>\n\n", blocks(children, depth))
        }
        Block::RawHtml { html } => format!("{html}\n\n"),
    }
}

fn item(name: &str, label: &str, props: &Props, children: &[Block], depth: u8) -> String {
    let body = blocks(children, depth + 1);
    match name {
        // Markdown has no video, and the app renders the raw tag with the same
        // component that draws a picture. `loop` and `autoplay` are the page's
        // own, so a demonstration that repeats keeps repeating here.
        "video" => {
            let src = prop(props, "src").unwrap_or_default();
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
        "tip" | "note" | "warning" | "new" | "improved" | "changed" | "dev" | "fixed" | "bug" => {
            let head = capitalise(name);
            let head = if label.is_empty() {
                head
            } else {
                format!("{head}: {label}")
            };
            quote(&format!("**{head}**\n\n{body}"))
        }
        "platform" => quote(&format!("**{label}**\n\n{body}")),
        "usage" => body,
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

fn table(rows: &[Vec<crate::model::Cell>], depth: u8) -> String {
    let width = rows.iter().map(|r| r.len()).max().unwrap_or(0);
    if width == 0 {
        return String::new();
    }
    let cell = |cell: &crate::model::Cell| {
        blocks(&cell.blocks, depth + 1)
            .replace('|', "\\|")
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ")
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
        LinkTarget::HScript { name } => format!("/commands/{name}"),
        LinkTarget::Wikipedia { article } => {
            format!("https://en.wikipedia.org/wiki/{article}")
        }
    }
}
