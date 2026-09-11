# Agent Plugins Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Load Agent Plugins 1.0.0 (plus Claude-layout compat) in `packages/harnesys`, install/enable them from git in Studio, and make `obra/superpowers` work end-to-end (prefixed skills + trusted SessionStart bootstrap note).

**Architecture:** Single normalized `Plugin` model in the library; AP and Claude adapters feed it. Studio owns git install, SQLite records, trust, workspace enable, HTTP/UI, and wires skills/MCP/notes into `WorkspaceHarnesysRegistry` + `StudioRunTargets`.

**Tech Stack:** TypeScript, Bun, Hono, Drizzle/SQLite, React (FSD client), existing `FsSkillRegistry` / `LlmNoteProvider` / `CursorMcpJson`.

**Spec:** `docs/superpowers/specs/2026-09-11-agent-plugins-design.md`

## Global Constraints

- Spec version: Agent Plugins **1.0.0** (`https://agent-plugins.org/schemas/1.0.0/plugin.schema.json`)
- Skill ids: `pluginName:skillName` (example `superpowers:brainstorming`)
- Extension namespace: `com.harnesys.studio`
- Hooks: trust required; allowlist `SessionStart` / `SessionStart:startup` / `SessionStart:clear` / `SessionStart:compact`
- Install path: `~/.harnesys/plugins/<name>/`; data: `~/.harnesys/plugins-data/<name>/`
- **No `*.test.ts` / `*.spec.ts` / playwright** (repo ban). Verify with `bun run typecheck`, `bun run lint`, throwaway `bun -e` probes, and agent-browser E2E
- **Do not `git commit` unless the user explicitly asks** in that turn (skip commit steps while executing)
- Library public API changes only as listed in this plan (already approved in the spec discussion)
- File size target ~300 lines; split by responsibility (not `types.ts`/`utils.ts` dumps)
- Named types only: no `T['field']`, no `Parameters<typeof fn>[0]`

---

## File map

### Library (`packages/harnesys`)

| Path | Responsibility |
| --- | --- |
| `src/domain/plugin.ts` | `Plugin`, `PluginManifest`, skill/mcp/hook/agent/command refs |
| `src/ports/plugins.ts` | `loadPluginFromDirectory` port types; hook runner options |
| `src/application/plugins/plugin-name.ts` | AP name pattern validation |
| `src/application/plugins/parse-plugin-manifest.ts` | Parse/validate AP `plugin.json` |
| `src/application/plugins/plugin-path-safety.ts` | Containment + `./` relative resolve |
| `src/application/plugins/discover-plugin-skills.ts` | Immediate `skills/*/SKILL.md` |
| `src/application/plugins/parse-plugin-mcp.ts` | AP `mcp.json` → internal + `CursorMcpJson` fragment |
| `src/application/plugins/expand-plugin-vars.ts` | `${PLUGIN_ROOT}` / `${PLUGIN_DATA}` |
| `src/application/plugins/claude-compat.ts` | Detect Claude layout; normalize to `Plugin` |
| `src/application/plugins/load-plugin.ts` | Orchestrate detect → load → diagnostics |
| `src/application/plugins/prefixed-skill-registry.ts` | Wrap registry; rewrite `name` → `prefix:name` |
| `src/application/plugins/merge-plugin-runtime.ts` | Merge enabled plugins → skill registries + MCP JSON |
| `src/application/plugins/hooks-runner.ts` | Allowlisted command hooks + timeout |
| `src/application/plugins/session-start-notes.ts` | Hooks → `LlmNoteProvider` (cache per `runId`) |
| `src/adapters/fs-plugin-loader.ts` | Node FS entry: read files, call loaders |
| `src/adapters/node/index.ts` | Export FS loader |
| `index.ts` | Export public types + pure helpers |

### Studio server

