//! What is on the other side of a link that leaves the help: the title, the
//! description and the picture a site gives for a share card (Open Graph).
//!
//! Only the page's `<head>` is read, and only the tags a share card uses. The
//! app draws the picture from the site itself, so nothing here holds an image.

use std::net::IpAddr;
use std::time::Duration;

use reqwest::Url;
use serde::Serialize;

/// Enough to hold the `<head>` of any page seen so far. The rest of the page is
/// never read.
const LIMIT: usize = 512 * 1024;

#[derive(Serialize, Default, Debug, PartialEq)]
pub struct Preview {
    pub title: Option<String>,
    pub description: Option<String>,
    /// An absolute `http(s)` address.
    pub image: Option<String>,
}

pub async fn fetch(url: &str) -> Result<Preview, String> {
    let url = Url::parse(url).map_err(|e| e.to_string())?;
    if !matches!(url.scheme(), "http" | "https") || private(&url) {
        return Err("only a public web address has a preview".into());
    }
    let _ = rustls::crypto::ring::default_provider().install_default();
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .user_agent(concat!("HoudiniMD/", env!("CARGO_PKG_VERSION"), " (link preview)"))
        // A redirect is checked the same as the link, or a public address
        // could send the request on to one on this network.
        .redirect(reqwest::redirect::Policy::custom(|attempt| {
            if attempt.previous().len() > 5 || private(attempt.url()) {
                attempt.stop()
            } else {
                attempt.follow()
            }
        }))
        .build()
        .map_err(|e| e.to_string())?;
    let mut response = client
        .get(url)
        .send()
        .await
        .and_then(|r| r.error_for_status())
        .map_err(|e| e.to_string())?;
    let html = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|kind| kind.to_str().ok())
        .is_some_and(|kind| kind.contains("html"));
    // A PDF or a download has no share card. The link line alone is the answer.
    if !html {
        return Ok(Preview::default());
    }
    let landed = response.url().clone();
    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|e| e.to_string())? {
        body.extend_from_slice(&chunk);
        if body.len() >= LIMIT || body.windows(7).any(|w| w.eq_ignore_ascii_case(b"</head>")) {
            break;
        }
    }
    Ok(read(&String::from_utf8_lossy(&body), &landed))
}

/// An address on this machine or this network. The help pane's server answers
/// the whole network, so without this a phone on it could read pages that only
/// this machine can reach.
///
/// ponytail: checks the address as written, not what a name resolves to. A
/// public name that points at a private address still passes.
fn private(url: &Url) -> bool {
    let Some(host) = url.host_str() else { return true };
    let host = host.trim_start_matches('[').trim_end_matches(']');
    match host.parse::<IpAddr>() {
        Ok(IpAddr::V4(ip)) => ip.is_private() || ip.is_loopback() || ip.is_link_local() || ip.is_unspecified(),
        Ok(IpAddr::V6(ip)) => ip.is_loopback() || ip.is_unspecified() || ip.is_unique_local() || ip.is_unicast_link_local(),
        Err(_) => host == "localhost" || host.ends_with(".localhost"),
    }
}

