# Инвентарь фич Harnesys

Полный список функциональности монорепозитория для отбора материалов лендинга. Область осмотра: `packages/harnesys`, `apps/server`, `apps/webui`, `packages/studio-shared`, `apps/cli`, `deploy/`, `scripts/`, `landing/`.

Harnesys — веб-студия для AI-агентов, работающих в папках пользователя. Агент получает инструменты (файлы, shell, git, браузер-поиск), автоматизации (cron, вебхуки), память и плагины; пользователь управляет всем из IDE-подобного интерфейса с чатом. Ядро — библиотека `packages/harnesys`, хост — Studio, поставка — три бинарника (`harnesys`, `harnesys-host`, `harnesys-web`).

## Агенты

- Декларативное определение: `defineAgent()` описывает агента как граф узлов (`start`, `end`, `llm:generate`, `tool:call`, `control:assign/spawn/map/yield/goto/interrupt/wait/handoff`, custom) с рёбрами и `when`-условиями (`src/domain/agent-definition.ts`).
- Компиляция и линт: `compile()` строит исполняемый план, `check()` и `validateStructural()` ловят циклы, неизвестные тулы, неразрешимые модели (`src/application/compile.ts`, `check.ts`, `validate.ts`).
- Визуальный редактор графа в Studio: canvas на React Flow + dagre, палитра нод, инспектор нод (`apps/webui/src/features/manage-agent/ui/agent-graph-canvas.tsx`).
- 10 комплектных пресетов агентов: assistant, coder, explorer, general, orchestrator, planner, researcher, reviewer, tester, writer (`apps/server/assets/presets/agents/`).
- Мультиагентность: `agents_spawn` (субагент с песочницей и урезанными правами), `agents_create_subagent` (одноразовый делегат), `agents_handoff` (передача треда другому агенту), роли `explore/coder/verifier/general`.
- `map` — параллельный fan-out до 32 воркеров с шаблоном `$item/$index`.
- Бюджеты: `maxSteps`, `maxTokens`, `deadlineMs`, политика исчерпания `ask|error`; LLM-нотка `<budget>` подсказывает агенту финальный шаг.
- Настройка генерации: temperature, topP, topK, penalties, seed, maxTokens; reasoning effort `none…xhigh`.
- Диалог конфига агента в Studio: 12 категорий (Identity, Model, Compaction, Limits, Graph, Permissions, Capabilities, Skills, MCP, Subagents, Hooks, Modes).

## Чат и треды

- Стрим ответов по SSE (`GET /api/runs/:id/events`), коалесинг дельт, activity rail с режимами Quiet/Full.
- Лента tool-вызовов: сворачиваемые группы, парсинг вывода (diff, shell, JSON, файлы), диалог полного ввода/вывода.
- Ветка тредов: fork-сепараторы и branch-point-бейджи в транскрипте.
- HITL-карточки: ConfirmCard (разрешить тул, превью диффа), AskCard (варианты ответа), BudgetCard (решение о продолжении); ответ через `POST /api/runs/:id/respond`.
- `ask_user` — прямой вопрос агента человеку через interrupt.
- Вложения: multipart-загрузка, paste-as-file, классификация image/audio/video/file, скачивание.
- Markdown c mermaid-диаграммами и KaTeX; тема mermaid следует теме окна.
- Статистика каждого turn: токены in/out, cache hit/miss/write, reasoning-токены, длительность, стоимость в $ (`widgets/chat-transcript/ui/turn-stats.tsx`).
- Композер: TipTap-редактор, инлайн-упоминания сущностей чипами, слэш-команды `/compact` и `/skills`, выбор модели, режима прав и effort, context-ring заполнения окна.
- Компакция контекста: автоматическая по порогу 0.8, ручная (`/compact`, `POST /api/threads/:id/compact`), саммари фиксированным шаблоном, лог каждого саммари в `.harnesys/threads/<id>/compactions/`.
- Треды: список с activeRun, переименование, каскадное удаление (вложения, schedules, webhooks), inbox с unread, удаление отдельного turn, retry и cancel рана.

## Инструменты агента (capability packs)

Единица выдачи возможностей — пак. Список из `src/packs/`:

- `core`: `ask_user`, `map`, `wait` (парковка рана до 7 дней).
- `files`: `read_file`, `write_file`, `edit_file` (unified diff), `list_dir`, `glob`, `grep` (ripgrep); blocklist по умолчанию закрывает `.env`, `.ssh`, ключи, `.git`, `node_modules`.
- `shell`: `shell` с allowlist/blocklist паттернов и таймаутом 30 с – 10 мин, фоновые процессы и PTY, `process_poll`, `process_kill`.
- `fetch`: HTTP GET/POST/PUT/PATCH/DELETE/HEAD, таймаут до 600 с.
- `web_search`: поиск через DuckDuckGo или self-hosted SearXNG, до 20 результатов.
- `lsp`: `lsp_diagnostics`, `lsp_definition`, `lsp_references`, `lsp_hover`.
- `agents`: `agents_list`, `agents_create`, `agents_create_subagent`, `agents_spawn`, `agents_handoff`, `agents_update`, `agents_delete`.
- `plan`: `plan_save`, `plan_item_update`, `plan_get`; план виден агенту через авто-нотку `<active-plan>`, инспектор плана в Studio показывает чек-лист в реальном времени.
- `scheduler`: `schedule_list/set/pause/delete/peek` — агент сам заводит себе cron-задачи.
- `webhook`: `webhook_list/set/delete` — агент сам создаёт входящие эндпоинты.
- `threads`: `thread_list`.
- Память (4 пака): `recall_search` (episodic, поиск по прошлым тредам, fts/vector), `knowledge_search` + `knowledge_read`, `memory_write/list/update/delete` (semantic), `pin_set/list/remove`. Скоуп памяти: workspace + agent + thread.

Отложенная загрузка: `load_tools` подключает нужные тулы по требованию (до 16 за раз), `load_skill` подгружает инструкции скилла с supporting-файлами. Совместимость имён с Claude Code: `Read→read_file`, `Bash→shell`, `WebFetch→fetch` (`src/application/tool-aliases.ts`).

## Провайдеры и модели

- 20 драйверов: openai, openai-compatible, anthropic, openrouter, google, groq, mistral, xai, together, kimi, zai, ollama, ollama-cloud, nvidia, cerebras, minimax, xiaomi, qwen, alibaba, moonshotai (`src/constants.ts:133`).
- Автодискавери моделей: `POST /api/workspaces/:id/providers/:id/discover` тянет `/models` провайдера и нормализует карточки (pricing, модальности, context length, supported parameters).
- Ручное управление моделями: kind chat/embed/image/audio, pricing, поддерживаемые effort-уровни.
- OpenRouter sync в диалоге моделей (`apps/webui/src/features/manage-model/model/openrouter-sync.ts`).
- Экспорт/импорт бандла провайдеров между установками (`GET/POST /api/workspaces/:id/providers/export|import`).
- API-ключи лежат в macOS Keychain (`adapters/secret-store-macos.adapter.ts`); клиент получает только флаг `hasKey`, значение ключа никогда не возвращается.

## Права и безопасность

- Permission-карта по операциям `fs.read`, `fs.write`, `process`, `network`, `mcp`, `agents` с гейтами `allow/ask/deny`; дефолт: чтение разрешено, остальное — с вопросом.
- 5 режимов-пресетов: ask, auto, dont_ask, bypass, plan; редактор режимов и своих пресетов в настройках воркспейса (`apps/server/assets/presets/modes/`).
- Спавн субагента получает пересечение прав родителя (`intersectPermissions`, строжайший гейт побеждает).
- Гранты плагинов трёх классов: content, process, network; approve отдельных MCP-серверов плагина.
- Allowlist-гейтинг MCP: агент видит только серверы из своего `mcpServers`.
- Аутентификация хоста bearer-токеном; веб-шлюз добавляет token-gate с формой логина и HttpOnly-cookie.

## Автоматизации

- Cron-расписания: cron-композер в UI, привязка к агенту и треду, режим прав на прогон, история `none/last/all`, pause/resume, журнал прошлых запусков (`schedule.controller.ts`, `widgets/thread-journal/`).
- Вебхуки: публичный эндпоинт `POST /api/workspaces/:id/hooks/:webhookId` будит привязанный тред; статус active/paused/failed, журнал возбуждений.
- Inbox: треды, ожидающие внимания (чат, расписания, вебхуки), с unread-счётчиком.
- Тикер `fire-due-schedules` запускает просроченные расписания, очередь соблюдает занятость треда.

