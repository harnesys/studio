# Agent Plugins Runtime

Date: 2026-09-11  
Status: draft for review  
Spec target: [Agent Plugins 1.0.0](https://agent-plugins.org/)  
Acceptance plugin: [obra/superpowers](https://github.com/obra/superpowers)

## Goal

Harnesys loads Agent Plugins 1.0.0 packages. Studio installs them from git, enables them per workspace, and filters them per agent. Superpowers installed from GitHub works end-to-end: skills catalog, SessionStart bootstrap (`using-superpowers`), trusted hooks on an allowlist, and Claude-layout compatibility without a fork.

## Decisions (locked)

| Topic | Choice |
| --- | --- |
| Layers | Library (`packages/harnesys`) owns parse/normalize/runtime ports; Studio owns install, trust, UI, wiring |
| Architecture | Single internal `Plugin` model; adapters for AP 1.0 and Claude layout |
| Install | Git URL / GitHub repo |
| Enable | Workspace enable + agent skill allowlist |
| Hooks | Trust-on-install + event allowlist; run command hooks with `PLUGIN_ROOT` |
| Superpowers format | Claude→AP compat loader (no upstream fork required for v1) |
| Skill ids | `pluginName:skillName` (example: `superpowers:brainstorming`) |
| Extension namespace | `com.harnesys.studio` |
| Tests | No `*.test.ts` / playwright (repo ban); verify with agent-browser and manual E2E |

## Current baseline

Studio already has:

- `FsSkillRegistry` over workspace / user / bundled skill roots (`apps/studio/server/src/adapters/workspace-harnesys.registry.ts`)
- Workspace MCP JSON and agent `mcpServers` allowlist
- Packs as code-defined capabilities (`packages/harnesys/src/domain/pack.ts`)
- Runtime notes via `LlmNoteProvider` (`packages/harnesys/src/application/llm-notes.ts`)

There is no plugin package loader, no git install, no hooks runner, no `plugin.json` handling.

Superpowers today ships Claude/Codex/Cursor manifests (`.claude-plugin/plugin.json`, …), root `skills/`, and root `hooks/` with `SessionStart` → `hooks/session-start`. It does not ship a root Agent Plugins `plugin.json`.

## Architecture

```text
Git source
   │
   ▼
Studio PluginInstall (clone/update, trust, PLUGIN_DATA)
   │
   ▼
harnesys PluginLoader
   ├─ AgentPluginsAdapter  (plugin.json + skills/ + mcp.json)
   └─ ClaudeCompatAdapter  (.claude-plugin/plugin.json + skills/ + hooks/)
   │
   ▼
Plugin (normalized)
   │
   ├─ SkillRegistry merge (prefixed ids)
   ├─ MCP merge (plugin servers → runtime mcp)
   └─ HooksRunner (allowlisted events, trust required)
         │
         ▼
   SessionStart → additionalContext → LlmNote
```

### Library (`packages/harnesys`)

Owns:

1. Manifest parse and validation for Agent Plugins 1.0.0 (`$schema` const, closed fields, name pattern).
2. Discovery of `skills/` (immediate child dirs with `SKILL.md`) and `mcp.json` per AP §6–§7.
3. Claude-layout detection and normalize into the same `Plugin` type.
4. Path containment inside plugin root (AP §4.1).
5. `${PLUGIN_ROOT}` / `${PLUGIN_DATA}` expansion for MCP stdio fields (AP §9).
6. Ports: load plugin from directory; list skills; list MCP entries; run allowlisted hook events; map SessionStart output to notes.
7. Merge helper that turns enabled plugins into skill roots / MCP fragments for `createRuntime`.

Does not own git, SQLite install records, HTTP, or UI.

### Studio (`apps/studio`)

Owns:

1. Clone/update/remove under `~/.harnesys/plugins/<name>/`.
2. Per-plugin `PLUGIN_DATA` under `~/.harnesys/plugins-data/<name>/`.
3. Persist install metadata (source URL, revision, trust, enabled workspace ids).
4. Workspace enable flag and agent allowlist wiring (reuse agent `skills: string[]`; empty = all workspace skills, including prefixed plugin skills).
5. HTTP API and Settings → Plugins UI.
6. Wire enabled trusted plugins into `WorkspaceHarnesysRegistry` before `createRuntime`.

## Data model

### Normalized `Plugin` (library)

```ts
type PluginName = string; // AP name constraints

type PluginManifest = {
  schemaVersion: '1.0.0';
  name: PluginName;
  version?: string;
  description?: string;
  author?: { name?: string; email?: string; url?: string };
  homepage?: string;
  repository?: string;
  license?: string;
  keywords?: string[];
  extensions: Record<string, Record<string, unknown>>;
};

type PluginSkillRef = {
  id: string; // `${pluginName}:${skillName}`
  name: string;
  dir: string; // absolute path to skill directory
};

type PluginMcpServer = {
  serverId: string; // namespaced: `${pluginName}/${key}`
  // mapped into existing MCP config shape used by createRuntime
};

type PluginHookEvent =
  | 'SessionStart'
  | 'SessionStart:startup'
  | 'SessionStart:clear'
  | 'SessionStart:compact';

type PluginHookCommand = {
  event: PluginHookEvent;
  command: string;
  async: boolean;
};

type PluginAgentRef = {
  id: string; // `${pluginName}/${fileStem}`
  path: string; // absolute path to agents/*.md
  name: string;
  description?: string;
};

type PluginCommandRef = {
  id: string; // `${pluginName}/${fileStem}`
  path: string; // absolute path to commands/*.md
  name: string;
  description?: string;
};

type Plugin = {
  root: string;
  sourceFormat: 'agent-plugins' | 'claude-compat';
  manifest: PluginManifest;
  skills: PluginSkillRef[];
  mcpServers: PluginMcpServer[];
  hooks: PluginHookCommand[];
  agents: PluginAgentRef[];
  commands: PluginCommandRef[];
};
```

v1 loads `agents/*.md` and `commands/*.md` into inventory. Studio shows them read-only in the plugin detail panel. Binding into agent presets or slash commands is in-scope only when an existing Studio surface already accepts the same artifact shape; otherwise inventory-only until a follow-up.

### Install record (Studio)

```ts
type PluginInstallRecord = {
  name: PluginName;
  source: string; // git URL or github shorthand `owner/repo`
  revision: string; // resolved commit sha
  path: string; // ~/.harnesys/plugins/<name>
  dataPath: string; // ~/.harnesys/plugins-data/<name>
  trusted: boolean;
  enabledWorkspaceIds: string[];
  installedAt: string;
  updatedAt: string;
};
```

### Claude → AP normalize rules

| Claude layout | Normalized |
| --- | --- |
| `.claude-plugin/plugin.json` | `manifest` (synthesize `$schema` 1.0.0; keep name/version/description/author/…; drop unknown top-level into ignore/report) |
| `skills/<name>/SKILL.md` | `skills[]` with id `name:skill` |
| `hooks/hooks.json` SessionStart commands | `hooks[]` with allowlisted events |
| `mcp.json` if present at root | AP MCP path |
| `agents/`, `commands/` | `agents[]` / `commands[]` via `com.harnesys.studio` mapping |
| Missing root AP `plugin.json` | Valid for `claude-compat` sourceFormat only |

If both root AP `plugin.json` and `.claude-plugin/plugin.json` exist, AP wins for portable fields; Claude hooks/agents/commands still merge from Claude paths when AP extension dir is absent.

## Runtime flow

1. User installs `https://github.com/obra/superpowers` (or `obra/superpowers`) in Settings → Plugins.
2. Studio clones into `~/.harnesys/plugins/superpowers`, creates `plugins-data/superpowers`, asks for trust.
3. Loader detects Claude layout, builds `Plugin` with skills `superpowers:*` and SessionStart hook.
4. User enables plugin on the current workspace.
5. `WorkspaceHarnesysRegistry` includes plugin skill root(s) and registers hooks for that workspace runtime.
6. On run/session start, if trusted and enabled, HooksRunner executes SessionStart command with env `PLUGIN_ROOT`, `PLUGIN_DATA`, timeout, cwd = plugin root.
7. Stdout JSON fields accepted (first match): `hookSpecificOutput.additionalContext`, `additionalContext`, `additional_context`.
8. Text becomes an `LlmNote` with a stable tag (example: `plugin-session-start:superpowers`).
9. Agent `skills` allowlist filters `superpowers:…` like any other skill id.

### Failure boundaries

| Failure | Behavior |
| --- | --- |
| Invalid AP `plugin.json` (fatal fields) | Reject plugin; no components load |
| Unknown top-level manifest fields | Report and ignore (AP §5.2) |
| Invalid skill file | Skip skill; continue |
| Invalid MCP entry / unsupported transport | Skip entry; continue |
| Hook non-zero exit / timeout / bad JSON | Skip note injection; run continues; report |
| Untrusted plugin | If workspace-enabled: skills and MCP still load; hooks never run until `trusted: true` |
| Path escapes plugin root | Deny that path / reject component per AP §4.1 |

## Hooks security

Allowlist for v1 command hooks:

- `SessionStart` / `SessionStart:startup`
- `SessionStart:clear`
- `SessionStart:compact`

Rules:

- `trusted !== true` → hooks skipped
- cwd = `PLUGIN_ROOT`
- env must include `PLUGIN_ROOT` and `PLUGIN_DATA`; may set Claude-compat `CLAUDE_PLUGIN_ROOT=$PLUGIN_ROOT` so Superpowers `session-start` script works unchanged
- hard timeout (Studio constant, suggested 10s)
- no shell string evaluation beyond executing the configured command token list after placeholder expansion
- only allowlisted events registered

## Studio API / UI

HTTP (workspace-scoped where noted):

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/plugins` | Installed plugins + load diagnostics |
| POST | `/plugins/install` | `{ source, trust?: boolean }` |
| POST | `/plugins/:name/update` | Fetch/checkout latest or requested ref |
| POST | `/plugins/:name/trust` | `{ trusted: boolean }` |
| POST | `/workspaces/:id/plugins/:name/enable` | `{ enabled: boolean }` |
| DELETE | `/plugins/:name` | Uninstall; optional delete `PLUGIN_DATA` |

UI: Settings → Plugins.

- Install form (git URL / `owner/repo`)
- List: name, version, sourceFormat, trust, enabled-for-this-workspace, skill count, hook count
- Actions: enable, trust, update, remove
- Detail: skill ids, MCP servers, hooks, agents/commands inventory, last error

Agent editor: skill picker shows prefixed plugin skills when the plugin is workspace-enabled.

## Superpowers acceptance

Manual E2E (agent-browser + run):

1. Install `obra/superpowers` from git.
2. Mark trusted; enable on a workspace.
3. Agent with empty skill allowlist sees `superpowers:*` in skill catalog / `load_skill`.
4. New chat/run receives SessionStart note containing `using-superpowers` body (or equivalent bootstrap text from hook stdout).
5. Update plugin; skills reload; `PLUGIN_DATA` preserved.
6. Disable trust: skills remain (if still enabled), SessionStart note absent.
7. Disable on workspace: prefixed skills gone from that workspace runtime.

## Out of scope (v1)

- Marketplace browse/search UI
- Non-git installers (npm tarball, zip URL) as primary path
- Executing hook events outside the SessionStart allowlist
- Implementing foreign extension namespaces (`com.anthropic…`) beyond Claude-compat mapping
- Changing Pack API to express plugins
- Publishing Harnesys as an Agent Plugins client conformance badge (track checklist; no claim until verified)
- Automated unit/e2e test files

## Implementation order

1. Library: AP manifest + skill discovery + path rules + `Plugin` type
2. Library: Claude compat adapter (enough for Superpowers)
3. Library: HooksRunner + SessionStart → note mapping
4. Library: MCP from `mcp.json` merge helpers
5. Studio: install store + git clone/update + trust/enable
6. Studio: wire into `WorkspaceHarnesysRegistry` + skill id prefixing
7. Studio: HTTP + Settings UI
8. Manual Superpowers E2E; fix gaps (agents/commands inventory if files appear)

## Open points for plan phase

- Exact SQLite vs JSON file for `PluginInstallRecord` (follow nearest Studio settings store).
- Whether bundled Studio skills under `apps/studio/assets/skills` stay parallel forever or later wrap as an internal plugin.
- Timeout/value constants and whether hook stdout size is capped before note assembly.

These do not block the design; resolve in the implementation plan.
