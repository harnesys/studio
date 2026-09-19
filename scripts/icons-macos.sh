#!/usr/bin/env bash
# Bake Dock / bundle icons from the 1024 master PNG.
# Keeps every icns layer padded — do not run `tauri icon` over these files.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
icons="$root/apps/desktop/src-tauri/icons"
master="$icons/app-icon.png"

if [[ ! -f "$master" ]]; then
  echo "missing $master — run: bun run icon:desktop:app" >&2
  exit 1
fi

sips -z 512 512 "$master" --out "$icons/icon.png" >/dev/null
sips -z 32 32 "$master" --out "$icons/32x32.png" >/dev/null
sips -z 64 64 "$master" --out "$icons/64x64.png" >/dev/null
sips -z 128 128 "$master" --out "$icons/128x128.png" >/dev/null
sips -z 256 256 "$master" --out "$icons/128x128@2x.png" >/dev/null

iconset="$(mktemp -d "${TMPDIR:-/tmp}/Harnesys.XXXXXX.iconset")"
trap 'rm -rf "$iconset"' EXIT

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

echo "wrote $icons/icon.icns and PNG sizes"