| Path | Responsibility |
| --- | --- |
| `server/src/config/constants.ts` | `PLUGINS_DIR`, `PLUGINS_DATA_DIR`, hook timeout ms |
| `server/src/adapters/store/studio-layout.ts` | `pluginsPath`, `pluginDataPath` |
| `server/src/adapters/store/sqlite/schema/plugins.ts` | `plugins` table |
| `server/src/adapters/store/sqlite/schema/index.ts` | Re-export |
| `server/src/adapters/store/sqlite/bootstrap.ts` | Create table / migrate |
| `server/src/domain/plugin.port.ts` | `PluginRepository` + install record types |
| `server/src/adapters/store/sqlite/repos/sqlite-plugins.adapter.ts` | Repo impl |
| `server/src/adapters/plugin-git.adapter.ts` | clone / fetch / checkout / remove |
| `server/src/application/plugins/*.use-case.ts` | install, update, remove, trust, enable, list |
| `server/src/adapters/http/plugins/plugins.body.ts` | Zod bodies |
| `server/src/adapters/http/plugins/plugins.controller.ts` | Routes |
| `server/src/composition/wire-controllers.ts` | Wire use cases + controller |
| `server/src/adapters/workspace-harnesys.registry.ts` | Merge plugin skills/MCP on create |
| `server/src/adapters/studio-run-targets.adapter.ts` | Attach SessionStart `notes` |

### Studio client / shared

| Path | Responsibility |
| --- | --- |
| `shared/src/plugin.ts` (or extend existing shared) | DTO types for API |
| `client/src/shared/config/settings-nav.ts` | Add `plugins` category |
| `client/src/shared/config/routes.ts` | Parse category if needed |
| `client/src/pages/settings/ui/settings-page.tsx` | Switch case |
| `client/src/pages/settings/ui/plugins-pane.tsx` | List / install / trust / enable |
| `client/src/features/manage-plugins/` | Dialogs (install form) + `index.ts` |
| `client/src/shared/api/plugins.ts` | Query/mutation helpers |
| `client/src/widgets/settings-nav/ui/settings-nav.tsx` | Icon for plugins |

---

### Task 1: Plugin domain types + AP manifest parse

