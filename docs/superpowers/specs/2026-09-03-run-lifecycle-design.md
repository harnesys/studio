# Run lifecycle: единый владелец состояния рана

Дата: 2026-09-03. Статус: утверждено в диалоге, спека.
Вход: `review_consolidated.md` (22 пункта P0-P2, сверены с кодом 2026-09-03).
Решения, принятые человеком: вариант B (полная персистентность жизненного цикла), ядро через порты в `packages/harnesys`, ручной перезапуск running-ранов после падения инстанса, федерация инстансов отдельной спекой, обратной совместимости и миграторов нет, dev-БД пересоздается.

Терминология спеки: **инстанс** (node instance) = один запущенный процесс приложения с бекендом на библиотеке harnesys (десктоп-хост, безголовый бекенд на VPS, ноутбуке, RPi). **Узел графа** (graph node) = узел agent-графа (`tool:call`, `control:spawn`), к инстансам отношения не имеет. Мастер-инстанс (десктоп/веб с полным UI) управляет безголовыми инстансами через одну панель: предмет спеки федерации, здесь только фундамент под нее.

## Проблема

Четыре частичные модели состояния рана: `RunEngine` (поля экземпляра), `ActiveRunRegistry` (in-memory), `drainAgentRun` (жизнь SSE-цикла), клиентский `session.store`. Ни одна не владеет правдой. Следствия: невозможный resume ReAct-агента, шторм `/resume`, молчаливые no-op команд, потеря `options/multi` ask-схемы, дубли событий, orphan tool_use, гонки recover. Полный список: `review_consolidated.md` разделы 1-3.

## Принцип заменяемости

Библиотека собирается из кирпичей за портами; замена реализации не затрагивает смежные слои. Правила, по которым это достигается:

1. Состояние и события: только через `RunLifecycleStore`/`RunEventStore`. Движок не знает SQLite; другой движок хранения (Postgres, remote-клиент федерации) реализует те же интерфейсы без правки ядра.
2. Транспорт: библиотека не знает HTTP и SSE. Слой `RunEventFeed` (см. ниже) дает асинхронную подписку на события рана; studio оборачивает его в SSE, десктоп-оболочка сможет в IPC, федерация в WebSocket, без правки ядра.
3. Клиент: `RunStreamClient` работает поверх transport-адаптера (`fetchSse` сегодня), состояния клиента отделены от React. Замена SSE на другой транспорт = один адаптер.
4. Расширения: кастомные узлы графа идут через `CreateRuntimeOptions.nodes` (уже существует), инструменты через `ToolDefinition`, политика подтверждений через `permissionMapFor`. Новая возможность = новый кирпич за существующим портом, не правка ядра.
5. Каждая зависимость модуля объявлена конструктором или аргументом функции; глобальный импорт адаптера из слоя ядра запрещен (FSD-правило `index.ts` уже в `AGENTS.md`).

## Целевая модель

Единственный владелец состояния рана: таблица `runs` в БД через порты библиотеки. In-memory структуры производны и восстанавливаемы. Движок: чистая машина состояний без собственной памяти. Studio реализует порты на SQLite; федерация инстансов (вторая спека) переиспользует те же порты с другими адаптерами.

### RunRecord

```
runs: runId (pk), threadId, status, interruptId?, appliedResume?,
      parentRunId?, spawnId?, attempt, leaseNodeId?, leaseExpiresAt?, leaseEpoch,
      lastSeq, createdAt, updatedAt
```

Статусы: `running | needs_input | completed | failed | cancelled`. Иммутабельны `completed` (transition из него отклоняется кодом `run_terminal`). `failed | cancelled → running` разрешен под валидным lease с `attempt + 1`: механика retry тем же runId (кнопка «Повторить», «Перехват»), seq-история рана не разрывается. Защита от двойного resume держится на `interruptId` + `appliedResume`, не на иммутабельности. `lastSeq` монотонно растет с записью событий. `appliedResume` — canonical JSON (`canonicalJson` из `graph-edges.ts`) последнего примененного resume-payload.

`parentRunId` и `spawnId` вводятся колонками в фазе 1, заполняются в 0.6.0 (spawn/handoff). Саб-ран несет `parentRunId` родителя и собственный `spawnId`, имеет собственный lease, собственный seq-неймспейс и собственные события.

### Инвариант эксклюзивного писателя: состояние, не тред

