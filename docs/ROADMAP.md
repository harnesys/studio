# Roadmap к рынку

Date: 2026-09-15

Статусы ядра `packages/harnesys` живут в коде: `src/application/run-engine.ts`, `src/application/graph*.ts`, `src/packs/*`. Этот файл фиксирует продукт поверх ядра, чтобы Harnesys стоял рядом с Claude Cowork, OpenClaw, n8n и Lindy без вида стенда.

Критерий строки: человек платит или ставит Harnesys вместо соседнего продукта, потому что агент делает работу часами и днями, ход виден, необратимое спрашивает, модели любые, процесс живёт без открытого окна.

## Обещание

Harnesys — стол агентов на машине пользователя или на его VPS.

Агент привязан к папке. Его будят чатом, кроном, вебхуком или другим процессом или событием системы. Он читает и пишет файлы, ходит в shell, fetch, MCP, skills, LSP. Длинный ход не раздувает окно: уплотнение и артефакты. Между пробуждениями он помнит сделанное: Snapshot, SessionEvent, Pin и Semantic записи. Перед удалением, отправкой, пушем, оплатой — пауза и кнопка. Весь ход пишется в `~/.harnesys/studio.db`. Ключи хранятся на хосте.

Studio в репозитории — этот стол. `packages/harnesys` — ядро, которое стол крутит. Правило слоёв зафиксировано в `apps/studio/AGENTS.md`.

## Конечная картина: установка

Один из путей ведёт в один хост:

- сайт → macOS / Windows / Linux: `.dmg` / `.msi` / AppImage
- `brew install --cask harnesys`
- `curl -fsSL https://harnesys.dev/install | sh` → CLI `harnesys`
- Docker: один контейнер, UI на порту, данные в volume

Первый запуск — мастер на три шага: ключ провайдера, папка workspace, имя агента. Список провайдеров и discover уже есть в `apps/studio/shared/src/catalog.ts` и `packages/harnesys/src/adapters/models/discover.ts`. Через три минуты отправляется первое сообщение. Расписание и вебхук создаются на том же экране.

## Конечная картина: процесс

Два процесса с одной базой `~/.harnesys/studio.db`:

| процесс | роль |
|---|---|
| хост | runtime, persist, cron, вебхуки, MCP, HITL-gate. Живёт в фоне. Старт с логином ОС. |
| окно | стол: чат, файлы, инспектор, inbox подтверждений, расход. Можно закрыть. |

Сейчас продукт так не живёт. Факт: `apps/studio/dev.ts` поднимает Vite и `bun --watch server/src/index.ts`. Факт: `apps/studio/server/src/index.ts` в production раздаёт API и `client/dist` одним процессом. Фона, tray, автозапуска ОС, туннеля нет.

Иконка в tray показывает `running` и `awaiting_confirm` по всем тредам. Закрытое окно хост не останавливает. После сна хост поднимает paused HITL, очередь cron догоняет. Тот же бинарь работает на VPS. С ноутбука и телефона открывается UI по HTTPS. Вебхуки смотрят в интернет. HITL приходит в Telegram или системный пуш.

## Конечная картина: экран

Стол собирается из готовых слайсов `apps/studio/client/src`:

- слева: workspace, агенты, файлы, расписания, вебхуки (`widgets/workspace-sidebar`, `features/manage-schedule`, `features/manage-webhook`)
- центр: тред, стрим шагов, дифф файлов, HITL-карточка (`widgets/chat-transcript`, `widgets/file-pane`, `features/send-message`)
- справа: агент, skills, MCP, модель, расход (`widgets/agent-inspector`, `features/manage-agent`, `features/manage-model`, `features/manage-workspace-mcp`, `features/manage-workspace-skills`)
- сверху: inbox ожидающих подтверждений по всем тредам
- длинный run: строка «шаг N, $X, токены окна, что делает сейчас»

Стартовые агенты ставятся в один клик:

- ночной проход по папке или репо → утром дайджест, пуш только после confirm
- вебхук GitHub, Stripe или формы → подготовка ответа → confirm на отправку
- входящие файлы клиента → разбор, черновик, вопрос перед внешним действием
- сбор по крону → таблица в workspace

Заготовки лежат в `apps/studio/assets/skills/` (`agent-creator`, `workspace-ops`). Этого мало для скриншота продажи. Нужны три готовых агента с кроном и вебхуком из коробки.

## Конечная картина: деньги

BYOK везде. Маржа с токенов не нужна на старте.

| что | цена |
|---|---|
| приложение на своей машине | бесплатно |
| хост на нашей стороне (VPS, HTTPS, вебхуки, бэкап `studio.db`) | $29/мес соло |
| несколько людей на один стол, общий inbox | $79/мес workspace |

