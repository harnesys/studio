#!/usr/bin/env bash
# Regenerates every desktop icon from the SVG sources in apps/desktop/src-tauri/icons:
#   app-icon.svg      -> tauri full-bleed set (ico, StoreLogo, Square*), padded master,
#                        macOS PNG sizes + icon.icns
#   tray-black.svg    -> tray-black.png (44px, black glyph: macOS template)
#   tray-white.svg    -> tray-white.png (44px, white glyph: dark panels on Win/Linux)
# Dock tile size is set only by render-app-icon.swift (pad fraction of the 1024 canvas).
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
desktop="$root/apps/desktop/src-tauri"
icons="$desktop/icons"
master="$icons/app-icon.png"
tauri_cli="../node_modules/.bin/tauri"

(cd "$desktop" && $tauri_cli icon icons/app-icon.svg) >/dev/null
rm -rf "$icons/ios" "$icons/android"

bleed="$icons/.app-icon-bleed.png"
cp "$icons/icon.png" "$bleed"
swift "$icons/render-app-icon.swift" "$bleed" "$master"

sips -z 512 512 "$master" --out "$icons/icon.png" >/dev/null
sips -z 32 32 "$master" --out "$icons/32x32.png" >/dev/null
sips -z 64 64 "$master" --out "$icons/64x64.png" >/dev/null
sips -z 128 128 "$master" --out "$icons/128x128.png" >/dev/null
sips -z 256 256 "$master" --out "$icons/128x128@2x.png" >/dev/null

iconset="$(mktemp -d "${TMPDIR:-/tmp}/Harnesys.XXXXXX.iconset")"
traytmp="$(mktemp -d "${TMPDIR:-/tmp}/Harnesys.tray.XXXXXX")"
trap 'rm -rf "$iconset" "$traytmp" "$bleed"' EXIT

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

(cd "$desktop" && $tauri_cli icon --output "$traytmp/black" icons/tray-black.svg) >/dev/null
(cd "$desktop" && $tauri_cli icon --output "$traytmp/white" icons/tray-white.svg) >/dev/null
sips -z 44 44 "$traytmp/black/icon.png" --out "$icons/tray-black.png" >/dev/null
sips -z 44 44 "$traytmp/white/icon.png" --out "$icons/tray-white.png" >/dev/null

echo "wrote $icons/icon.icns, PNG sizes, tray-black.png, tray-white.png"
