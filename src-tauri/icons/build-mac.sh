#!/bin/sh
# Builds the macOS icons from AppIcon.icon (open it in Icon Composer to edit).
# Needs a Mac with Xcode 26. Assets.car is what macOS 26 shows; icon.icns is
# the default look on Apple's 824-in-1024 grid, for older systems.
set -e
cd "$(dirname "$0")"
T=$(mktemp -d)
xcrun actool AppIcon.icon --compile "$T" --platform macosx --minimum-deployment-target 10.13 \
  --app-icon AppIcon --output-partial-info-plist "$T/info.plist" >/dev/null
cp "$T/Assets.car" Assets.car
"$(xcode-select -p)/../Applications/Icon Composer.app/Contents/Executables/ictool" AppIcon.icon \
  --export-image --output-file "$T/plate.png" --platform macOS --rendition Default \
  --width 824 --height 824 --scale 1 >/dev/null
sips -p 1024 1024 "$T/plate.png" --out "$T/full.png" >/dev/null
mkdir "$T/icon.iconset"
for s in 16 32 128 256 512; do
  sips -z $s $s "$T/full.png" --out "$T/icon.iconset/icon_${s}x${s}.png" >/dev/null
  sips -z $((s * 2)) $((s * 2)) "$T/full.png" --out "$T/icon.iconset/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$T/icon.iconset" -o icon.icns
