#!/bin/sh
# build.sh <NodebookMD.app> <out.dmg>: the disk image a reader downloads. The
# app on the left, an arrow, Applications on the right. dmgbuild writes the
# window's layout itself, with no Finder script, so it works on CI.
set -eu
here=$(cd "$(dirname "$0")" && pwd)
work=$(mktemp -d)
# One file with both sizes, so a Retina screen draws the sharp one.
tiffutil -cathidpicheck "$here/background.png" "$here/background@2x.png" -out "$work/background.tiff"
python3 -m venv "$work/venv"
"$work/venv/bin/pip" install -q dmgbuild
"$work/venv/bin/dmgbuild" -s "$here/settings.py" -D app="$1" -D background="$work/background.tiff" NodebookMD "$2"