Инвариант: на один `RuntimeState` не более одного исполняющего рана. Корневое состояние принадлежит треду; саб-ран получает собственное через `RuntimeState.child(spawnId)` (порт существует, `runtime-state.ts:10`).

- Частичный уникальный индекс: один не-терминальный **корневой** ран (`parentRunId IS NULL`) на `threadId`.
- `activeByThread(threadId)` возвращает корневой не-терминальный ран. `send`/`resume`/respond смотрят только на него.
- Саб-ран: отдельная строка `runs`, параллельно с корневым и с братьями. Ограничений на число не-терминальных саб-ранов треда нет.
- Barrier `policy:'all'` (0.6.0): запрос `childrenByParent(parentRunId)` в `RunLifecycleStore`, ожидание терминальных статусов. Барьер stateless, переживает рестарт процесса.
- Федерация: саб-раны независимо распределяются по инстансам, каждый держит свой lease; мастер-инстанс агрегирует через те же порты.
- Ветвление треда (ROADMAP_v0): новый тред с копией состояния, инвариант корневого рана не затрагивает. Schedule поверх живого ask: очередь, как у расписаний сейчас.

### Lease и fencing

Инстанс-исполнитель продлевает lease (`leaseNodeId`, TTL 15с, продление каждые 5с) пока ран исполняется; таймер живет внутри `RunEngine` на время активного сегмента, останавливается на `needs_input`, терминале, ошибке и `close()` (утечки таймера нет). Running с невалидным lease = инстанс умер: ран можно взять заново вручную (retry) или оставить до отмены. `needs_input` исполняется без lease; его возьмет любой инстанс при ответе пользователя. Два инстанса не могут исполнять один ран: второй получает `lease_held` → HTTP 409. При старте процесса незавершенные раны с истекшим lease остаются `running`, UI показывает `leaseExpired: true` и кнопку retry. Авто-догона нет (решение человека).

Fencing: `leaseEpoch` (монотонный int на ране) растет при каждом `tryAcquireLease`. `transition` и `append` принимают `expectedEpoch`; запись с чужим epoch отклоняется кодом `lease_stale`. Пауза GC у старого владельца не дает split-brain: его записи отклоняются.

### Порты (packages/harnesys/src/ports/)

`run-lifecycle-store.ts`:

```ts
export type RunRecord = {
  runId: string;
  threadId: string;
  status: RunLifecycleStatus; // 'running' | 'needs_input' | 'completed' | 'failed' | 'cancelled'
  interruptId?: string;
  appliedResume?: string;
  parentRunId?: string;
  spawnId?: string;
  attempt: number;
  leaseNodeId?: string;
  leaseExpiresAt?: number;
  leaseEpoch: number;
  lastSeq: number;
  createdAt: string;
  updatedAt: string;
};

export interface RunLifecycleStore {
  create(run: { runId: string; threadId: string; parentRunId?: string; spawnId?: string }): Promise<RunRecord>;
  get(runId: string): Promise<RunRecord | null>;
  /** Не-терминальный корневой ран потока, если есть. */
  activeByThread(threadId: string): Promise<RunRecord | null>;
  /** Саб-раны родителя (0.6.0, barrier). */
  childrenByParent(parentRunId: string): Promise<RunRecord[]>;
  /**
   * Атомарный переход статуса при совпадении epoch.
   * Ошибки coded: 'run_terminal' (из completed), 'already_resumed' (конкуренция),
   * 'lease_stale' (чужой epoch).
   */
  transition(
    runId: string,
    expectedEpoch: number,
    patch: { status: RunLifecycleStatus; interruptId?: string | null; appliedResume?: string | null; advanceAttempt?: boolean },
  ): Promise<RunRecord>;
  tryAcquireLease(runId: string, nodeId: string, ttlMs: number): Promise<boolean>;
  renewLease(runId: string, nodeId: string, ttlMs: number): Promise<boolean>;
  /** Для тикера: limit + курсор updatedAt, без полного скана. */
  listExpiredLeases(opts?: { limit?: number; before?: string }): Promise<RunRecord[]>;
}
```

`run-event-store.ts`:

```ts
export interface RunEventStore {
  /**
   * Пишет события с монотонными seq внутри рана, обновляет runs.lastSeq.
   * Одна транзакция. Отклоняется кодом 'lease_stale' при чужом epoch.
   * seq присваивается здесь, до публикации подписчикам.
   */
  append(runId: string, expectedEpoch: number, events: PendingSessionEvent[]): Promise<SessionEvent[]>;
  tail(runId: string, fromSeq: number): Promise<SessionEvent[]>;
  latestSeq(runId: string): Promise<number>;
}
```

