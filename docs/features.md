# Harnesys Features Inventory

Complete list of monorepo functionality for selecting landing page materials. Scope: `packages/harnesys`, `apps/server`, `apps/webui`, `packages/studio-shared`, `apps/cli`, `deploy/`, `scripts/`, `landing/`.

Harnesys is a web studio for AI agents working in user folders. The agent receives tools (files, shell, git, browser search), automations (cron, webhooks), memory and plugins; the user manages everything from an IDE-like interface with chat. Core is the library `packages/harnesys`, host is Studio, delivery is three binaries (`harnesys`, `harnesys-host`, `harnesys-web`).

## Agents

- Declarative definition: `defineAgent()` describes an agent as a node graph (`start`, `end`, `llm:generate`, `tool:call`, `control:assign/spawn/map/yield/goto/interrupt/wait/handoff`, custom) with edges and `when` conditions (`src/domain/agent-definition.ts`).
- Compilation and lint: `compile()` builds an executable plan, `check()` and `validateStructural()` catch cycles, unknown tools, unresolved models (`src/application/compile.ts`, `check.ts`, `validate.ts`).
- Visual graph editor in Studio: canvas on React Flow + dagre, node palette, node inspector (`apps/webui/src/features/manage-agent/ui/agent-graph-canvas.tsx`).
- 10 complete agent presets: assistant, coder, explorer, general, orchestrator, planner, researcher, reviewer, tester, writer (`apps/server/assets/presets/agents/`).
- Multi-agent: `agents_spawn` (subagent with sandbox and reduced permissions), `agents_create_subagent` (one-time delegate), `agents_handoff` (transfer thread to another agent), roles `explore/coder/verifier/general`.
- `map` — parallel fan-out to 32 workers with template `$item/$index`.
- Budgets: `maxSteps`, `maxTokens`, `deadlineMs`, exhaustion policy `ask|error`; LLM note `<budget>` hints agent final step.
- Generation settings: temperature, topP, topK, penalties, seed, maxTokens; reasoning effort `none…xhigh`.
- Agent config dialog in Studio: 12 categories (Identity, Model, Compaction, Limits, Graph, Permissions, Capabilities, Skills, MCP, Subagents, Hooks, Modes).

## Chat and Threads

- Response streaming via SSE (`GET /api/runs/:id/events`), delta coalescing, activity rail with Quiet/Full modes.
- Tool call feed: collapsible groups, output parsing (diff, shell, JSON, files), full input/output dialog.
- Thread branching: fork separators and branch-point badges in transcript.
- HITL cards: ConfirmCard (allow tool, diff preview), AskCard (answer options), BudgetCard (decision to continue); response via `POST /api/runs/:id/respond`.
- `ask_user` — direct question from agent to human via interrupt.
- Attachments: multipart upload, paste-as-file, classification image/audio/video/file, download.
- Markdown with mermaid diagrams and KaTeX; mermaid theme follows window theme.
- Statistics per turn: tokens in/out, cache hit/miss/write, reasoning tokens, duration, cost in $ (`widgets/chat-transcript/ui/turn-stats.tsx`).
- Composer: TipTap editor, inline entity mentions as chips, slash commands `/compact` and `/skills`, model selection, permission mode and effort, context-ring window fill.
- Context compaction: automatic at threshold 0.8, manual (`/compact`, `POST /api/threads/:id/compact`), summary with fixed template, log each summary in `.harnesys/threads/<id>/compactions/`.
- Threads: list with activeRun, renaming, cascade delete (attachments, schedules, webhooks), inbox with unread, delete individual turn, retry and cancel run.

## Agent Tools (capability packs)

Unit of capability issuance is a pack. List from `src/packs/`:

- `core`: `ask_user`, `map`, `wait` (run parking up to 7 days).
- `files`: `read_file`, `write_file`, `edit_file` (unified diff), `list_dir`, `glob`, `grep` (ripgrep); default blocklist closes `.env`, `.ssh`, keys, `.git`, `node_modules`.
- `shell`: `shell` with allowlist/blocklist patterns and timeout 30 s – 10 min, background processes and PTY, `process_poll`, `process_kill`.
- `fetch`: HTTP GET/POST/PUT/PATCH/DELETE/HEAD, timeout up to 600 s.
- `web_search`: search via DuckDuckGo or self-hosted SearXNG, up to 20 results.
- `lsp`: `lsp_diagnostics`, `lsp_definition`, `lsp_references`, `lsp_hover`.
- `agents`: `agents_list`, `agents_create`, `agents_create_subagent`, `agents_spawn`, `agents_handoff`, `agents_update`, `agents_delete`.
- `plan`: `plan_save`, `plan_item_update`, `plan_get`; plan is visible to agent via auto-note `<active-plan>`, plan inspector in Studio shows checklist in real time.
- `scheduler`: `schedule_list/set/pause/delete/peek` — agent self-creates cron tasks.
- `webhook`: `webhook_list/set/delete` — agent self-creates incoming endpoints.
- `threads`: `thread_list`.
- Memory (4 packs): `recall_search` (episodic, search past threads, fts/vector), `knowledge_search` + `knowledge_read`, `memory_write/list/update/delete` (semantic), `pin_set/list/remove`. Memory scope: workspace + agent + thread.