Библиотека `harnesys` остаётся встраиваемой. Платят за стол и always-on.

Дистрибуция запуска: сайт с роликом на 90 секунд (крон → ход → confirm в tray), Show HN, один обзор про Cowork с любой моделью, кроном и Snapshot. Без ролика длинный стол не продаётся.

## Уже в репозитории

Не переписывать. Дожимать и показывать.

| кусок | где |
|---|---|
| граф, run engine, стрим событий, очередь, claim | `packages/harnesys/src/application/run-engine*.ts`, `graph*.ts`, `run-claimer.ts`, `run-event-feed.ts` |
| HITL: `ask_user`, approve checkpoint, allow/ask/deny, respond | `tool-ask.ts`, `tool-approve*.ts`, `session.ts`, `ports/permissions.ts`, `apps/studio/shared/src/hitl-payload.ts` |
| files, shell, fetch, askUser, MCP, skills, `load_skill` | `src/packs/base.ts`, `src/packs/files/`, `src/packs/shell/`, `src/packs/web/fetch.ts`, `src/adapters/mcp-registry.ts`, `src/application/skills/` |
| провайдеры, discover, effort, generation, usage | `src/adapters/models/`, `src/ports/models.ts`, `apps/studio/shared/src/catalog.ts`, `server/src/application/providers/` |
| уплотнение вручную, оценка, проекция | `src/application/compaction/`, `src/application/llm.ts`, `apps/studio/client/src/features/compact-thread/` |
| persist Snapshot и SessionEvent, lifecycle store, SQLite хоста | `src/ports/runtime-state.ts`, `run-event-store.ts`, `run-lifecycle-store.ts`, `apps/studio/server/src/adapters/store/sqlite/` |
| workspace, файлы, git-статус папки | `client/src/widgets/workspace-sidebar/`, `file-pane/`, `features/open-file/`, `features/git-branch/`, `features/git-commit/`, `shared/src/git.ts` |
| треды, вложения, режимы, plans | `src/packs/threads/`, `src/packs/plan/`, `shared/src/thread.ts`, `modes.ts`, `plan-types.ts`, `features/send-message/`, `switch-thread/` |
| cron, очередь, тикер, `history` | `server/src/application/schedules/`, `adapters/schedule-fire-queue.adapter.ts`, `schedule-ticker.adapter.ts`, `src/domain/schedule.ts` |
| вебхуки: таблица, UI, fire wired | `features/manage-webhook/`, `server/src/application/webhooks/fire-webhook.use-case.ts`, `composition/wire-webhooks.ts` |
| память: порты Pin, Semantic, Episodic, Knowledge, wiring, UI | `src/packs/memory/`, `src/ports/memory.ts`, `server/src/composition/wire-memory.ts`, `features/manage-agent-memory/`, `manage-knowledge-roots/`, `manage-knowledge-index/` |
| plan mechanics | `apps/studio/assets/plan-mode.md`, `src/packs/plan/` |
| LSP | `src/packs/lsp/`, `features/lsp-bridge/` |
| prod один процесс раздаёт API и `client/dist` | `apps/studio/server/src/index.ts` |

Проверено чтением кода 2026-09-15. Не проверял метрики долгого прогона, потребление окна и стоимость: стенд не гонял.

## Обязательно: долгий ход

Сейчас `AgentBudget` задаёт `maxSteps`, `maxTokens`, `deadlineMs` (`src/domain/agent-definition.ts`). Проверка шагов есть в `src/application/graph-spawn.ts`. Потолка денег с остановкой хода нет. Правил retry, fallback в engine, детектора зацикливания нет в явном виде. `retryable` отмечен в `src/domain/run-result.ts`.

| фича | опора |
|---|---|
| автоуплотнение по порогу, факт в Snapshot | `application/compaction/run.ts`, `estimate.ts`, `application/llm.ts`, `domain/compaction.ts` |
| артефакты вне окна: лог shell, HTML, PDF, скрин с ссылкой в transcript | `ports/artifacts.ts`, `adapters/memory-artifact-store.ts`, `application/fold-attachments.ts`, `application/clip-tool-output.ts` |
| enforcement лимитов времени, токенов, денег с остановкой | `domain/agent-definition.ts`, `application/graph-spawn.ts` |
| детектор зацикливания: тот же tool с теми же аргументами без прогресса → стоп | `application/tool-call.ts`, `run-engine-segment.ts` |
| retry transient для сети и 429 | `domain/run-result.ts`, `application/run-engine*.ts` |
| fallback модели из `AgentDefinition.fallback` без потери хода | `domain/agent-definition.ts`, `adapters/models/binding.ts` |
| смена модели на живом run без нового треда | `features/manage-model/`, `ports/models.ts` |
| повтор шага после падения tool или generation | `application/run-engine-segment.ts` |
| живой статус: шаг, $, окно, действие в чате, списке тредов, tray; refresh ход не теряет | `application/run-event-feed.ts`, `server/.../deskEvents`, `widgets/chat-transcript/` |
| project instructions в сборке окна (`AGENTS.md`, пути) | `application/compile.ts`, `application/paths.ts` |

