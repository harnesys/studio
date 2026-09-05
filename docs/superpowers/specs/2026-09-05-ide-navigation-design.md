# Навигация IDE: маршруты, табы, инспектор, сайдбар

Дата: 2026-09-05. Статус: реализовано (ветка front-redesign, задачи 1–11).

## Принцип

Активный таб равен URL. В табах IDE живут только треды и файлы (редактор/просмотрщик). Конфигурация сущностей — модалки, навигация — левый сайдбар, рантайм — правый. Стор (`features/ide/model/ide.store.ts`) хранит набор открытых табов, группы и сплиты; активность решает адрес. Прямая ссылка открывает закрытый таб. Закрытие активного ведёт к соседнему, пустой набор ведёт на IdeHome.

## Маршруты

| URL | Тип | Контент | Инспектор |
|---|---|---|---|
| `/w/:ws` | — | IdeHome | нет |
| `/w/:ws/thread/:threadId` | таб Thread | чат или журнал запусков по `thread.kind` | Inspector / Memory |
| `/w/:ws/file/*` | таб File | редактор или просмотрщик | Inspector (FileInspector) |
| `/w/:ws/agent/:agentId` | страница вне табов | лендинг агента | нет |
| `/w/:ws/settings/...` | страница | без изменений | нет |

`IdeTabKind` сокращается до `thread | file`. Идентичность таба равна `threadId`: тред, открытый с карточки агента и с карточки планировщика, существует как один таб.

Query-параметр при переходе с карточки задаёт происхождение: `?agent=`, `?scheduler=`, `?webhook=`. Он определяет подсветку в сайдбаре (карточка триггера в Automations при `scheduler`/`webhook`, карточка владельца треда при `agent` и без параметра) и на контент с инспектором не влияет. Старые пути (`/agent/:agentId/...`, `/schedules`, `/webhooks`, `/files`) удаляются без редиректов: тулза локальная, открытые табы живут в сторе.

Битый id: таб рендерит empty state с кнопкой «Закрыть», подсветки в сайдбаре нет.

## Таб треда

Рендер зависит от `thread.kind` (`'chat' | 'schedule' | 'webhook'`, `apps/studio/shared/thread.ts`):

- `chat`: чат как сейчас — `ThreadPanel`, `HitlPrompt`, `ChatComposer`; чип агента в шапке ведёт на лендинг.
- `schedule` и `webhook`: журнал выполнений. Записи создаёт только система, пользовательских сообщений нет, композер не рендерится. Поток группируется по прогонам: разделитель с номером и статусом прогона и текстом задачи, под ним события выполнения. `SessionEvent` не содержит отметки времени (`packages/harnesys/src/ports/session.ts`), момент срабатывания в разделителе появится после добавления timestamp в события — отдельная задача. Блоки HITL-подтверждения в журнале остаются интерактивными (confirm/deny), это единственный ввод в таких тредах.

Инспектор для всех видов треда один: Inspector / Memory.

## Лендинг агента

Страница вне таббара, как `settings`: `/w/:ws/agent/:agentId`.

- Шапка: имя, роль, статус; действия «New thread» (создаёт тред, открывает таб) и «Settings» (модалка конфига).
- Тело: список тредов агента — заголовок, updatedAt, индикатор активного запуска. Клик по строке открывает таб треда; если тред уже открыт, таб становится активным.
- Задел под дашборд: секции статистики (расходы) и Workflow-граф добавятся на эту страницу позже, сейчас только список тредов.
- Вход: чип агента в шапке треда и пункт меню карточки агента.

## Конфиг-модалки

Модалка конфигурации одна на сущность, для создания и для редактирования.

- Создание: кнопка `+` в заголовке секции сайдбара. Для Automations кнопка открывает выбор «Scheduler / Webhook».
- Редактирование: пункт «Settings» в меню карточки.
- Сохранение только по кнопке Save; Cancel закрывает без изменений. Автосейва на blur нет (сейчас `ConfigPane` сохраняет на `onBlur` — уходит).
- Состав полей:
  - агент — все секции текущего `ConfigPane`: Identity (name, role), Model, Instructions, Compaction, Memory, Skills, Tools, MCP. Внутри модалки слева навигация по категориям, справа содержимое выбранной; один макет для создания и редактирования;
  - планировщик — `ScheduleSettings`: identity, статус, target agent, cron, привязка треда;
  - вебхук — `WebhookSettings`: identity, статус, target agent, endpoint, secret, привязка треда.
- Значения всех категорий собираются в один драфт. Тоглы Skills/Tools/MCP и поля Compaction/Memory перестают писать на сервер сразу (сейчас `updateAgentCapabilities` вызывается на каждый toggle) — всё применяется разом по Save: при создании `createAgentRecord` и затем `updateAgent`/`updateAgentCapabilities`, при редактировании те же вызовы с полным драфтом.
- Привязка треда в модалке триггера: «новый тред» (по умолчанию) или существующий тред целевого агента (поле `ScheduleThreadField`). Сценарии «планировщик под тред» и «планировщик на существующий тред» закрываются одним полем.

