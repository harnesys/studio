# LSP lifecycle + settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix stale LSP caches and ship file-based custom LSP with popup reload and settings tab.

**Architecture:** File `<workspace>/.harnesys/lsp.json` is SoT for custom servers; resolve merges file first then plugin IR; mutations invalidate resolve cache plus sessions.

**Tech Stack:** Bun, Hono, React FSD, harnesys `parsePluginLspServers`.

**Spec:** `docs/superpowers/specs/2026-09-18-lsp-design.md`

## Global Constraints

- File ops only inside `~/Projects/Harnesys` and `~/.harnesys`.
- No `*.test.ts` / `*.spec.ts`, no vitest/RTL/playwright (repo ban); verify with `bun run lint` and curl/browser.
- FSD imports only downward; slice public API via `index.ts`.
- Studio files stay near 300 lines; split by responsibility.
- No public `packages/harnesys` API changes.
- One task at a time, no drive-by refactors.

---

### Task 1: Cache foundation fix

**Files:**
- Modify: `apps/studio/server/src/adapters/workspace-harnesys.registry.ts`
- Modify: `apps/studio/server/src/adapters/lsp/studio-lsp.adapter.ts`
- Modify: `apps/studio/server/src/application/plugins/invalidate-plugin-workspaces.ts`
- Modify: `apps/studio/server/src/application/plugins/update-plugin.use-case.ts`
- Modify: `apps/studio/server/src/application/plugins/install-plugin-tree.ts`

**Interfaces:**
- Consumes: `WorkspaceHarnesysRegistry.invalidate(workspaceId)`, `StudioLspAdapter` session maps.
- Produces: `StudioLspAdapter.invalidateCwd(cwd: string): Promise<void>`, `WorkspaceHarnesysRegistry.evictIrFor(prefix: string): void`, diag paths pointing at final install dir.

- [ ] **Step 1: evict irCache on forget**

In `workspace-harnesys.registry.ts` add:

```ts
evictIrFor(prefix: string): void {
  for (const key of [...this.irCache.keys()]) {
    if (key.startsWith(prefix)) this.irCache.delete(key);
  }
}
```

Call it in `forget()` before closing runtime: iterate `this.repos.plugins?.list(workspaceId)` and evict `${name}@`. Keep global keys for other workspaces intact.

- [ ] **Step 2: add LSP invalidateCwd**

In `studio-lsp.adapter.ts` add:

```ts
async invalidateCwd(cwd: string): Promise<void> {
  this.serversByCwd.delete(cwd);
  const prefix = `${cwd}::`;
  const doomed = [...this.sessions.entries()].filter(([k]) => k.startsWith(prefix));
  for (const [k] of doomed) this.sessions.delete(k);
  for (const [, p] of doomed) {
    try { (await p).dispose(); } catch { /* ignore */ }
  }
}
```

- [ ] **Step 3: wire invalidation**

Change `invalidate-plugin-workspaces.ts` to accept `{ workspaceHarnesys, lspByWorkspace }: { workspaceHarnesys: WorkspaceHarnesysRegistry; lspByWorkspace: (id: string) => { cwd: string; lsp: StudioLspAdapter } }` and call `forget` + `invalidateCwd`. Update all call sites to pass the resolver (from `requireNode(supervisor, id)` in routing contexts, direct host in node contexts).

- [ ] **Step 4: rewrite staged diag paths**

In `update-plugin.use-case.ts` after `rename(staged, final)`, map diagnostics: `d.path?.startsWith(staged) ? final + rest : d.path`. Same for `install-plugin-tree.ts` rename branch.

- [ ] **Step 5: verify**

Run: `bun run lint` in repo root. Expected: PASS.

### Task 2: Workspace LSP file SoT + merged resolve

**Files:**
- Create: `apps/studio/server/src/adapters/lsp/workspace-lsp-file.ts`
- Create: `apps/studio/server/src/application/plugins/lsp-presets.ts`
- Modify: `apps/studio/server/src/composition/create-host.ts`