## Обязательно: память и сборка окна

Порты памяти есть. В schedule prefix pin и long факты не подмешиваются. Ветвления треда нет.

| фича | опора |
|---|---|
| project instructions в `compile` | `application/compile.ts`, `application/agent-identity.ts` |
| Pin и Semantic: запись, чтение, стирание в UI; новый fire крона видит pin и long | `packs/memory/pin.ts`, `semantic.ts`, `features/manage-agent-memory/` |
| Episodic и Knowledge как tools, не auto-RAG | `packs/memory/episodic.ts`, `knowledge.ts`, `features/manage-knowledge-*` |
| schedule prefix: last N ходов плюс pin и semantic long, резка старых fire | `server/src/application/schedules/`, `domain/schedule.ts`, `packs/scheduler/` |
| ветвление треда с этого места | `packs/threads/`, `ports/threads.ts`, `features/switch-thread/` |

## Обязательно: хост

Ядро stateless. Дни делает хост. Сейчас хост и окно не разделены.

| фича | опора |
|---|---|
| хост отдельно от окна, daemon без UI | `server/src/index.ts`, `apps/studio/dev.ts`, `composition/studio.ts` |
| автоподъём после рестарта: paused HITL, очередь cron догоняет | `application/run-claimer.ts`, `ports/run-lifecycle-store.ts`, `adapters/schedule-ticker.adapter.ts`, `adapters/wait-ticker.adapter.ts` |
| публичный URL вебхука: tunnel локально, HTTPS на VPS | `application/webhooks/fire-webhook.use-case.ts`, `adapters/http/webhook/` |
| очередь на занятый тред для webhook и ручного send | `adapters/schedule-fire-queue.adapter.ts`, `domain/errors.ts` (`ThreadBusyError`) |
| секреты на хосте: ключи, MCP env, tunnel token вне промпта и git | `server/src/config/env.ts`, `application/providers/`, `application/plugins/` |
| бэкап `studio.db` по крону | `server/src/adapters/store/sqlite/connection.ts` |

## Обязательно: человек в контуре

HITL в ядре сильный. Продукт вокруг него тонкий: карточка в открытом чате, глобального inbox нет.

| фича | опора |
|---|---|
| inbox всех `awaiting_confirm` и `awaiting_input` по workspace, badge в tray | `shared/src/hitl-payload.ts`, `application/tool-approve*.ts`, `application/tool-ask.ts`, `widgets/chat-transcript/` |
| plan mode как gate: без записи файлов и побочных эффектов до approve | `apps/studio/assets/plan-mode.md`, `shared/src/modes.ts`, `src/packs/plan/` |
| сообщение на ходу и перехват: очередь на тред, вливание по правилу interrupt, writer один | `application/graph.ts`, `domain/agent-definition.ts` (`InterruptReason`), `session.ts` |
| уведомление ОС и звук, когда ждут человека | нет опоры, добавить |
| confirm с телефона через тот же хост | `server/src/adapters/http/`, `composition/register-http.ts` |

## Обязательно: действия

| фича | опора |
|---|---|
| браузер: открыть, клик, ввод, скрин, snapshot DOM; confirm на внешнюю навигацию и submit; скрин как артефакт | сейчас только `src/packs/web/fetch.ts` |
| git как действие: status, diff, log, commit, push; HITL на commit и push | UI частично: `features/git-branch/`, `features/git-commit/`; в ядре пака нет |
| песочница shell: jail, worktree или контейнер, сеть по политике | `src/packs/shell/`, `src/packs/base.ts`, `domain/agent-definition.ts` (`AgentPaths`) |
| таймаут на контракте tool для браузера и MCP | `ports/tools.ts` |
| дифф правок до и после в UI | `widgets/file-pane/`, `features/open-file/`, `packs/files/` |

## Обязательно: поверхность

