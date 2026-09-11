# Plugin Marketplaces

Date: 2026-09-11  
Status: draft for review  
Depends on: [2026-09-11-agent-plugins-design.md](./2026-09-11-agent-plugins-design.md)  
Catalog references: [Claude plugin marketplaces](https://code.claude.com/docs/en/plugin-marketplaces), [anthropics/claude-plugins-official](https://github.com/anthropics/claude-plugins-official), [Agent Plugins 1.0](https://agent-plugins.org/)

## Goal

Studio показывает Discover из подключённых регистраторов и ставит плагины оттуда. Ручная установка из git остаётся, с явным subdirectory и видимым прогрессом. Agent Plugins 1.0 остаётся форматом пакета; каталоги подключаются через адаптеры регистраторов.

## Decisions (locked)

| Topic | Choice |
| --- | --- |
| Architecture | Normalized Catalog + Registry adapters |
| Default registry | `anthropics/claude-plugins-official` on first Studio use |
| Catalog formats v1 | Claude/ZCode `marketplace.json` via `claude-marketplace` adapter; slot for future `agent-plugins-catalog` |
| Installable sources v1 | relative path (inside marketplace checkout), `github`, `url`, `git-subdir` |
| Unsupported sources | Listed in Discover with `installable: false` (`npm`, `archive`, `command`, …) |
| UI | Settings → Plugins tabs: Installed / Discover / Marketplaces |
| Progress | Install/update/sync keep UI open with stages; no silent dialog dismiss |
| Storage | User-global registries (same home as plugins); SQLite registries + cached catalog entries |
| Library vs Studio | Parse/normalize catalog + resolve install source in `packages/harnesys`; git/SQLite/HTTP/UI in Studio |
| Tests | No `*.test.ts` / playwright; verify with agent-browser and manual E2E |

## Problem (current)

Install dialog accepts only `owner/repo` or a git URL, closes immediately, and runs clone without UI progress. There is no subdirectory field. Marketplace catalogs (`plugin@marketplace`) are unsupported.

## Architecture

```text
Registry source (owner/repo | git URL | marketplace.json URL)
   │
   ▼
Studio RegistryStore (SQLite) + marketplace checkout under ~/.harnesys/
   │
   ▼
harnesys RegistryAdapter[kind]
   └─ claude-marketplace → CatalogEntry[]
   └─ (later) agent-plugins-catalog → CatalogEntry[]
   │
   ▼
Normalized Catalog (Discover)
   │
   ├─ installable → InstallPlugin (git / sparse subdir) → existing Plugin load
   └─ !installable → show reason, Install disabled
```

### Normalized types (library)

`RegistryKind`: `"claude-marketplace"` now; extend later without changing Discover UI.

`CatalogEntry`:

| Field | Meaning |
| --- | --- |
| `registryId` | Studio id of the connected registry |
| `pluginName` | kebab-case id from catalog |
| `displayName?` | UI label |
| `description?` | card text |
| `category?` / `tags?` | filters |
| `version?` | catalog version string |
| `installable` | boolean |
| `unsupportedReason?` | when `installable` is false |
| `installSource` | discriminated union below |

`InstallSource` (v1):

- `{ type: "relative"; path: string }` — path inside the marketplace checkout root
- `{ type: "github"; repo: string; ref?: string; sha?: string }`
- `{ type: "url"; url: string; ref?: string; sha?: string }`
- `{ type: "git-subdir"; url: string; path: string; ref?: string; sha?: string }`

Manual install uses the same install pipeline with `{ source, path?, ref?, trust? }`.

### Claude marketplace adapter

Input locations (first hit wins per checkout):

1. `.claude-plugin/marketplace.json`
2. `marketplace.json` at repo root (ZCode-style)

Map entry `source`:

| Catalog form | → `InstallSource` |
| --- | --- |
| `"./plugins/foo"` or bare name under `metadata.pluginRoot` / `pluginRoot` | `relative` |
| `{ source: "github", repo, ref?, sha? }` | `github` |
| `{ source: "url", url, ref?, sha? }` | `url` |
| `{ source: "git-subdir", url, path, ref?, sha? }` | `git-subdir` |
| `{ source: "git", url, path?, … }` (ZCode) | `url` or `git-subdir` when `path` set |
| `npm` / `archive` / `command` / unknown | `installable: false` |

Relative paths resolve against the marketplace root (directory that contains `.claude-plugin/` or the root that holds `marketplace.json`), not against `.claude-plugin/` itself. Reference: Claude docs “Relative paths”.

### Agent Plugins catalog

Agent Plugins 1.0 defines the package (`plugin.json`, `skills/`, `mcp.json`), not a marketplace wire format. v1 ships the adapter interface and leaves `agent-plugins-catalog` unimplemented until a stable catalog URL/schema exists. Installed AP packages continue to load through the existing runtime.

## Studio storage and layout

Under `~/.harnesys/` (exact path helpers next to existing plugin layout):

- `marketplaces/<registryId>/` — git checkout or downloaded `marketplace.json`
- SQLite table `plugin_registries`: id, name, kind, source, revision/etag, lastSyncAt, lastError?, createdAt, updatedAt
- SQLite table `plugin_catalog_entries`: registryId, pluginName, payload JSON (normalized `CatalogEntry`), updatedAt

Default seed: one row for Claude Official, source `anthropics/claude-plugins-official`, kind `claude-marketplace`. Seed runs once when the registries table is empty.

Installed plugin records gain optional provenance: `registryId?`, `catalogPluginName?`. Direct git installs leave them unset.

## HTTP API (Studio)

| Method | Path | Body / notes |
| --- | --- | --- |
| `GET` | `/api/plugin-registries` | list registries + sync status |
| `POST` | `/api/plugin-registries` | `{ source, kind? }` — default kind `claude-marketplace`; resolve `owner/repo` like plugins |
| `POST` | `/api/plugin-registries/:id/refresh` | pull/fetch catalog, rewrite cache |
| `DELETE` | `/api/plugin-registries/:id` | remove registry + checkout + cache; does not remove installed plugins |
| `GET` | `/api/plugin-catalog?q=&registryId=` | cached Discover entries |
| `POST` | `/api/plugins/install` | extend: `{ source, path?, ref?, trust?, registryId?, catalogPluginName? }` **or** `{ registryId, pluginName, trust? }` |

Install stages returned to the client (JSON progress or long-lived response the UI can poll; pick one concrete mechanism in the plan): `resolving` → `cloning` → `loading` → `saving` → `done` | `error`.

## Git install with subdirectory

For `git-subdir` and manual `path`:

1. Clone into a temp or final dir with sparse checkout limited to `path` when git supports it; fallback: full clone then use `path` as plugin root for `loadPluginFromDirectory`.
2. Plugin root for load = checkout/`path`.
3. Install directory name = plugin manifest `name` (same rename rule as today).

`ref` / `sha`: checkout after clone when provided (`sha` wins when both set), matching Claude pin rules for git sources.

## UI

Settings → Plugins:

1. **Installed** — current list; pending install/update shows a row-level or banner progress state.
2. **Discover** — search; cards from all registries (badge = registry name); Install / Already installed / Unsupported.
3. **Marketplaces** — Add (placeholder examples: `anthropics/claude-plugins-official`, git URL, `https://…/marketplace.json`); Refresh; Remove.

Manual Install (from Installed or shared action): fields `Source`, optional `Subdirectory`, optional `Ref`, `Trust on install`. Description text lists accepted formats with one example each.

Install dialog stays open through stages. On success: close + toast with plugin name. On error: message in dialog, dialog stays open.

## Out of scope (v1)

- npm / archive / command install sources (display only)
- Implementing a concrete Agent Plugins catalog adapter without a published schema URL
- Auto-enable on install (workspace enable stays explicit)
- Publishing / authoring marketplaces inside Studio
- Per-workspace registries (registries are user-global)

## Acceptance

1. Fresh Studio seeds Claude Official; Discover lists entries after refresh.
2. Install `security-guidance` (or another relative-path plugin) from Claude Official completes with visible stages and appears under Installed.
3. Add a second registry by `owner/repo` that has `marketplace.json`; its plugins show in Discover with the registry badge.
4. Manual install `obra/superpowers` still works; manual install with subdirectory installs from that path.
5. A catalog entry with `npm`/`archive` source shows as unsupported; Install is disabled.
6. Closing the network panel is unnecessary: progress is visible in the UI.
)