Lazy loading: `load_tools` connects required tools on demand (up to 16 at a time), `load_skill` loads skill instructions with supporting files. Name compatibility with Claude Code: `Read→read_file`, `Bash→shell`, `WebFetch→fetch` (`src/application/tool-aliases.ts`).

## Providers and Models

- 20 drivers: openai, openai-compatible, anthropic, openrouter, google, groq, mistral, xai, together, kimi, zai, ollama, ollama-cloud, nvidia, cerebras, minimax, xiaomi, qwen, alibaba, moonshotai (`src/constants.ts:133`).
- Model autodiscovery: `POST /api/workspaces/:id/providers/:id/discover` pulls `/models` from provider and normalizes cards (pricing, modalities, context length, supported parameters).
- Manual model management: kind chat/embed/image/audio, pricing, supported effort levels.
- OpenRouter sync in model dialog (`apps/webui/src/features/manage-model/model/openrouter-sync.ts`).
- Export/import provider bundle between installations (`GET/POST /api/workspaces/:id/providers/export|import`).
- API keys stored in macOS Keychain (`adapters/secret-store-macos.adapter.ts`); client receives only flag `hasKey`, key value is never returned.

## Permissions and Security

- Permission map by operations `fs.read`, `fs.write`, `process`, `network`, `mcp`, `agents` with gates `allow/ask/deny`; default: read allowed, rest with question.
- 5 mode presets: ask, auto, dont_ask, bypass, plan; mode editor and custom presets in workspace settings (`apps/server/assets/presets/modes/`).
- Subagent spawn receives intersection of parent permissions (`intersectPermissions`, strictest gate wins).
- Plugin grants of three classes: content, process, network; approve individual MCP servers of plugin.
- Allowlist gating MCP: agent sees only servers from its `mcpServers`.
- Host authentication with bearer token; web gateway adds token-gate with login form and HttpOnly cookie.

## Automations

- Cron schedules: cron composer in UI, binding to agent and thread, permission mode for run, history `none/last/all`, pause/resume, journal of past runs (`schedule.controller.ts`, `widgets/thread-journal/`).
- Webhooks: public endpoint `POST /api/workspaces/:id/hooks/:webhookId` wakes bound thread; status active/paused/failed, journal of triggers.
- Inbox: threads awaiting attention (chat, schedules, webhooks), with unread counter.
- Ticker `fire-due-schedules` triggers overdue schedules, queue respects thread busy.

## Plugins, Skills, Hooks

- Two plugin formats: Claude Code plugins (`.claude-plugin/plugin.json`) and open Agent Plugins 1.0.0 (`packages/harnesys/src/application/plugins/formats/`).
- 15 plugin component types: skill, command, agent, hook, mcp-server, lsp-server, monitor, path-entry, setting-default, config-option and inert theme, workflow, channel, output-style, eval; each component has native status (`PluginIr`, `src/domain/plugin-ir.ts`).
- Marketplaces: registries kind `claude-marketplace`, parsing `marketplace.json`, install from git/github/url/npm/archive (with sha256), update and remove, catalog with discover tab (`plugins.controller.ts`, `plugin-registries.controller.ts`).
- Skills: `SKILL.md` with YAML-frontmatter, catalog with filter, prefixes `plugin:skill`, create skills from UI.
- Hooks: 37 events (Claude Code contract + `PreModelCall`, `PostModelCall`, `NodeStart`, `NodeEnd`), shell handlers with stdin/stdout contract, effects block/update/addContext/sessionTitle, matchers `*`/CSV/RegExp (`src/application/hooks/`).
- Monitors: long-running plugin processes, stdout turned into notification, conditions `always` and `on-skill-invoke:<skill>`.
- Plugin userConfig: substitution `${user_config.KEY}`, sensitive values stored in secret store and not included in content (`src/application/plugins/user-config.ts`).
- LSP server monitoring as plugin components, language presets (tsserver etc., `application/plugins/lsp-presets.ts`).

## MCP

- Transports stdio, streamable-http, sse (`src/domain/mcp.ts`).
- Config in `.mcp.json` format (Cursor compatible), editing from UI: enable/disable, restart, reload, raw JSON edit.
- Registry with tool prefixes `<serverId>__`, auto-generation of resource reading tools, protection against name collisions.

## IDE in Studio