## Инспектор

- Тред: вкладки Inspector и Memory. Inspector — текущий `InspectorPane` без `PinsPanel` и `SemanticPanel` (Plan, Model, Skills, MCP, Thread, Workspace). Memory — данные памяти агента треда: `PinsPanel`, `SemanticPanel`; настройки памяти — категория Memory в модалке агента.
- Файл: `FileInspector` (git-статус) единственной вкладкой.

## Сайдбар

Аккордеон, секции сверху вниз: Agents, Explorer, Automations, Git.

- Клик по заголовку переключает свёрнуто/развёрнуто, навигации нет.
- Развёрнутые секции делят свободную высоту: одна занимает всё (flex: 1), несколько делят поровну; между ними сплиттеры с сохранением пропорций в localStorage; каждая секция скроллит независимо.
- Первое открытие без памяти: Agents развёрнута, остальные свёрнуты.
- Пустая секция показывает строку-CTA на создание.

Карточки:

- Agents: плоские карточки без вложенных тредов. Клик открывает активный или последний тред агента (текущее поведение `entities/thread/model/active-thread.ts`); тредов нет — создаёт новый. Меню карточки: Dashboard, Settings, Delete.
- Automations: единый список карточек планировщиков и вебхуков, тип различается карточкой (иконка/бейдж), порядок по updatedAt. Клик открывает связанный тред с `?scheduler=` или `?webhook=`. Меню карточки: Settings, Delete.
- Explorer: дерево файлов, двойной клик открывает `/file/…`.
- Git: текущий состав.

Подсветка активной карточки выводится из URL и query-параметра, не из стора.

## Бекенд: вебхук как планировщик-триггер

Вебхук повторяет модель расписания: внешний триггер вместо cron, ход выполнения виден в его треде.

- Схема `apps/studio/server/adapters/store/sqlite/bootstrap.ts`: `webhooks.thread_id → threads(id) NOT NULL` с уникальным индексом; `threads.kind` расширяется значением `'webhook'`.
- `create-webhook.use-case` возвращает `{webhook, thread}` — зеркало `CreateScheduleResponse` из `apps/studio/shared/types.ts`.
- Запуск вебхука пишет ход выполнения в его тред по механике запусков расписания.
- `features/desk/model/hydrate-desk.ts` грузит вебхуки с сервера: сейчас клиент стартует на seed-фикстурах (`entities/webhook/model/webhook.store.ts`).
- Удаление треда удаляет привязанные `schedules` и `webhooks` (`ON DELETE CASCADE`); диалог удаления треда предупреждает о триггерах.

## Снос

- `pages/workspace/ui/chat-frame.tsx`, `widgets/thread-tabs`, `widgets/agent-threads` — мёртвый код.
- Ветка `FileTabs`/`FilePane` из `widgets/file-pane`, работающая только в `chat-frame`.
- `widgets/threads-list`, `widgets/schedules-list`, `widgets/webhooks-list`, `widgets/files-main` — список тредов агента переезжает на лендинг, страницы-списки больше не нужны.
- `widgets/agent-inspector`: вкладки Config и Threads удаляются. Поля `ConfigPane` пересобираются в модалку агента (`features/manage-agent`), `AgentMemoryFields` — во вкладку Memory, `threads-pane` — на лендинг агента.

## Точки переписывания

- `shared/config/routes.ts` (`studioPath`), `shared/config/location.ts`, `shared/config/navigation.ts` — паттерны `/thread/:id`, `/file/*`, `/agent/:id`.
- `app/routes/index.tsx` — новая таблица маршрутов.
- `features/ide/model/ide.store.ts` — kind `thread | file`, синхронизация активности с URL (`ide-sync.ts`).
- `pages/workspace/ui/workspace-page.tsx` — инспектор Inspector / Memory по типу таба.
- `widgets/workspace-sidebar` — аккордеон, Automations, меню карточек, подсветка из URL.
- `widgets/ide-content` — контент табов: чат, журнал запусков (schedule/webhook) и файл.
- `features/manage-agent`, `features/manage-schedule`, форма вебхука — модалки Save/Cancel.

## Решения по умолчанию

Вето любому пункту — правка доки.

1. Префикс `/w/` сохраняется.
2. Memory-таб инспектора: `PinsPanel` + `SemanticPanel` (данные). Настройки памяти (`AgentMemoryFields`) — категория Memory в модалке агента: весь конфиг уезжает в модалку целиком.
3. Workflow-заглушка не строится: место под граф — лендинг агента, реализация с `@xyflow/react` отдельной задачей.
4. Automations: один список по updatedAt без деления на подсекции.

## Вне объёма

- Редактор Workflow-графа на `@xyflow/react`.
- Статистика расходов и дашборд агента.
- История запусков вебхуков на сервере (сейчас `WebhookRecord.lastFiredAt`, `server/application/webhooks/webhook-record.ts`).
- Поиск и фильтры в секциях сайдбара.