| фича | опора |
|---|---|
| онбординг: ключ → discover → агент → первый send | `pages/workspace-gate/`, `pages/settings/`, `features/create-workspace/`, `features/manage-agent/` |
| стартовые агенты и skills из коробки | `assets/skills/agent-creator/`, `assets/skills/workspace-ops/`, `features/manage-workspace-skills/` |
| поиск по тредам, Snapshot, SessionEvent | `ports/threads.ts`, `ports/run-event-store.ts`, `entities/` в client |
| расход: день, агент, тред, потолок, предупреждение до крышки | `domain/run-result.ts` (`Usage`), `widgets/chat-composer/` |
| ошибки провайдера языком человека: 401, квота, модель снята, Ollama не запущен | `adapters/models/`, `server/src/application/threads/map-coded-error.ts` |
| вебхук end-to-end в UI: создать → URL → ping → тред | `features/manage-webhook/`, `server/src/adapters/http/webhook/` |

## Желательно

Список содержит столько пунктов, сколько реально различает ревью.

| фича | опора |
|---|---|
| канал Telegram, затем Slack: HITL и короткий send в том же боте | нет опоры, новый адаптер к хосту |
| child run: исследование в child, в родителя выдержка | `application/graph-spawn.ts`, `graph-map.ts`, `domain/plan.ts` (`SubagentRole`) |
| починка JSON и structured output | `graph`: `llm:generate output JsonSchema`, `application/validate.ts` |
| OAuth коннекторов MCP без ручного token | `adapters/mcp-registry.ts`, `features/manage-workspace-mcp/` |
| отложенная загрузка tools для большого MCP | `application/tool-registry.ts`, `application/skills/` |
| верификация шага перед push, send, pay | `application/tool-approve*.ts` |
| связка run → run через отложенный запуск | `packs/scheduler/`, `packs/webhook/` |
| шаблоны вебхуков: GitHub push, Stripe event, form POST | `application/webhooks/`, `shared/src/webhook-prompt.ts` |
| экспорт хода в JSON и markdown | `ports/run-event-store.ts`, `ports/runtime-state.ts` |
| обновление приложения: Sparkle или auto-update | нет опоры, часть упаковки |
| кастомный HTTP tool в UI без правки репо | `ports/tools.ts`, `application/tool-registry.ts` |
| голос и диктовка в композиторе | `widgets/chat-composer/` |

Сюда не тащить оркестр ролей, граф-холст как главный UX, RAG-платформу, eval-облако, A/B, feature flags, tenant isolation. Ценность стола в ходе, памяти, HITL и живом процессе.

## Упаковка

1. Имя и сайт. Один экран: обещание, ролик, download, BYOK, цена хоста. Документация: install, первый агент, cron, webhook, HITL, свои ключи.
2. Бинарь хоста и UI. Сейчас dev держит два процесса. Продукт: один процесс раздаёт API и собранный клиент (`server/src/index.ts`), плюс daemon без окна.
3. Трей и автозапуск: macOS launch agent, Windows service, systemd user.
4. Туннель из UI: кнопка URL для вебхука без CLI.
5. Лицензия. Ядро `harnesys` открытое для встраивания. Деньги за hosted и always-on. Сказать на сайте прямо.
6. Тестовый контур перед публикацией. Один ночной агент на этом репо три дня подряд: уплотнение не ломает ход, память переживает fire, HITL доходит в tray, рестарт хоста поднимает paused, счёт держит потолок. Файл логов и скринов хранится в `~/.harnesys/`, тесты в репо не добавляются по `AGENTS.md`.

## Порядок работ

Зависимости, не фазы маркетинга.

1. Уплотнение, артефакты, enforcement `AgentBudget`, retry, fallback, loop-detect. Без этого длинный сценарий враньё.
2. Порты памяти в префиксе окна, project instructions в `compile`, ветвление. Без этого крон пустой.
3. Хост-демон, автоподъём, очередь, туннель, секреты, бэкап.
4. Inbox, plan gate, interrupt, уведомления, confirm с телефона.
5. Браузер, git-действия, дифф, песочница shell.
6. Онбординг, стартовые агенты, поиск, расход, e2e вебхук в UI.
7. Упаковка бинаря, tray, сайт, ролик, Telegram, child run. Начинать, когда пункты 1–6 гоняются ночью у себя.

## Рыночная проверка готовности

Анонс возможен, когда правдивы три пункта:

- Агент на этом репозитории работает часами в одном run: окно держится, бюджет останавливает, после рестарта хост продолжает или честно фиксирует failed в Snapshot и SessionEvent.
- Расписание работает днями: каждый fire видит Pin и Semantic, не дублирует вчерашнюю работу, необратимое приходит в inbox.
- Незнакомый человек ставится с сайта без клона, за три минуты получает первый ход, за пятнадцать — крон или вебхук.

Пока жив только `bun run dev` из `apps/studio`, это стенд разработки библиотеки. Продукт начинается, когда хост, окно и длинный ход совпадают.

Не проверял: ночные прогоны, цифры окна и стоимости, поведение туннеля и tray на трёх ОС.