- File explorer: tree with git decoration per line, lazy load children, create/delete, drag-and-drop move, live-watch via SSE (`workspace-file-routes.ts`, `files-watcher.adapter.ts`).
- Monaco editor: markdown with preview, media preview (image/pdf), status bar with LSP diagnostics, custom themes, JSX tags and import navigation.
- Diff view for commits and files.
- Git: status, init, branches, stage, commit, push, pull, per-line file-status; Git section in sidebar with branches and counters, commit dialogs with file list and diff (`workspace-git-routes.ts`, `git-cli.adapter.ts`).
- Terminal: PTY sessions via WebSocket (in/out/resize/exit, scrollback), xterm view, session list in sidebar; works via process-job registry of shell package.
- IDE tabs: drag-and-drop between groups, panel resize, inspector on right, empty screen with cards New agent / New schedule / New webhook / New file.

## Workspaces and Multi-Host

- Multi-workspace: list, native folder picker, create, wipe, reveal in Finder; status kind folder/git, branch, dirty.
- Multi-host: one browser window holds multiple hosts; pairing by code (`POST /api/host/pair/start` → `pair/redeem` returns credential), host registry and desk layout persist on host (`window-desk.controller.ts`).
- Request routing to correct node via NodeSupervisor (`composition/node-supervisor.ts`).
- Host SQLite storage in `~/.harnesys/studio.db` (drizzle migrations).

## Memory in UI

- Pins: pinned agent rules, limit 32 entries and 1500 tokens, always in context.
- Semantic: CRUD facts with scope session/long, optional auto-projection of facts into agent window.
- Episodic: search past threads (`GET .../episodic/search`), auto-indexing on compaction.
- Knowledge: document roots, embed model selection, indexing with SSE progress and cancel, hybrid FTS + vector search, smoke search in settings (`knowledge.controller.ts`, `adapters/memory/knowledge-search.ts`).

## Runtime and Engine (under the hood)

- Event sourcing: 52 event types, snapshot with node phase cursors, interrupt with resumeSchema, `definitionHash` for definition migration (`src/domain/snapshot.ts`, `events.ts`).
- Lease ownership of runs: TTL 15 s with renewal, `lease_stale` on loss, claimer sweeps `queued` queue every 5 s (`run-engine.ts`, `run-claimer.ts`).
- Live event feed with dedup by `(runId, seq)` and closure on boundary events (`run-event-feed.ts`).
- Mini expression language for `when` conditions of edges and tool arguments: `$input/$state/$output/$resume/$item/$index`, `exists()`, `length()` (`src/domain/expr.ts`).
- Tool output clipping head/tail with full output saved in `.harnesys/threads/<id>/tool-outputs/` (`clip-tool-output.ts`).
- Capability-set: each tool receives provenance (`pack:`/`plugin:`/`mcp:`/`host`) and explain entry about availability reason (`src/application/capability-set.ts`).
- Global SSE desk event stream (thread, agent, schedule, webhook, plan, terminal, run-finish).

## Interface and Window Settings

- Themes dark/light/system, 7 accents, 4 UI scales, custom git status colors (`features/settings`, `shared/lib/appearance.ts`).
- Chat settings: font size, scroll behavior (Follow anchor/pin), feed detail Quiet/Full, toggle detailed statistics.
- Hosts panel: paired hosts, status, revoke.
- UI kit ~70 components (shadcn/Base UI), overlay service for dialogs and confirm, zustand stores per domain, FSD client structure.
- File hotkeys, multi-select workspaces, inspector resizer, toasts.

## Delivery and Deploy

- CLI supervisor `harnesys`: `up --with-ui --port --web-port --install-systemd`, `down`, `status`, `restart`, `logs -f`, `update`, `host pair`, interactive menu; pidfiles and logs in `~/.harnesys/` (`apps/cli/`).
- Web gateway `harnesys-web`: token-gated reverse proxy before host, SPA serving, proxy `/api` and WebSocket, login form (`apps/webui/server/app.ts`).
- Three compiled binaries via `bun build --compile` (`build:host`, `build:web`, `build:cli` in root `package.json`).
- Docker: `deploy/docker-compose.yml` with host and web services, healthchecks, shared data volume; images `ghcr.io/harnesys/{host,web}`.
- systemd user units from CLI, install script `scripts/install.sh` (curl installer to `~/.local/bin`).
- Self-update: `harnesys update` downloads release assets for os/arch.
- TLS scenarios in `docs/deploy.md`: Tailscale, Caddy, nginx, with warning about SSE buffering.

## Internal (probably not for landing)

- `scripts/docs-merge.ts` — build `HARNESYS.md` from `docs/`.
- `scripts/vendor-plugin-schemas.ts` — vendoring JSON schemas plugin/MCP with `x-vendored-sha256`.
- `scripts/gen-preset-tools.ts` — regenerate preset tool lists with `--check` for CI.
- GitHub Actions: only landing deploy to Pages (`.github/workflows/pages.yml`).
- Node bundle export and window profile in settings — stubs (`exports-pane.tsx`, `settings-page.tsx`).
- Desktop app: Tauri 2 skeleton without functionality, claimed as coming soon in landing (`apps/desktop/`).