`SessionEvent` получает обязательные `seq: number` и `runId: string`. `PendingSessionEvent` = `SessionEvent` без `seq`/`runId`; `append` возвращает события с присвоенными значениями. Порядок фиксирован: запись в стор, только потом публикация подписчикам (reconnect без пропусков). Индекс `(runId, seq)` в SQLite-адаптере.

### RunEventFeed: подписка без транспорта

Библиотека дает интерфейс подписки на события рана, studio оборачивает его в SSE:

```ts
export interface RunEventFeed {
  /** Живые события рана после fromSeq; завершается на терминальном статусе. */
  subscribe(runId: string, fromSeq: number): AsyncIterable<SessionEvent>;
}
```

Реализация в studio: `tail()` из `RunEventStore` + подписка на публикацию `append`. Библиотека не знает HTTP/SSE/IPC. Движок публикует события через feed после `append`.

### RunEngine без памяти

Удаляются поля: `interrupt`, `applied`, `events` (in-memory replay), `idleWaits`-очередь как контракт. Движок на каждый переход читает `RunLifecycleStore`/`RunEventStore`:

- старт: `store.create(run)` → `tryAcquireLease` → запуск сегмента графа;
- ask: `transition(needs_input)` с `interruptId`; схема interrupt хранится в снапшоте (`cursor.interrupt.resumeSchema`), она же источник при recover;
- respond/reject: атомарный transition `needs_input → running` с проверкой `interruptId` и сравнением `appliedResume`. Дедуп в БД, не в памяти: тот же payload → идемпотентный успех (200), другой → `already_resumed`, чужой interruptId → `unknown_interrupt`, из `completed` → `run_terminal`. Silent no-op запрещены (1.5);
- retry: transition `failed|cancelled → running` под валидным lease, `attempt + 1`; доступен только живому владельцу lease;
- recover(runId): валидация lease/статуса, восстановление `interrupt` из снапшота, никаких реэмитов ask (2.5): клиент получает ask через tail/reconcile;
- `command()` возвращает результат transition: ошибки кодированные, не молчаливые.

`SessionHandle.resume(runId)` приходит на смену `resume()` без аргумента; `session.ts` ожидает `engine.recover()` перед возвратом рана (`await`, не `void` — 1.3).

### Идемпотентность батча и чекпоинт узла графа

Механизм approve (`approveStateKey`) обобщается до чекпоинта узла графа: ключ state `$nodeCheckpoint_{nodeId}` = `{ completed: Record<callIdx, ToolCallResult>, pendingInterrupt?: { callIdx, interruptId } }`. Пишется перед каждым interrupt (approve, permission, ask_user в батче). Воркер, поймавший `AskUserInterrupt`, не роняет `Promise.all`: пул помечает вызов pending, доигрывает in-flight вызовы, сохраняет их результаты в чекпоинт, бросает interrupt. На resume узел восстанавливает чекпоинт и выполняет только незавершенные вызовы (1.2). Чекпоинт удаляется при успешном завершении узла. Крупные выводы инструментов идут через `ArtifactStore` (механизм fold существует): чекпоинт хранит результаты в пределах бюджета, снапшот не распухает.

### HITL-схема

Новый `packages/harnesys/src/application/ask-schema.ts`:

```ts
export function askUserSchema(input: {
  options?: Array<{ id: string; label: string }>;
  multi?: boolean;
  allowText?: boolean;
}): JsonSchema;
```

`options` заданы → схема включает `optionIds` с `items.enum = ids`, `maxItems: 1` при `multi: false`. Валидация подмножества опций декларативна (2.2). `AskUserInterrupt` теряет поля `options/multi` (часть `resumeSchema`); полная схема с опциями пишется в `cursor.interrupt.resumeSchema` и в metadata события (2.1 единым местом). `run-engine-events.ts` сохраняет слияние `meta.options` при чтении старых строк. `resumeSchema()`-вырезание опций в движке удаляется; Ajv strict:false игнорирует служебные ключи; перечень служебных ключей схемы (`options`, `multi`, `allowText`) фиксируется в `ask-schema.ts`. Единая точка валидации resume: движок перед `launchSegment` ( graph.ts дублирующую проверку при entry удалить).