**Files:**
- Create: `packages/harnesys/src/domain/plugin.ts`
- Create: `packages/harnesys/src/application/plugins/plugin-name.ts`
- Create: `packages/harnesys/src/application/plugins/parse-plugin-manifest.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - Types in `domain/plugin.ts`: `PluginManifest`, `PluginSkillRef`, `PluginMcpServer`, `PluginHookEvent`, `PluginHookCommand`, `PluginAgentRef`, `PluginCommandRef`, `PluginLoadDiagnostic`, `Plugin`
  - `assertPluginName(name: string): void` (throws on invalid)
  - `parsePluginManifestJson(raw: unknown): PluginManifest` (fatal on schema violations per AP §5; unknown top-level fields → collected separately)

- [ ] **Step 1: Add `domain/plugin.ts`**

Define types exactly as in the spec § Data model (including `schemaVersion: '1.0.0'`, `sourceFormat: 'agent-plugins' | 'claude-compat'`, prefixed skill `id`, namespaced MCP `serverId`).

Add:

```ts
export type PluginLoadDiagnostic = {
  level: 'error' | 'warning';
  code: string;
  message: string;
  path?: string;
};
```

- [ ] **Step 2: Implement name + manifest parse**

`plugin-name.ts`: pattern `^(?!.*(?:--|\.\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$`, length 1–64.

`parse-plugin-manifest.ts`:
- Require object
- `$schema` must equal `https://agent-plugins.org/schemas/1.0.0/plugin.schema.json` for `agent-plugins` path (Claude compat synthesizes this later)
- Require `name`; validate via `assertPluginName`
- Allowed keys only; unknown keys → return `{ manifest, ignoredFields: string[] }` or throw `PluginManifestError` with `ignored` list for the loader to warn
- Validate `author` shape; `extensions` must be object-of-objects or ignore with warning (AP §8.1)

- [ ] **Step 3: Verify**

```bash
cd packages/harnesys && bun -e "
import { assertPluginName } from './src/application/plugins/plugin-name.ts';
import { parsePluginManifestJson } from './src/application/plugins/parse-plugin-manifest.ts';
assertPluginName('superpowers');
try { assertPluginName('Bad'); throw new Error('should fail'); } catch (e) { if (e instanceof Error && e.message === 'should fail') throw e; }
const m = parsePluginManifestJson({
  \$schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
  name: 'hello-plugin',
  version: '1.0.0',
});
if (m.name !== 'hello-plugin') throw new Error('parse failed');
console.log('ok');
"
bun run typecheck
```

Expected: prints `ok`; typecheck clean.

---

### Task 2: Path safety + skill discovery

**Files:**
- Create: `packages/harnesys/src/application/plugins/plugin-path-safety.ts`
- Create: `packages/harnesys/src/application/plugins/discover-plugin-skills.ts`
- Modify: reuse `parseSkillFile` from `src/application/skills/parse-skill-file.ts`

**Interfaces:**
- Consumes: `parseSkillFile`, `PluginSkillRef`, `PluginLoadDiagnostic`
- Produces:
  - `resolvePluginPath(pluginRoot: string, relativeFromDotSlash: string): string` (throws if escape)
  - `isInsidePluginRoot(pluginRoot: string, absolutePath: string): boolean`
  - `discoverPluginSkills(pluginRoot: string, pluginName: string): { skills: PluginSkillRef[]; diagnostics: PluginLoadDiagnostic[] }`

- [ ] **Step 1: Path safety**

Resolve with `path.resolve`; after resolve, require `resolved === root || resolved.startsWith(root + sep)`. Reject `..` segments that escape. Relative config paths must start with `./` when required by AP.

- [ ] **Step 2: Discover skills**

Only immediate children of `skills/`. For each dir with regular file `SKILL.md`:
- parse with `parseSkillFile`
- push `{ id: `${pluginName}:${doc.name}`, name: doc.name, dir }`
- on parse error: diagnostic warning, skip

If `skills` missing: empty list, no error. If `skills` exists but is not a directory: diagnostic error for component type, empty skills (AP §6.2).

- [ ] **Step 3: Verify**

Create a throwaway dir under `~/.harnesys/_plugin_probe/` (allowed tree), with `skills/greet/SKILL.md`, run `discoverPluginSkills`, assert id `probe:greet`, then delete the probe dir.

```bash
cd packages/harnesys && bun run typecheck
```

---

### Task 3: Plugin MCP parse + var expansion

**Files:**
- Create: `packages/harnesys/src/application/plugins/expand-plugin-vars.ts`
- Create: `packages/harnesys/src/application/plugins/parse-plugin-mcp.ts`

**Interfaces:**
- Consumes: `CursorMcpJson`, `StdioEntry`, `UrlEntry` from `ports/mcp.ts`; path safety
- Produces:
  - `expandPluginVars(value: string, ctx: { pluginRoot: string; pluginData: string }): string`
  - `parsePluginMcpFile(raw: unknown, ctx: { pluginRoot: string; pluginData: string; pluginName: string }): { fragment: CursorMcpJson; diagnostics: PluginLoadDiagnostic[] }`

- [ ] **Step 1: Expansion**

Single-pass replace of exact `${PLUGIN_ROOT}` and `${PLUGIN_DATA}` only (AP §9.2). Apply to stdio `args[]`, `env` values, `cwd`.

- [ ] **Step 2: Parse `mcp.json`**

Require `$schema` `https://agent-plugins.org/schemas/1.0.0/mcp.schema.json` and `mcpServers` object. Map:
- `type: 'stdio'` → `StdioEntry` with resolved `./command`, expanded args/env/cwd; default cwd = pluginRoot when omitted
- `type: 'streamable-http'` → `UrlEntry` with `type: 'http'`
- `type: 'sse'` → `UrlEntry` with `type: 'sse'`
- Namespace keys: `${pluginName}/${key}`
- Skip invalid entries with diagnostics; if whole file invalid, return empty fragment + error diagnostic (do not fail other components)

Reject `env` keys named `PLUGIN_ROOT` or `PLUGIN_DATA`.

- [ ] **Step 3: Verify** with `bun -e` on a sample object; `bun run typecheck`.

---

### Task 4: Claude compat + `loadPlugin`

**Files:**
- Create: `packages/harnesys/src/application/plugins/claude-compat.ts`
- Create: `packages/harnesys/src/application/plugins/load-plugin.ts`
- Create: `packages/harnesys/src/adapters/fs-plugin-loader.ts`
- Create: `packages/harnesys/src/ports/plugins.ts`

**Interfaces:**
- Consumes: Tasks 1–3
- Produces:
  - `detectPluginLayout(rootListing): 'agent-plugins' | 'claude-compat' | 'unknown'`
  - `loadPluginFromDirectory(options: { root: string; pluginData: string }): Promise<{ plugin: Plugin; diagnostics: PluginLoadDiagnostic[] }>`
  - Claude hooks parse from `hooks/hooks.json` → `PluginHookCommand[]` (only allowlisted events kept; others diagnostic warning)

- [ ] **Step 1: Claude compat**

If root has `.claude-plugin/plugin.json` and no valid AP root `plugin.json`:
- Read Claude manifest; synthesize AP manifest (`schemaVersion`, name from Claude `name`, metadata fields)
- Discover `skills/` same as AP
- Parse `hooks/hooks.json`: for `hooks.SessionStart[]`, expand matcher `startup|clear|compact` into allowlisted events; keep `type: 'command'` entries; store `command` string for runner
- Scan `agents/*.md` and `commands/*.md` into inventory refs (frontmatter name/description if present; else file stem)
- `sourceFormat: 'claude-compat'`

If both AP `plugin.json` and Claude files exist: AP owns portable fields; still merge Claude hooks/agents/commands when `com.harnesys.studio` extension dir absent.

- [ ] **Step 2: FS loader**

`fs-plugin-loader.ts` reads files with `node:fs`, calls pure parsers, returns `Plugin`. Reject if layout unknown.

- [ ] **Step 3: Verify against real Superpowers clone (read-only)**

If `~/.grok/installed-plugins/superpowers-*` or a manual clone exists, point loader at it. Else:

```bash
git clone --depth 1 https://github.com/obra/superpowers.git ~/.harnesys/_plugin_probe/superpowers
```

Then `bun -e` load and assert:
- `manifest.name === 'superpowers'`
- some skill id starts with `superpowers:`
- at least one SessionStart hook
- `sourceFormat === 'claude-compat'`

Leave clone for later tasks or remove probe when done.

---

### Task 5: Prefixed skill registry + merge helpers

**Files:**
- Create: `packages/harnesys/src/application/plugins/prefixed-skill-registry.ts`
- Create: `packages/harnesys/src/application/plugins/merge-plugin-runtime.ts`

**Interfaces:**
- Consumes: `SkillRegistry`, `Plugin`, `CursorMcpJson`, `combineSkillRegistries` (optional)
- Produces:
  - `prefixSkillRegistry(registry: SkillRegistry, pluginName: string): SkillRegistry` — `list()` returns names as `pluginName:original`; `load('pluginName:x')` strips prefix and loads `x`; `load('x')` fails unless you also support unprefixed (do **not**; require prefix)
  - `mergePluginMcpFragments(base: CursorMcpJson, fragments: CursorMcpJson[]): CursorMcpJson` — later keys overwrite same serverId
  - `buildPluginSkillRegistries(plugins: Plugin[]): SkillRegistry[]` — one `FsSkillRegistry` per plugin `skills/` root, each wrapped with `prefixSkillRegistry`

Implementation note: build `FsSkillRegistry({ roots: [join(plugin.root, 'skills')] })` then wrap. Do not put plugin skills into unprefixed workspace roots.

- [ ] **Step 1: Implement prefix wrapper + MCP merge**
- [ ] **Step 2: Verify** with in-memory fake `SkillRegistry` in `bun -e`; typecheck.

---

### Task 6: HooksRunner + SessionStart notes

**Files:**
- Create: `packages/harnesys/src/application/plugins/hooks-runner.ts`
- Create: `packages/harnesys/src/application/plugins/session-start-notes.ts`

**Interfaces:**
- Consumes: `PluginHookCommand`, `LlmNote`, `LlmNoteProvider`, `LlmNoteContext`
- Produces:
  - `runPluginHookCommand(opts: { pluginRoot: string; pluginData: string; command: string; timeoutMs: number; envExtra?: Record<string, string> }): Promise<{ ok: true; stdout: string } | { ok: false; error: string }>`
  - `parseSessionStartContext(stdout: string): string | undefined` — accept `hookSpecificOutput.additionalContext` | `additionalContext` | `additional_context`
  - `createPluginSessionStartNotes(options: { plugins: Array<{ plugin: Plugin; trusted: boolean }>; timeoutMs: number }): LlmNoteProvider`

- [ ] **Step 1: Hooks runner**

Use `Bun.spawn` or `node:child_process` with:
- cwd = `pluginRoot`
- env: process env overlay + `PLUGIN_ROOT`, `PLUGIN_DATA`, `CLAUDE_PLUGIN_ROOT=PLUGIN_ROOT` (Superpowers script)
- timeout kill
- capture stdout/stderr
- command: run via `bash -lc` only if the stored command string requires it (Claude hooks are shell strings); document that Claude-compat commands execute with `bash -lc` under trust; AP future hooks should prefer argv arrays when we add them

- [ ] **Step 2: Note provider**

Cache by `runId`: first LLM gather runs hooks for trusted plugins with SessionStart events; emit notes `{ tag: \`plugin-session-start:${name}\`, text }`. Skip untrusted. Failures → no note (caller may log via diagnostics later).

- [ ] **Step 3: Verify** by running Superpowers `hooks/session-start` through runner with `PLUGIN_ROOT` set; assert stdout parses to non-empty context containing `using-superpowers` or `superpowers`.

---

### Task 7: Public exports

**Files:**
- Modify: `packages/harnesys/index.ts`
- Modify: `packages/harnesys/src/adapters/node/index.ts`
- Modify: `packages/harnesys/domain.ts` only if domain barrel is used for these types (match existing skill export pattern)

**Interfaces:**
- Produces public exports Studio will import:
  - Types: `Plugin`, `PluginManifest`, `PluginLoadDiagnostic`, …
  - `loadPluginFromDirectory` from `harnesys/adapters/node`
  - `prefixSkillRegistry`, `mergePluginMcpFragments`, `createPluginSessionStartNotes`, `parseSessionStartContext` from `harnesys`

- [ ] **Step 1: Export**
- [ ] **Step 2:** `bun run --cwd packages/harnesys typecheck` and `bun run --cwd packages/harnesys lint`

---

### Task 8: Studio layout + SQLite plugin store

**Files:**
- Modify: `apps/studio/server/src/config/constants.ts` — add `PLUGINS_DIR = 'plugins'`, `PLUGINS_DATA_DIR = 'plugins-data'`, `PLUGIN_HOOK_TIMEOUT_MS = 10_000`
- Modify: `apps/studio/server/src/adapters/store/studio-layout.ts` — `pluginsPath(home)`, `pluginInstallPath(home, name)`, `pluginDataPath(home, name)`
- Create: `apps/studio/server/src/adapters/store/sqlite/schema/plugins.ts`
- Modify: `schema/index.ts`, `bootstrap.ts`
- Create: `apps/studio/server/src/domain/plugin.port.ts`
- Create: `apps/studio/server/src/adapters/store/sqlite/repos/sqlite-plugins.adapter.ts`
- Wire repo in store composition (`create-store.ts` / wherever repos are constructed)

**Schema:**

```ts
// plugins table
id: text PK  // same as name
name: text not null unique
source: text not null
revision: text not null
path: text not null
dataPath: text not null
trusted: integer boolean not null default false
enabledWorkspaceIds: text not null default '[]'  // JSON string[]
installedAt: text not null
updatedAt: text not null
```

**Interfaces:**
- `PluginRepository`: `list`, `findByName`, `upsert`, `delete`, `setTrusted`, `setWorkspaceEnabled(name, workspaceId, enabled)`

- [ ] **Step 1: Constants + layout helpers**
- [ ] **Step 2: Schema + bootstrap + repo**
- [ ] **Step 3:** `bun run --cwd apps/studio/server typecheck`

---

### Task 9: Git install / update / remove

**Files:**
- Create: `apps/studio/server/src/adapters/plugin-git.adapter.ts`
- Create: `apps/studio/server/src/application/plugins/install-plugin.use-case.ts`
- Create: `apps/studio/server/src/application/plugins/update-plugin.use-case.ts`
- Create: `apps/studio/server/src/application/plugins/remove-plugin.use-case.ts`
- Create: `apps/studio/server/src/application/plugins/list-plugins.use-case.ts`

**Interfaces:**
- `resolveGitSource(source: string): string` — `owner/repo` → `https://github.com/owner/repo.git`
- `clonePlugin({ source, dest }): Promise<{ revision: string }>`
- `updatePluginCheckout({ path, ref? }): Promise<{ revision: string }>`
- Install use case: clone → `loadPluginFromDirectory` → upsert record (`trusted` from request default false) → mkdir data path → return plugin summary + diagnostics
- Update: fetch/checkout → reload → update revision
- Remove: delete row; `rm` install path; optional `deleteData: boolean` for data path

- [ ] **Step 1: Git adapter** using `Bun.spawn(['git', ...])` with clear errors
- [ ] **Step 2: Use cases**
- [ ] **Step 3: Manual install probe** of `obra/superpowers` into `~/.harnesys/plugins/superpowers` via use case or thin script; confirm DB row + load diagnostics

---

### Task 10: Trust, enable, HTTP API

**Files:**
- Create: `apps/studio/server/src/application/plugins/trust-plugin.use-case.ts`
- Create: `apps/studio/server/src/application/plugins/enable-workspace-plugin.use-case.ts`
- Create: `apps/studio/server/src/adapters/http/plugins/plugins.body.ts`
- Create: `apps/studio/server/src/adapters/http/plugins/plugins.controller.ts`
- Modify: `apps/studio/server/src/composition/wire-controllers.ts`
- Add shared DTOs under `apps/studio/shared/` and export from shared package entry

**Routes:**

| Method | Path |
| --- | --- |
| GET | `/api/plugins` |
| POST | `/api/plugins/install` body `{ source: string, trust?: boolean }` |
| POST | `/api/plugins/:name/update` |
| POST | `/api/plugins/:name/trust` body `{ trusted: boolean }` |
| POST | `/api/workspaces/:workspaceId/plugins/:name/enable` body `{ enabled: boolean }` |
| DELETE | `/api/plugins/:name` query/body `{ deleteData?: boolean }` |

After trust/enable/install/update/remove: `workspaceHarnesys.invalidate(workspaceId)` for affected workspaces (all enabled ids, or current workspace).

- [ ] **Step 1: Use cases + controller + wire**
- [ ] **Step 2: curl against running API** (ports 3000 if already up; do not start a second server)

```bash
curl -s localhost:3000/api/plugins | head
```

---

### Task 11: Runtime wiring (skills, MCP, notes)

**Files:**
- Modify: `apps/studio/server/src/adapters/workspace-harnesys.registry.ts`
- Modify: `apps/studio/server/src/adapters/studio-run-targets.adapter.ts`
- Possibly extend `WorkspaceHarnesysRepos` / composition to inject `PluginRepository`

**Wiring rules:**

1. When creating runtime for workspace `W`:
   - `list()` plugins where `enabledWorkspaceIds` includes `W`
   - `loadPluginFromDirectory` each (catch diagnostics)
   - Build prefixed registries; combine with existing `FsSkillRegistry` via nested `combineSkillRegistries` or a small `composeSkillRegistries(regs: SkillRegistry[])` helper (add in library if needed in this task)
   - Merge plugin MCP fragments into workspace `CursorMcpJson` before `createRuntime({ mcp })`
2. In `StudioRunTargets.resolve`:
   - Load enabled plugins for thread workspace
   - `notes: [createPluginSessionStartNotes({ plugins: enabled.map(p => ({ plugin, trusted: record.trusted })), timeoutMs: PLUGIN_HOOK_TIMEOUT_MS })]`
   - Pass `notes` on returned `RunTarget`

- [ ] **Step 1: Compose skills helper if missing**

```ts
export function composeSkillRegistries(regs: SkillRegistry[]): SkillRegistry {
  // list: concat unique by name (later wins)
  // load: try last registry that lists the name
  // reload: reload all
}
```

Put in `packages/harnesys/src/application/skills/compose-skill-registries.ts` and export.

- [ ] **Step 2: Registry + run targets**
- [ ] **Step 3: typecheck studio server; enable Superpowers on a workspace; `GET .../skills` shows `superpowers:*`**

---

### Task 12: Settings UI — Plugins pane

**Files:**
- Modify: `apps/studio/client/src/shared/config/settings-nav.ts` — add `plugins` in `capabilities` after `mcp`
- Modify: settings page switch + nav icon
- Create: `apps/studio/client/src/pages/settings/ui/plugins-pane.tsx`
- Create: `apps/studio/client/src/features/manage-plugins/` (install dialog) with FSD `index.ts`
- Create: `apps/studio/client/src/shared/api/plugins.ts`
- Export API from `shared/api` barrel

**UI behavior:**
- List installed plugins: name, version, sourceFormat, trusted, enabled-for-current-workspace, skill/hook counts, last diagnostics
- Install: input source (`obra/superpowers` or URL), optional trust checkbox
- Actions: Enable/Disable (workspace), Trust/Untrust, Update, Remove
- Detail drawer/section: skill ids, hooks, agents/commands inventory

Follow `skills-pane.tsx` / `mcp-pane.tsx` layout patterns (Header row, Empty state, buttons).

- [ ] **Step 1: API client + nav + pane shell**
- [ ] **Step 2: Install dialog + mutations**
- [ ] **Step 3: agent-browser** — open Settings → Plugins, install or view Superpowers, toggle enable/trust (dev server must already be on 5173/3000)

---

### Task 13: Superpowers acceptance E2E

**Files:** none new (verification only)

- [ ] **Step 1: Ensure plugin installed, trusted, enabled on current workspace**
- [ ] **Step 2: Agent skills picker / `GET /api/workspaces/:id/skills` includes `superpowers:using-superpowers` (and siblings)**
- [ ] **Step 3: Start a new thread run; confirm runtime notes / model context includes SessionStart bootstrap (check run events or logs for note tag `plugin-session-start:superpowers`)**
- [ ] **Step 4: Untrust → new run has skills still (if enabled) but no SessionStart note**
- [ ] **Step 5: Disable on workspace → prefixed skills disappear from catalog for that workspace**
- [ ] **Step 6: `bun run lint` and `bun run typecheck` at repo root — both clean**

Record gaps fixed inline; do not expand scope past the spec.

---

## Self-review (plan vs spec)

| Spec requirement | Task |
| --- | --- |
| AP 1.0 manifest + skills + mcp | 1–3, 4 |
| Claude→AP compat for Superpowers | 4 |
| Prefixed skill ids | 5, 11 |
| MCP merge namespaced | 3, 5, 11 |
| Trust + SessionStart allowlist hooks → LlmNote | 6, 11 |
| Git install + PLUGIN_DATA | 8–9 |
| Workspace enable + agent allowlist reuse | 10–11 (allowlist already empty=all) |
| Settings UI + HTTP | 10, 12 |
| agents/commands inventory | 4, 12 |
| Superpowers E2E | 13 |
| No unit test files | Global Constraints + verify steps |

Open points from spec resolved here:
- Install SoT: **SQLite `plugins` table** in `studio.db`
- Bundled Studio skills: **remain parallel** (not wrapped as plugin in v1)
- Hook timeout: **`PLUGIN_HOOK_TIMEOUT_MS = 10_000`**