**Interfaces:**
- Consumes: `harnesys` `parsePluginLspServers`, node `workspace.path`.
- Produces: `readWorkspaceLspFile(root): { servers, diagnostics }`, `writeWorkspaceLspFile(root, raw)`, `TYPESCRIPT_PRESET`, merged `lspServersRef.current`.

- [ ] **Step 1: file adapter**

```ts
// workspace-lsp-file.ts
export const WORKSPACE_LSP_PATH = '.harnesys/lsp.json';
export function readWorkspaceLspFile(root: string): { raw: unknown; servers: LspServerSpec[]; diagnostics: PluginDiagnostic[] } {
  const p = join(root, WORKSPACE_LSP_PATH);
  if (!existsSync(p)) return { raw: {}, servers: [], diagnostics: [] };
  const raw = JSON.parse(readFileSync(p, 'utf8'));
  const parsed = parsePluginLspServers(isRecord(raw) ? raw.servers ?? raw : raw, WORKSPACE_LSP_PATH);
  return { raw, servers: parsed.servers, diagnostics: parsed.diagnostics };
}
export async function writeWorkspaceLspFile(root: string, raw: unknown): Promise<void> {
  parsePluginLspServers(isRecord(raw) ? raw.servers ?? raw : raw, WORKSPACE_LSP_PATH); // throws path via diagnostics; reject on missing command
  await mkdir(join(root, '.harnesys'), { recursive: true });
  await writeFile(join(root, WORKSPACE_LSP_PATH), `${JSON.stringify(raw, null, 2)}\n`, 'utf8');
}
```

Missing file = empty list, no error. Invalid JSON surfaces as `server_config_invalid`.

- [ ] **Step 2: TS preset**

```ts
// lsp-presets.ts
export const TYPESCRIPT_PRESET = {
  typescript: {
    command: 'typescript-language-server',
    args: ['--stdio'],
    extensionToLanguage: { '.ts': 'typescript', '.tsx': 'typescriptreact', '.js': 'javascript', '.jsx': 'javascriptreact' },
  },
};
export const PRESET_INSTALL_HINT: Record<string, string> = {
  typescript: 'npm i -g typescript-language-server typescript',
  python: 'pipx install pyright && npm i -g pyright (preset not yet)',
  rust: 'rustup component add rust-analyzer (preset not yet)',
  go: 'go install golang.org/x/tools/gopls@latest (preset not yet)',
};
```

- [ ] **Step 3: merged resolve in create-host**

In `lspServersRef.current`, after loading plugin servers, prepend `readWorkspaceLspFile(workspace.path).servers` (file first). Tag origin for later controller use: keep parallel arrays or attach `(spec as { origin?: string }).origin`. File entries win in adapter dedupe (already first-wins).

- [ ] **Step 4: verify**

Run: `bun run lint`. Expected: PASS.

### Task 3: Server LSP controller + shared contract

**Files:**
- Create: `apps/studio/server/src/adapters/http/lsp/lsp.controller.ts`
- Create: `apps/studio/server/src/application/lsp/lsp-status.use-case.ts`
- Modify: `apps/studio/server/src/composition/wire-controllers.ts`
- Modify: `apps/studio/shared/types.ts`

**Interfaces:**
- Consumes: routing `workspaceRepo`, `requireNode(supervisor, id).host.lsp`, file adapter, `which` check.
- Produces: `GET/PUT /api/workspaces/:id/lsp`, `POST :id/lsp/:serverId/restart`, `POST :id/lsp/:serverId/stop`, `POST :id/lsp/preset/:lang`.

- [ ] **Step 1: shared types**

```ts
export type WorkspaceLspEntry = {
  serverId: string; origin: 'file' | string; command: string; args?: string[];
  extensionToLanguage: Record<string, string>; disabled: boolean;
  granted: boolean; binaryOk: boolean; status: 'live' | 'off' | 'error';
};
export type WorkspaceLspListResponse = { servers: WorkspaceLspEntry[]; diagnostics: PluginDiagnostic[] };
```

- [ ] **Step 2: controller**