Permission gate: ветка `gate === 'ask'` в `tool-call.ts` бросает `AskUserInterrupt` с `source:'permission'`, `tool`, схемой `{approved: boolean}` через `askUserSchema`-механику approve. Resume `approved:true` → исполнение вызова; `false` → tool-сообщение «denied by user» + `tool.skipped` (1.6). В режиме `mode='ask'` инструменты `write_file`, `edit_file`, `shell`, `http` паркую ран в `needs_input` вместо строковой ошибки; число permission-пауз на ход приемлемо, бюджет `maxSteps` считают только узлы графа, не паузы HITL.

Reject: в skip-entry ветке `graph.ts` для `tool:call` при `rejected:true` берутся `toolCalls` последнего assistant-сообщения, для каждого пишется tool-сообщение «rejected by user» и `tool.skipped` (2.4). Синтетические сообщения reject и approve строит одна функция в библиотеке (`tool-message.ts`), структура ролей для провайдеров не разъедется.

Resume ReAct (1.1): при старте сегмента с узла `tool:call` движок восстанавливает `output` из `toolCalls/finishReason` последнего assistant-сообщения в `$state.messages`.

## SSE и синхронизация

- SSE закрывается сервером на терминальном статусе и на `needs_input`: финальный кадр `ask`, затем служебный `event: run-paused`. Обрыв соединения на живом ране клиент трактует как разрыв, не как финиш (2.8).
- Кадры несут `id: seq`; `GET /runs/:id/events?fromSeq=N` отдает `tail(fromSeq)` через `RunEventFeed`, затем живые. Клиент хранит `lastSeq` на ран, reconnect шлет `fromSeq` (2.6). После успешного respond на паркованном ране клиент переподключается к SSE того же рана с `lastSeq` и получает `resumed` и хвост исполнения.
- `run.resumed` персистится как обычное событие со seq, `rowToSessionEvent` маппит; клиент снимает pending-карточку на `resumed` (2.3). Фильтрация `resumed` на рендере ленты: событие участвует в мердже, не рендерится как сообщение.
- `send` при `activeByThread` → 409 с `pendingAskId` (если `needs_input`) или `runId` (если running с валидным lease); параллельные send атомарны через `create`+частичный уникальный индекс корневых ранов (2.9). `PendingHitlError`/`ThreadBusyError` маппятся в 409. Идемпотентность send: клиент генерирует `clientEventId` (uuid) и шлет его в `send`/`respond`; сервер persist-ит `user`-событие с этим id, повтор с тем же `clientEventId` не создает второе сообщение.
- recover не реэмитит ask (2.5).

## HTTP-контракт

- `GET /api/threads/:id`: `ThreadRecord.activeRun: { runId, status, leaseExpired? } | null` из `activeByThread`. Клиент после reload знает runId (корень 1.4).
- `POST /api/threads/:id/resume` идемпотентен:
  1. active ран `needs_input` → 202 `{runId, status:'paused', resumed:false}`;
  2. active `running` с валидным lease → 409 `{runId, status:'running'}`;
  3. active `running` с истекшим lease → `tryAcquireLease` (атомарно) → успех: 202 `{runId, status:'resumed', resumed:true}`, `handle.resume(runId)`; занято → ветка 2;
  4. нет active рана → 404; корневой ран в `completed` → 409 `run_terminal` (повтор завершенного рана не предусмотрен, новый ход = новый `send`).
- `POST /api/runs/:id/respond|reject`: коды движка в HTTP: `unknown_interrupt` → 409, `run_terminal` → 409, `already_resumed` → 200 идемпотентный успех (3.8), `resume_validation_failed` → 400, `lease_stale` → 409. Слепой `{ok:true}` удален.
- `POST /api/runs/:id/retry`: для `failed|cancelled` рана: `tryAcquireLease` + transition `→ running` с `attempt+1`, ответ 202. Клиентская кнопка «Повторить» на упавшем ходе.
- Клиент: 409 на resume с `runId` → подключиться к SSE этого рана, не ретраить; in-flight guard и backoff в `RunStreamClient`.

## Ресурсы и хвосты