## Плагины, скиллы, хуки

- Два формата плагинов: плагины Claude Code (`.claude-plugin/plugin.json`) и открытый Agent Plugins 1.0.0 (`packages/harnesys/src/application/plugins/formats/`).
- 15 видов компонентов плагина: skill, command, agent, hook, mcp-server, lsp-server, monitor, path-entry, setting-default, config-option и инертные theme, workflow, channel, output-style, eval; у каждого компонента статус нативности (`PluginIr`, `src/domain/plugin-ir.ts`).
- Маркетплейсы: реестры kind `claude-marketplace`, парсинг `marketplace.json`, установка из git/github/url/npm/archive (с sha256), обновление и удаление, каталог с discover-табом (`plugins.controller.ts`, `plugin-registries.controller.ts`).
- Скиллы: `SKILL.md` с YAML-frontmatter, каталог с фильтром, префиксы `plugin:skill`, создание скиллов из UI.
- Хуки: 37 событий (контракт Claude Code + `PreModelCall`, `PostModelCall`, `NodeStart`, `NodeEnd`), shell-хендлеры со stdin/stdout-контрактом, эффекты block/update/addContext/sessionTitle, матчеры `*`/CSV/RegExp (`src/application/hooks/`).
- Мониторы: long-running процессы плагина, stdout превращается в уведомление, условия `always` и `on-skill-invoke:<skill>`.
- userConfig плагина: подстановка `${user_config.KEY}`, sensitive-значения хранятся в секрет-хранилище и не попадают в контент (`src/application/plugins/user-config.ts`).
- Мониторинг LSP-серверов как компонентов плагина, пресеты по языку (tsserver и др., `application/plugins/lsp-presets.ts`).

## MCP

- Транспорты stdio, streamable-http, sse (`src/domain/mcp.ts`).
- Конфиг в формате `.mcp.json` (Cursor-совместимый), редактирование из UI: enable/disable, restart, reload, правка raw JSON.
- Реестр с префиксами тулов `<serverId>__`, авто-генерация тулов чтения ресурсов, защита от коллизий имён.

## IDE в Studio

- Файловый эксплорер: дерево с git-декором построчно, lazy-загрузка детей, создание/удаление, drag-and-drop перемещение, live-watch по SSE (`workspace-file-routes.ts`, `files-watcher.adapter.ts`).
- Редактор Monaco: markdown с превью, медиа-превью (image/pdf), статус-бар с LSP-диагностикой, свои темы, JSX-теги и переходы по импортам.
- Diff-вью для коммитов и файлов.
- Git: status, init, branches, stage, commit, push, pull, построчный file-status; секция Git в сайдбаре с ветками и счётчиками, диалоги коммита со списком файлов и диффом (`workspace-git-routes.ts`, `git-cli.adapter.ts`).
- Терминал: PTY-сессии через WebSocket (in/out/resize/exit, scrollback), xterm-вью, список сессий в сайдбаре; работает через process-job registry пакета shell.
- Вкладки IDE: drag-and-drop между группами, ресайз панелей, инспектор справа, пустой экран с карточками New agent / New schedule / New webhook / New file.

## Воркспейсы и мульти-хост

- Мульти-воркспейс: список, нативный picker папки, создание, wipe, reveal в Finder; статус kind folder/git, ветка, dirty.
- Мульти-хост: одно окно браузера держит несколько хостов; пейринг по коду (`POST /api/host/pair/start` → `pair/redeem` отдаёт credential), реестр хостов и раскладка desk персистятся на хосте (`window-desk.controller.ts`).
- Роутинг запросов к нужной ноде через NodeSupervisor (`composition/node-supervisor.ts`).
- SQLite-хранилище хоста в `~/.harnesys/studio.db` (drizzle-миграции).

## Память в UI

