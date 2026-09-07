# Deployment

`main` is the desktop app. It ships as a signed installer through GitHub
Releases, and GitHub Releases is also the update channel.

## The pipeline

One workflow, `.github/workflows/release.yml`, on a `v*` tag.

1. Push a tag. Nothing else starts a release.
2. `tauri-action` runs `bun run tauri build` on `windows-latest`.
3. It signs the installer with the updater key and writes `latest.json`.
4. It opens a **draft** release holding three files.
5. You paste the release notes into the draft and publish it.
6. Publishing is what starts the update. Installed copies read
   `releases/latest/download/latest.json` on their next launch.

## What reaches GitHub

Two files, and nothing else:

| file | what it is |
| --- | --- |
| `HoudiniMD_<version>_x64-setup.exe` | the installer, about 7 MB |
| `latest.json` | the newest version, where to get it, and its signature |

The `.sig` file Tauri writes is **not** uploaded (`uploadUpdaterSignatures:
false`). The signature the app checks is inside `latest.json`; the `.sig` file
is a second copy that nothing reads, and beside the installer it asks the
reader a question they cannot answer.

GitHub adds `Source code (zip)` and `Source code (tar.gz)` on publish. That
cannot be turned off.

## Why the release is not a prerelease

`releases/latest` skips drafts and prereleases. An installed copy asking for
`releases/latest/download/latest.json` cannot see either one. A beta that no
installed copy can find is not an update channel, so beta builds go out as
ordinary releases with a beta version number.

The draft step stays, because it is where the notes are written.

## Release notes

Write them in the vault, under `side projects/Houdini/HoudiniMD/releases/`, one
file per version. CI cannot read the vault — it is in iCloud — so the file is
the source and the GitHub release body is a copy. Paste it into the draft
before publishing.

A release note is about one version, not about the project.

Write what changed in this version, as a list. Nothing else. For the first
release, say "first release" and list what it ships.

Keep these out. They are project facts, and they belong in the README:

- What the product is, and what it is for.
- How to install it, and what it runs on.
- The feature list that is true of every version.
- How the updater works.
- Where to report a fault.
- Credits and licence.

A reader opens a release note to answer one question: what is different now.
Every line that does not answer this question is bloat.

## Signing

The private key lives in one offline backup and in the repo secret
`TAURI_SIGNING_PRIVATE_KEY`. It has no password, so the workflow sets
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` to the empty string. Leaving it unset
makes the signer stop and ask on a terminal that is not there.

The public key is compiled into the app from `tauri.conf.json`. Changing it
breaks every installed copy.

## Building on this machine

    bun run tauri build

Two traps, both cost a build here:

- Run it from **Bash**, not PowerShell. `$env:NAME = ""` deletes the variable
  rather than setting it empty, so the signer stops and asks for a password
  that does not exist, and the build hangs after writing the bundle.
- Stop `probe.exe` first. It holds `target/release/probe.exe` open and cargo
  cannot replace it.

## The installer

Per-user, `installMode: "currentUser"`. It installs to
`%LOCALAPPDATA%\Programs\HoudiniMD` and asks for no administrator rights.

**Do not set `installMode` to `both` or `perMachine`.** Both make NSIS ask for
administrator rights, which means a UAC prompt on every install AND on every
silent update. Read the manifest to check a build:

    strings -a <installer>.exe | grep -o 'requestedExecutionLevel level="[a-z]*"'

`asInvoker` is right. `highestAvailable` is the broken one.

Data lives in `%APPDATA%\com.houdinimd.app` and survives an uninstall, so a
reinstall does not index the docs again.

WebView2 comes from the downloading bootstrapper: the installer looks for the
runtime and fetches it only when the machine does not have it.

## The site still exists

The Next.js site lives on `web`, and releases from `web-prod`.
It will wind down on January 1st, 2027.

The Cloudflare app is installed on the repo, so a push to `web-prod` runs
`bun run deploy` in Cloudflare CI. **CI is the only place that deploys.** Never
run `bun run deploy` locally: Tailwind's native scanner ships one compiled
binary per operating system, so a local build makes a different CSS content
hash than CI, and that hash sits in the URL of every prerendered page.

Do not merge `main` into `web` or `web-prod`. They are two products now.

## Reading a build

A finished Cloudflare build reports status `stopped`, not `success`. Read the
log to tell a deploy from a failure — look for `Success: Deploy command
completed`, and check that `wrangler` printed a Version ID.