Routes resolve node via `requireNode`, `cwd = workspace.path`. `binaryOk` via `Bun.spawnSync(['which', command])`. `restart`: `await host.lsp.invalidateCwd(cwd)`. `stop` file server: rewrite file with `disabled: true` + invalidate; plugin server: `pluginRepo.setServerDisabled(...)` + invalidate. `preset/typescript`: merge preset into file + invalidate; other langs: 501 + hint.

- [ ] **Step 3: wire**

Register controller in `wire-controllers.ts` after plugin controllers with deps `{ workspaceRepo, supervisor }`.

- [ ] **Step 4: verify**

Run: `bun run lint` plus `curl -H "Authorization: Bearer $HOST_TOKEN" localhost:3000/api/workspaces/:id/lsp`. Expected: 200 JSON list.

### Task 4: Editor popup reload icon

**Files:**
- Modify: `apps/studio/client/src/widgets/file-pane/ui/editor-status-bar.tsx`
- Modify: `apps/studio/client/src/features/lsp-bridge/index.ts` (export restart helper)
- Create: `apps/studio/client/src/features/lsp-bridge/model/lsp-restart.ts`

**Interfaces:**
- Consumes: `POST /api/workspaces/:id/lsp/:serverId/restart`, existing `attachLspBridge`.
- Produces: `restartWorkspaceLsp(workspaceId, serverId): Promise<void>`.

- [ ] **Step 1: restart helper**

```ts
export async function restartWorkspaceLsp(workspaceId: string, serverId: string): Promise<void> {
  const res = await fetch(`/api/workspaces/${workspaceId}/lsp/${serverId}/restart`, { method: 'POST', headers: authHeaders() });
  if (!res.ok) throw new Error(`restart failed: ${res.status}`);
}
```

- [ ] **Step 2: popup button**

In `editor-status-bar.tsx` current-file row add `RotateCwIcon` button (`data-testid="lsp-restart"`) calling `onRestartFileServer` prop; `text-editor.tsx` passes handler that calls helper then disposes and re-attaches bridge for that path.

- [ ] **Step 3: verify**

Run: `bun run lint`. Expected: PASS (browser check by owner).

### Task 5: Workspace settings LSP tab

**Files:**
- Create: `apps/studio/client/src/features/manage-workspace-settings/ui/lsp-pane.tsx`
- Create: `apps/studio/client/src/features/manage-workspace-settings/model/use-workspace-lsp.ts`
- Modify: `apps/studio/client/src/features/manage-workspace-settings/model/workspace-settings-nav.ts`
- Modify: `apps/studio/client/src/features/manage-workspace-settings/ui/workspace-settings-category-panes.tsx`

**Interfaces:**
- Consumes: shared `WorkspaceLspListResponse`, controller endpoints.
- Produces: `LspPane{workspaceId}`, `useWorkspaceLsp(workspaceId)` with `{ data, restart, stop, saveRaw, applyPreset }`.

- [ ] **Step 1: hook**

`use-workspace-lsp.ts`: `useState` + `fetch` list on mount, methods POST/PUT then refetch. No new shared client infra; reuse existing `api` helper from neighboring `use-providers.ts`.

- [ ] **Step 2: pane**

Table rows `serverId | origin badge | command | ext list | status dot` with Restart/Stop buttons; raw JSON `<textarea>` + Save; presets row: `[TypeScript: Apply]` + disabled cards `Python/Rust/Go` showing hint text.

- [ ] **Step 3: nav wiring**

Add `'lsp'` to `WorkspaceSettingsCategory`, nav item `{ id: 'lsp', label: 'LSP', icon: ActivityIcon }` under Capabilities after `plugins`, render `<LspPane/>` in category panes switch.

- [ ] **Step 4: verify**

Run: `bun run lint`. Expected: PASS (browser check by owner).

### Task 6: Handoff verification

- [ ] **Step 1: lint**

Run: `bun run lint`. Expected: PASS.

- [ ] **Step 2: owner browser pass**

Open TS file (expect live), popup restart (stays live), settings LSP stop (off), restart (live), apply TS preset on clean workspace, missing-binary hint visible. Owner runs via agent-browser.
