# Desktop icons

Every desktop icon is generated from SVG sources in `apps/desktop/src-tauri/icons/`.
One command rebuilds the whole set:

```sh
bun run icon:desktop
```

Put the new picture into `app-icon.svg`, run the command, done. No manual
`sips`, no `tauri icon` by hand.

## Sources

| file | role |
|---|---|
| `app-icon.svg` | App icon source: gradient tile, rounded rect, bracket glyph |
| `tray-black.svg` | Tray glyph, black stroke, square viewBox |
| `tray-white.svg` | Tray glyph, white stroke, square viewBox |
| `render-app-icon.swift` | Bakes the padded 1024 master `app-icon.png` |

## What the pipeline writes

| output | used for |
|---|---|
| `icon.ico`, `StoreLogo.png`, `Square*.png` | Windows bundling, full-bleed (`tauri icon` output) |
| `app-icon.png` | 1024 master, tile at ~80% of the canvas |
| `icon.png`, `32x32.png`, `64x64.png`, `128x128.png`, `128x128@2x.png` | resizes of the padded master, listed in `bundle.icon` |
| `icon.icns` | macOS bundle, every layer resized from the padded master |
| `tray-black.png`, `tray-white.png` | 44px, embedded in `lib.rs` |

`tauri icon` also emits `ios/` and `android/` sets; the script deletes them.
Temporary dirs (iconset, tray render, the pristine full-bleed copy) are cleaned
up on exit.

## Dock tile size

macOS renders a full-bleed square edge-to-edge, and LaunchServices trims fully
transparent margins. Both make an unpadded icon look oversized in the Dock.
`render-app-icon.swift` counters with:

- padding: the tile is drawn at `pad = S * 0.099` of the 1024 canvas. This is
  the only knob for dock size;
- pin corners: four 2x2 px squares at alpha `2/255` in the corners keep the
  transparent border from being trimmed and rescaled.

Padding is always applied to the pristine `tauri icon` output, never to an
already padded file: a repeated pass compounds (86% → 71% → 59% is what
happened once). The `.app-icon-bleed.png` copy inside the script exists for
that reason.

## Seeing the result

`tauri dev` embeds icons at compile time and does not watch PNG changes. After
`icon:desktop`, restart the app: `touch apps/desktop/src-tauri/src/lib.rs`
(the running watcher rebuilds and restarts it) or restart
`bun run dev:desktop`.

For an installed app, rebuild the bundle. If Dock or Finder still show the old
picture, it is the LaunchServices cache: `killall Dock`.

## Tray theming

`lib.rs` embeds both tray PNGs. macOS gets the black glyph with
`icon_as_template(true)` and the system recolors it for light and dark menu
bars. Windows and Linux pick the variant from the window theme and swap it on
`WindowEvent::ThemeChanged`.
