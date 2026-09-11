# Skills.sh Marketplace

Date: 2026-09-11  
Status: draft for review  
Depends on: [2026-09-11-agent-plugins-design.md](./2026-09-11-agent-plugins-design.md), [2026-09-11-plugin-marketplaces-design.md](./2026-09-11-plugin-marketplaces-design.md)  
References: [skills.sh API docs](https://www.skills.sh/docs/api), [vercel-labs/skills CLI](https://github.com/vercel-labs/skills) (blob install + locks), probes below (2026-09-11)

## Goal

В настройках воркспейса (Settings → Skills) появляется поиск по каталогу skills.sh и установка скилов в workspace или host. Skills.sh каталогизирует отдельные skill-папки (SKILL.md + файлы), манифестов плагинов в нём нет. Точка входа поэтому секция Skills, её существующий плейн расширяется второй вкладкой.

## Verified behavior (probes 2026-09-11)

| Endpoint | Anonymous | Notes |
| --- | --- | --- |
| `GET /api/search?q=&limit=&owner=` | 200 | `{skills:[{id,skillId,name,installs,source}],searchType}`; `id` = `owner/repo/slug` |
| `GET /api/download/{owner}/{repo}/{slug}` | 200 | `{files:[{path,contents}], hash}`; 76 files for `vercel-labs/agent-skills/vercel-react-best-practices` |
| `GET /api/v1/skills`, `/api/v1/skills/search`, curated, detail, audit | 401 | Vercel OIDC only; Studio не может выдать токен: это локальный Bun-сервер, не Vercel |
| любой endpoint при всплеске запросов | 403 WAF | Vercel Security Checkpoint; переходящее состояние, был шторм, затем 200 |

Legacy-контур (`/api/search`, `/api/download`) недокументирован и отмечен `searchVersion:"legacy"`; CLI `npx skills` использует именно его. Риск сноса митигируем цепочкой fallback (секция Fallback).

## Decisions (locked)

| Topic | Choice |
| --- | --- |
| Library vs Studio | Всё в Studio (host): адаптер, use-cases, UI. `packages/harnesys` и `RegistryKind` не трогаем до появления второго хоста |
| API surface | Legacy анонимные `/api/search` + `/api/download`; документированный `/api/v1/*` не используется |
| Discovery v1 | Только поиск по запросу; trending/hot/curated требуют OIDC, вне v1 |
| Install scopes | `workspace` (`<ws>/.harnesys/skills/`) и `host` (`~/.harnesys/skills/`) |
| Update detection | Snapshot hash: SHA-256 по отсортированным `path+contents` (формула `computeSnapshotHash` из CLI), сравним с полем `hash` из API |
| Provenance | Lock-файл `skills-lock.json` в `.harnesys/` (workspace) и `~/.harnesys/` (host); вне skill-директорий |
| Audit badge | Нет: анонимного audit query нет |
| Fallback | install: API download → GitHub trees + raw → git clone; search при недоступности API показывает retry-ошибку |
| Auth | Нет; env overrides `HARNESYS_SKILLSSH_API_URL`, `HARNESYS_SKILLSSH_DOWNLOAD_URL` | 
| UI | SkillsPane получает Tabs (Installed / Marketplace) по образцу `plugins-pane.tsx` |
| Tests | Запрещены; проверка agent-browser + ручные сценарии |

## Architecture

```text
SkillsPane (client) ── /api/skill-market/* ── SkillMarketController (Hono)
                                                  │
                            ┌─────────────────────┴───────────────────┐
                            ▼                                         ▼
              DiscoverMarketplaceSkillsUseCase          InstallMarketplaceSkillUseCase
                            │                                         │
                            ▼                                         ▼
                   SkillsShAdapter (fetch, timeouts,        write snapshot files →
                   env-overridable base URLs)               skills-lock.json entry
                            │                                         │
              403/404/timeout on /api/download ────────────► GitHub fallback
              (trees API → raw.githubusercontent → git clone)
```

Server layout (по образцу существующих slices):

- `server/src/adapters/skillsh/skillsh.adapter.ts` — клиент API: `search(query,{owner,limit})`, `download(owner,repo,slug)`; timeout 10 с, retry ×2 с backoff на 403/429/5xx, in-memory кэш search 30 с и download 5 мин (уважает Cache-Control).
- `server/src/adapters/skillsh/github-fallback.ts` — разрешение `id` в файлы: `GET https://api.github.com/repos/{owner}/{repo}/git/trees/{branch}?recursive=1` → путь `SKILL.md` (по имени папки из `slug`), затем `raw.githubusercontent.com` на каждый файл; в конце git clone в temp.
- `server/src/application/skill-market/` — use-cases: `discover-marketplace-skills.use-case.ts`, `install-marketplace-skill.use-case.ts`, `marketplace-updates.use-case.ts`, `remove-marketplace-skill.use-case.ts` (Request/Response/Input в том же файле, как остальные use-cases).
- `server/src/adapters/http/skill-market/skill-market.controller.ts` + `*.body.ts` (zod), регистрация через `composition/wire-controllers.ts`.

Snapshot hash пересчитывается локально после записи и хранится в lock; он же сравнительная единица при update.

## Storage

Lock-файл `{ "version": 1, "skills": { "<slug>": MarketplaceSkillEntry } }`, записи отсортированы по ключу (минимизация merge-конфликтов, как в CLI local-lock):

```ts
type MarketplaceSkillEntry = {
  id: string;          // "owner/repo/slug" с skills.sh
  name: string;        // из SKILL.md frontmatter
  source: string;      // "owner/repo"
  skillPath: string;   // путь папки скила в репо источника (из GitHub fallback) или "" при blob-пути
  contentHash: string; // локально пересчитанный snapshot hash
  installedAt: string; // ISO timestamp
};
```

- Workspace: `<ws>/.harnesys/skills/<slug>/` + `<ws>/.harnesys/skills-lock.json`
- Host: `~/.harnesys/skills/<slug>/` + `~/.harnesys/skills-lock.json`
- После install/remove/update сервер выполняет существующий reload (`reload-workspace-skills.use-case.ts`, `POST /api/workspaces/:id/skills/reload`).
- Коллизия: целевая папка `slug` существует и её нет в lock → 409 `skill_exists`, установка отклонена. Переименование силами пользователя, авто-перемейна нет.
- Fallback-источник (установлен без skills.sh, репозиторий указан вручную) получает тот же lock-формат; `skillPath` заполняется, `id` = `github:owner/repo/slug`.

## HTTP API (Studio)

| Method | Path | Body / notes |
| --- | --- | --- |
| `GET` | `/api/skill-market/search?q=&owner=&limit=50` | `{ results: [{ id, slug, name, source, installs, url }] }`; `q` min 2 chars, zod в `search.body.ts` |
| `GET` | `/api/skill-market/installed?scope=&workspaceId=` | `{ skills: MarketplaceInstalledSkill[] }` — lock-записи scope для бейджей source и «already installed» в UI |
| `POST` | `/api/skill-market/install` | `{ id: string, scope: "workspace" \| "host", workspaceId?: string }` → `{ skill }`; 409 на collision, 502 с `stage` на отказе обеих веток |
| `POST` | `/api/skill-market/updates` | `{ scope, workspaceId? }` → `{ updates: [{ slug, id, currentHash, latestHash }] }` (скачивает снапшоты, сравнение hash) |
| `POST` | `/api/skill-market/update` | `{ slug, scope, workspaceId? }` → `{ skill }` |
| `POST` | `/api/skill-market/remove` | `{ slug, scope, workspaceId? }` → удаляет папку + lock-запись |

Ошибки адаптера наружу в форме существующего `handleHttpError` (`{ error, message }`), коды: 400 параметры, 404 неизвестный `id`, 409 collision, 502 marketplace unavailable.

## Install pipeline

1. Разобрать `id` на `owner/repo/slug`; скачать снапшот (`/api/download`, иначе GitHub fallback).
2. Провалидировать содержимое: в дереве есть `SKILL.md`; каждый `file.path` относительный, после нормализации внутри целевой папки; slug/name проходят `^[a-z0-9][a-z0-9._-]{0,79}$`.
3. Записать в temp-папку рядом с целью (`<slug>.tmp-<rand>`), пересчитать snapshot hash.
4. Атомарный swap: переименование существующей в `<slug>.old-<rand>` (для update), move temp → `<slug>`, удалить old; ошибка на любом шаге откатывает swap.
5. Обновить lock, вернуть запись; клиент инвалидирует список skills и вызывает reload endpoint.

Метаданные (`name`, `description`) из API перед отображением очищаются от управляющих и escape-последовательностей (аналог `stripTerminalEscapes`/`sanitizeMetadata` из CLI, CWE-150; в UI достаточно вырезания `\x1b...` и C0/C1 за исключением tab/newline).

## UI

Settings → Skills (`pages/settings/ui/skills-pane.tsx`):

1. **Installed** — текущий список pane как есть; marketplace-скилы помечены бейджем `source` (`owner/repo`), рядом кнопка Remove и «Update available» при последнем `updates`-проходе.
2. **Marketplace** — строка поиска (debounce 400 мс), опциональное поле owner, список результатов: name, `source`, installs, кнопка Install со scope-селектором (Workspace / Host). Already installed = slug в lock соответствующего scope.
3. Ошибка поиска (WAF 403 после retry): inline-сообщение «Marketplace temporarily unavailable, retry» с кнопкой, без toast-шума.

Feature-слайс: `features/manage-skill-marketplace/` (`model/`: react-query factories + диалог-состояние, `ui/`: results list + install dialog). API-обёртки: `shared/api/skill-market.ts` (`skillMarketSearchQuery(q,owner)`, `installMarketplaceSkill()`, …). Контракты: `apps/studio/shared/src/skill-market.ts`, экспорт через barrel `types.ts`.

## Fallback

Install: `download` API 403/404/timeout → GitHub trees API (дефолтная ветка из `GET /repos/{owner}/{repo}`) → поиск папки со `SKILL.md`, имя папки = `slug` → `raw.githubusercontent.com` по файлам → не сработало: `git clone --depth 1` в temp, копируем папку. Fallback пишет те же lock-записи, `skillPath` заполнен.

Search без API не воспроизводится (нужен индекс installs/semantic). При недоступности search UI показывает ошибку с retry; ручной путь «установить по owner/repo@slug» уже есть через существующие механизмы скилов.

## Out of scope (v1)

- Plugins-секция (skills.sh не отдаёт манифесты плагинов)
- trending/hot/curated/audit (требуют OIDC либо анонимного query, которого нет)
- Публикация скилов, статистика установок на skills.sh, telemetry (CLI шлёт install-события на `add-skill.vercel.sh`; Studio не шлёт ничего)
- Semver/versioning скилов (каталог оперирует content hash)
- Windows-специфика swap (rename-атомарность одинаковая, проверка на darwin/linux)

## Acceptance (manual, agent-browser)

1. Поиск `react` возвращает `vercel-labs/agent-skills/vercel-react-best-practices` (705K installs на 2026-09-11) с работающим Install.
2. Install в workspace: папка появилась в `<ws>/.harnesys/skills/`, skill виден в Installed после reload, агент подхватывает его под тем же slug, что и локальные скилы.
3. Install в host: виден в Installed двух разных воркспейсов.
4. Повторный install того же slug → 409 и понятное сообщение; install после ручного удаления lock-записи → снова 409 (папка без provenance не перетирается).
5. Fallback: `HARNESYS_SKILLSSH_DOWNLOAD_URL=https://invalid.example` + валидный search → install проходит через GitHub, lock содержит `skillPath`.
6. Update: правка lock (`contentHash` на мусорный) → updates показывает diff, update ставит актуальный снапшот.
