# lsp-bridge

Live language-server diagnostics/hover/definition for the file editor.

`attachLspBridge({ workspaceId, path, monaco, onStatus, onActivity })` connects the
open Monaco model to `/api/lsp?workspace=&path=` (server picks the language server
from enabled plugin `lspServers`), streams `didOpen`/`didChange`, and renders
`publishDiagnostics` as markers. For ts/js it disables the built-in Monaco TS
worker validation while live.

Server side: `apps/server/src/adapters/http/lsp/lsp-bridge.controller.ts`.
Statuses: `starting → live`, `off` (no server for the file), `error` (start failed).