- Pins: закреплённые правила агента, лимит 32 записи и 1500 токенов, всегда в контексте.
- Semantic: CRUD фактов со скоупом session/long, опциональная автопроекция фактов в окно агента.
- Episodic: поиск по прошлым тредам (`GET .../episodic/search`), авто-индексация при компакции.
- Knowledge: корни документов, выбор embed-модели, индексация с SSE-прогрессом и отменой, гибридный поиск FTS + вектора, smoke-поиск в настройках (`knowledge.controller.ts`, `adapters/memory/knowledge-search.ts`).

## Рантайм и движок (под капотом)

- Event sourcing: 52 типа событий, snapshot с курсорами фаз узлов, interrupt с resumeSchema, `definitionHash` для миграции определений (`src/domain/snapshot.ts`, `events.ts`).
- Lease-владение ранами: TTL 15 с с продлением, `lease_stale` при потере, claimer свипает очередь `queued` каждые 5 с (`run-engine.ts`, `run-claimer.ts`).
- Живой фид событий с дедупом по `(runId, seq)` и закрытием на boundary-событиях (`run-event-feed.ts`).
- Мини-язык выражений для `when`-условий рёбер и аргументов тулов: `$input/$state/$output/$resume/$item/$index`, `exists()`, `length()` (`src/domain/expr.ts`).
- Обрезка вывода тулов head/tail с сохранением полного вывода в `.harnesys/threads/<id>/tool-outputs/` (`clip-tool-output.ts`).
- Capability-set: каждый тул получает провенанс (`pack:`/`plugin:`/`mcp:`/`host`) и explain-запись о причине доступности (`src/application/capability-set.ts`).
- Глобальный SSE desk-поток событий (thread, agent, schedule, webhook, plan, terminal, run-finish).

## Интерфейс и настройки окна

- Темы dark/light/system, 7 акцентов, 4 масштаба UI, кастомные цвета git-статусов (`features/settings`, `shared/lib/appearance.ts`).
- Настройки чата: размер шрифта, поведение скролла (Follow anchor/pin), детализация ленты Quiet/Full, переключатель подробной статистики.
- Панель Hosts: спаренные хосты, статус, revoke.
- UI-кит ~70 компонентов (shadcn/Base UI), overlay-сервис диалогов и confirm, zustand-сторы по доменам, FSD-структура клиента.
- Хоткеи файлов, мультиселект воркспейсов, resizer инспектора, toasts.

## Поставка и деплой

- CLI-супервизор `harnesys`: `up --with-ui --port --web-port --install-systemd`, `down`, `status`, `restart`, `logs -f`, `update`, `host pair`, интерактивное меню; pidfiles и логи в `~/.harnesys/` (`apps/cli/`).
- Веб-шлюз `harnesys-web`: token-gated reverse proxy перед хостом, раздача SPA, прокси `/api` и WebSocket, форма логина (`apps/webui/server/app.ts`).
- Три скомпилированных бинарника через `bun build --compile` (`build:host`, `build:web`, `build:cli` в корневом `package.json`).
- Docker: `deploy/docker-compose.yml` с сервисами host и web, healthchecks, общий том данных; образы `ghcr.io/harnesys/{host,web}`.
- systemd user-юниты из CLI, скрипт установки `scripts/install.sh` (curl-инсталлятор в `~/.local/bin`).
- Обновление самоходом: `harnesys update` качает release-ассеты под os/arch.
- TLS-сценарии в `docs/deploy.md`: Tailscale, Caddy, nginx, с предупреждением о буферизации SSE.

## Служебное (вероятно, не для лендинга)

- `scripts/docs-merge.ts` — сборка `HARNESYS.md` из `docs/`.
- `scripts/vendor-plugin-schemas.ts` — вендоринг JSON-схем plugin/MCP с проставлением `x-vendored-sha256`.
- `scripts/gen-preset-tools.ts` — перегенерация списков тулов пресетов с `--check` для CI.
- GitHub Actions: только деплой лендинга на Pages (`.github/workflows/pages.yml`).
- Экспорт бандлов ноды и профиль окна в настройках — заглушки (`exports-pane.tsx`, `settings-page.tsx`).
- Desktop-приложение: каркас Tauri 2 без функциональности, в лендинге заявлено как coming soon (`apps/desktop/`).