- Replay-буферы: источник правды `RunEventStore`; in-memory буфер фида — кольцевой, лимит по байтам (дефолт 1 MiB на ран) и 500 событий, только для переподключений в пределах процесса (3.1, 3.2).
- TTL ask: `needs_input` старше `ASK_TTL` (дефолт 7 дней, глобальный конфиг) → тикер переводит в `cancelled` с событием кода `ask_expired` (3.3). Running с истекшим lease не GC-ится до ручного retry/отмены; в `activeRun` отдается `leaseExpired: true`.
- `finish()` фида вычисляет idle по `runs` (есть ли не-терминальный ран потока), не по живым записям реестра (2.8 хвост).
- `tokens` без usage не растет (3.5). Мертвый `if` фоллбека удаляется (3.6). `resolveConcurrency` без дубля проверки (3.7). Tooltip композера (3.10). Union `HitlPayload` в shared для payload Confirm/Ask (3.9).
- `publishDeskThread` инкрементальный: заголовок потока + `latestSeq`, полное чтение только при первичной загрузке и reconcile (3.4). Инвалидация кеша инкремента: терминальные события, `rejected`, компакция треда, retry.

## Клиент

- Один `RunStreamClient` (`features/send-message/model/run-stream-client.ts`) поверх transport-адаптера (сегодня `fetchSse`): состояния `connecting | live | paused | reconnecting | terminal | offline`. connect → apply → disconnect: reconnect с `fromSeq` (backoff, после N неудач состояние `offline`, UI показывает «Отключено, повторить») → `run-paused` → ожидание ответа → terminal: одноразовый reconcile `getThread`. Второй `connect` на тот же `runId` запрещен guard'ом вне React-стейта. `send-message.ts`, `drain-run-stream.ts`, `follow-live.ts`, `resume-paused.ts` заменяются тонкими вызовами; три источника ретрая исчезают (1.4 клиент).
- `reconcileEvents` с мерджем по ключу `(runId, seq)` вместо `replaceEvents`: серверные события по ключу, оптимистичные не затираются, дубли отбрасываются. Оптимистичное `user`-событие несет `clientEventId` (uuid); сервер возвращает его эхом в persist-событии, замена по совпадению `clientEventId`, не по тексту.
- `pendingHitl` реагирует на `resumed`; union `HitlPayload` типизирует Confirm/Ask (3.9).

## Не-цели (зафиксировано)

- Федерация инстансов, реестр инстансов, маршрутизация ранов между ними: вторая спека. Здесь только фундамент: lease с fencing, `parentRunId`/`spawnId` в схеме, порты без host-зависимостей.
- Мигратор схемы: появится в спеке федерации (до 0.6.0); до этого схема меняется свободно, dev-БД пересоздается.
- Per-thread TTL ask, observability-метрики (0.9 по ROADMAP), `autoRetryLeaseExpired` (спека schedules), исполнение `control:spawn` (0.6.0): колонки и порты готовы, исполнение не здесь.

## Удаления

`resumeSchema()`-вырезание; поля `AskUserInterrupt.options/multi`; `SessionHandle.resume()` без runId; in-memory `applied`/`interrupt`/replay движка; `hitl-actions.ts` ensureLiveRun-ветка; `follow-live.ts` как отдельный поток; дублирующие ветки маппинга событий (маппинг один: `rowToSessionEvent` переиспользует конвертер библиотеки).

## Порядок работ

Фазы, внутри каждой порядок = зависимости, каждый коммит собирается (`bun run lint`, tsc):

1. Порты (`RunLifecycleStore`, `RunEventStore`, `RunEventFeed`) + SQLite-адаптеры (`runs` с `parentRunId`/`spawnId`/`leaseEpoch`, индекс `(runId, seq)`, частичный уникальный индекс корневых ранов) + `RunEngine` без памяти с lease-таймером и fencing + `SessionHandle.resume(runId)`.
2. HTTP: `activeRun`, идемпотентный `/resume`, respond/reject коды, `/retry`, send 409, `fromSeq`, `clientEventId`, фид как локальный подписчик.
3. HITL: `ask-schema.ts`, чекпоинт узла, permission ask, единый строитель tool-сообщений, восстановление `output`, чистки graph.ts.
4. Клиент: `RunStreamClient` со состояниями, `reconcileEvents` по `(runId, seq)`, обработка `resumed`/`run-paused`, удаление старых потоков, tooltip, `HitlPayload`.
5. GC: тикер TTL с `listExpiredLeases(limit, before)`, `leaseExpired`, инкрементальный publish с инвалидацией.

Проверка после фазы 4: флоу send → SSE → ask → respond → resumed, reload на parked ране, рестарт процесса, дабл-сабмит ответа и send, retry из failed.