/// The share card out of a page's markup. `base` resolves a relative picture.
fn read(html: &str, base: &Url) -> Preview {
    // ASCII lowercase keeps every byte where it was, so an index into `lower`
    // is an index into `html`.
    let lower = html.to_ascii_lowercase();
    let mut meta: Vec<(String, String)> = Vec::new();
    let mut at = 0;
    while let Some(found) = lower[at..].find("<meta") {
        let start = at + found + "<meta".len();
        let (attrs, end) = attributes(&html[start..]);
        at = start + end;
        let value = |name: &str| attrs.iter().find(|(k, _)| k == name).map(|(_, v)| v.clone());
        if let (Some(key), Some(content)) = (value("property").or_else(|| value("name")), value("content")) {
            meta.push((key.to_ascii_lowercase(), content));
        }
    }
    let first = |keys: &[&str]| {
        keys.iter()
            .find_map(|key| meta.iter().find(|(k, _)| k == key).map(|(_, v)| clean(v)))
            .filter(|v| !v.is_empty())
    };
    let title = first(&["og:title", "twitter:title"]).or_else(|| {
        let open = lower.find("<title")?;
        let open = open + lower[open..].find('>')? + 1;
        let close = open + lower[open..].find("</title")?;
        Some(clean(&decode(&html[open..close]))).filter(|t| !t.is_empty())
    });
    let image = first(&["og:image", "og:image:url", "og:image:secure_url", "twitter:image", "twitter:image:src"])
        .and_then(|src| base.join(&src).ok())
        .filter(|url| matches!(url.scheme(), "http" | "https"))
        .map(String::from);
    Preview {
        title,
        description: first(&["og:description", "twitter:description", "description"]),
        image,
    }
}

fn clean(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// The attributes of one tag, read from just after its name, and where the tag
/// ends. Names are lowercase, values are decoded.
fn attributes(tag: &str) -> (Vec<(String, String)>, usize) {
    let bytes = tag.as_bytes();
    let mut out = Vec::new();
    let mut i = 0;
    let skip_space = |i: &mut usize| {
        while *i < bytes.len() && bytes[*i].is_ascii_whitespace() {
            *i += 1;
        }
    };
    loop {
        while i < bytes.len() && (bytes[i].is_ascii_whitespace() || bytes[i] == b'/') {
            i += 1;
        }
        if i >= bytes.len() || bytes[i] == b'>' {
            return (out, i);
        }
        let from = i;
        while i < bytes.len() && !bytes[i].is_ascii_whitespace() && !matches!(bytes[i], b'=' | b'>' | b'/') {
            i += 1;
        }
        let name = tag[from..i].to_ascii_lowercase();
        skip_space(&mut i);
        if bytes.get(i) != Some(&b'=') {
            out.push((name, String::new()));
            continue;
        }
        i += 1;
        skip_space(&mut i);
        let value = match bytes.get(i) {
            Some(&quote @ (b'"' | b'\'')) => {
                let from = i + 1;
                let to = tag[from..].find(quote as char).map_or(bytes.len(), |n| from + n);
                i = (to + 1).min(bytes.len());
                &tag[from..to]
            }
            _ => {
                let from = i;
                while i < bytes.len() && !bytes[i].is_ascii_whitespace() && bytes[i] != b'>' {
                    i += 1;
                }
                &tag[from..i]
            }
        };
        out.push((name, decode(value)));
    }
}

/// The character references a share card uses. An unknown one stays as written.
fn decode(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(at) = rest.find('&') {
        out.push_str(&rest[..at]);
        rest = &rest[at..];
        match rest.find(';').filter(|&n| n <= 12).and_then(|n| Some((entity(&rest[1..n])?, n))) {
            Some((c, n)) => {
                out.push(c);
                rest = &rest[n + 1..];
            }
            None => {
                out.push('&');
                rest = &rest[1..];
            }
        }
    }
    out.push_str(rest);
    out
}

fn entity(name: &str) -> Option<char> {
    match name {
        "amp" => Some('&'),
        "lt" => Some('<'),
        "gt" => Some('>'),
        "quot" => Some('"'),
        "apos" => Some('\''),
        "nbsp" => Some(' '),
        "ndash" => Some('–'),
        "mdash" => Some('—'),
        "hellip" => Some('…'),
        "lsquo" => Some('‘'),
        "rsquo" => Some('’'),
        "ldquo" => Some('“'),
        "rdquo" => Some('”'),
        "middot" => Some('·'),
        "copy" => Some('©'),
        _ => {
            let code = match name.strip_prefix('#')? {
                hex if hex.starts_with(['x', 'X']) => u32::from_str_radix(&hex[1..], 16).ok()?,
                dec => dec.parse().ok()?,
            };
            char::from_u32(code)
        }
    }
}
