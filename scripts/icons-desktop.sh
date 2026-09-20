#!/usr/bin/env bash
# Full desktop icon pipeline from the SVG source:
# tauri icon (full-bleed ico/store set) -> padded 1024 master -> icns/PNG bake.
# Dock tile size is set only here: pad = 10% matches Apple's icns grid (tile 824/1024).
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
desktop="$root/apps/desktop/src-tauri"
icons="$desktop/icons"
master="$icons/app-icon.png"

(cd "$desktop" && ../node_modules/.bin/tauri icon icons/app-icon.svg) >/dev/null
rm -rf "$icons/ios" "$icons/android"

bleed="$icons/.app-icon-bleed.png"
cp "$icons/icon.png" "$bleed"
trap 'rm -f "$bleed"' EXIT

swift "$icons/render-app-icon.swift" "$bleed" "$master"

sips -z 512 512 "$master" --out "$icons/icon.png" >/dev/null
sips -z 32 32 "$master" --out "$icons/32x32.png" >/dev/null
sips -z 64 64 "$master" --out "$icons/64x64.png" >/dev/null
sips -z 128 128 "$master" --out "$icons/128x128.png" >/dev/null
sips -z 256 256 "$master" --out "$icons/128x128@2x.png" >/dev/null

iconset="$(mktemp -d "${TMPDIR:-/tmp}/Harnesys.XXXXXX.iconset")"
trap 'rm -rf "$iconset" "$bleed"' EXIT

sips -z 16 16     "$master" --out "$iconset/icon_16x16.png" >/dev/null
sips -z 32 32     "$master" --out "$iconset/icon_16x16@2x.png" >/dev/null
sips -z 32 32     "$master" --out "$iconset/icon_32x32.png" >/dev/null
sips -z 64 64     "$master" --out "$iconset/icon_32x32@2x.png" >/dev/null
sips -z 128 128   "$master" --out "$iconset/icon_128x128.png" >/dev/null
sips -z 256 256   "$master" --out "$iconset/icon_128x128@2x.png" >/dev/null
sips -z 256 256   "$master" --out "$iconset/icon_256x256.png" >/dev/null
sips -z 512 512   "$master" --out "$iconset/icon_256x256@2x.png" >/dev/null
sips -z 512 512   "$master" --out "$iconset/icon_512x512.png" >/dev/null
sips -z 1024 1024 "$master" --out "$iconset/icon_512x512@2x.png" >/dev/null
iconutil -c icns "$iconset" -o "$icons/icon.icns"

echo "wrote $master and $icons/icon.icns (tile $(( (1024 - 2 * 1024 * 10 / 100) ))/1024)"
