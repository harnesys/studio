# LSP: file SoT, lifecycle, settings tab

Date: 2026-09-18. Status: approved sections 1-4, implement.

## Goal

Plugin summary shows `lsp-server native`, editor stays `off`. Root: stale
caches after install/update. Build normal LSP support: reload in popup,
workspace settings tab, custom servers without a plugin, presets.

## 1. SoT and merge

- Custom servers live in `<workspace>/.harnesys/lsp.json`, shape = `lspServers`
  record (`serverId -> spec` per `parsePluginLspServers`).
- Resolve order per cwd: file servers first, then plugin `lsp-server`
  components. First wins per extension, loser gets `lsp_shadowed`.
  Each entry carries `origin: 'file' | 'plugin:<name>'`.
- `disabled: true` in file entry excludes the server from resolve.
- Foundation fix (same change): `WorkspaceHarnesysRegistry.forget()`
  evicts `irCache` entries of the workspace; `StudioLspAdapter` gains
  `invalidateCwd(cwd)` (drop `serversByCwd` + dispose sessions of cwd);
  `invalidatePluginWorkspaces` calls both. Diagnostic paths from
  `prepareCatalogCheckout(staged)` are rewritten `staged -> final`.

Files: `workspace-harnesys.registry.ts`, `studio-lsp.adapter.ts`,
`invalidate-plugin-workspaces.ts`, `update-plugin.use-case.ts`,
`install-plugin-tree.ts`, new `workspace-lsp-file.ts` (read/write/validate).

## 2. Server API (per node)

- `GET /api/workspaces/:id/lsp` -> merged list:
  `serverId, origin, command, args, extensionToLanguage, disabled,
  granted(process), binaryOk, status`.
- `PUT /api/workspaces/:id/lsp` -> validate + write file + invalidate cwd.
- `POST /api/workspaces/:id/lsp/:serverId/restart` -> invalidate cwd entry
  (kills session, drops resolve cache).
- `POST /api/workspaces/:id/lsp/:serverId/stop` -> kill session +
  set `disabled: true` in file (plugin servers: only session kill +
  `isServerDisabled` record, config untouched).
- `POST /api/workspaces/:id/lsp/preset/:lang` -> writes TS preset now;
  `python|rust|go` return 501 with install hint (template only).
- `binaryOk` via `which command`; spawn fallback `bunx --bun` unchanged.

New: `lsp.controller.ts` + `lsp-files` adapter, wired in
`wire-controllers.ts` through routing repos (node = `requireNode(id)`).

## 3. Client (FSD)

- Popup `editor-status-bar.tsx`: reload icon next to current-file server row.
  Calls restart, then disposes and re-attaches bridge for that file.
- Settings: new `lsp-pane.tsx` in `manage-workspace-settings`
  (nav item next to plugins/mcp): table
  `serverId | origin | command | ext | status`, actions restart/stop,
  raw JSON editor for the file, presets block (TypeScript one-click,
  python/rust/go cards with install command text).
- Grant UX unchanged: `process` grant still required for plugin servers.

## 4. Errors and check

- Missing binary: status `error`, hint carries preset install command.
  No auto-download.
- Grants unchanged. No cross-node propagation (installs stay per node).
- No `*.test.ts` (repo ban). Manual check via agent-browser:
  open TS file (live), stop from popup (off), restart from tab (live),
  custom server via preset, missing binary hint.
