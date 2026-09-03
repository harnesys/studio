# Run lifecycle: ран как строка БД и журнал событий

Дата: 2026-09-03. Статус: утверждено в диалоге, спека.
Вход: `review_consolidated.md` (22 пункта P0-P2, сверены с кодом 2026-09-03).
Решения, принятые человеком: вариант B (полная персистентность жизненного цикла), ядро через порты в `packages/harnesys`, ручной перезапуск running-ранов после падения инстанса, федерация инстансов отдельной спекой, обратной совместимости и миграторов нет, dev-БД пересоздается.
Итерация 2 (2026-09-03): применены замечания внешнего ревью (проверка владельца в `renewLease`, lease при каждом входе в `running`, идемпотентность retry, дедуп `clientEventId` в БД) и упрощения (без `appliedResume` и `canonicalJson`, лимит фида только в событиях, `RunEventFeed` как helper библиотеки, чекпоинт узла без `pendingInterrupt`).
Итерация 3 (2026-09-03): модель приведена к journal-first по решению человека. Ран это строка в БД и журнал событий, ни одна структура в памяти не владеет правдой. `send` не запускает ран, а создает его в статусе `queued`. Исполнение всегда начинается забором lease (`claim`). Один механизм исполнения обслуживает send, respond, retry, schedules и будущую федерацию. Удалены `recover()`, `/resume`, `ActiveRunRegistry`, `drainAgentRun`.

Терминология спеки: **инстанс** (node instance) = один запущенный процесс приложения с бекендом на библиотеке harnesys (десктоп-хост, безголовый бекенд на VPS, ноутбуке, RPi). **Узел графа** (graph node) = узел agent-графа (`tool:call`, `control:spawn`), к инстансам отношения не имеет. **Клеймер** = компонент, забирающий lease у ранов в статусе `queued` и запускающий исполнение. Мастер-инстанс (десктоп/веб с полным UI) управляет безголовыми инстансами через одну панель: предмет спеки федерации, здесь только фундамент под нее.

## Проблема

Четыре частичные модели состояния рана: `RunEngine` (поля экземпляра), `ActiveRunRegistry` (in-memory), `drainAgentRun` (жизнь SSE-цикла), клиентский `session.store`. Ни одна не владеет правдой. Причина корневая: ран родился объектом в памяти, персистентность приклеивалась позже. Следствия: невозможный resume ReAct-агента, шторм `/resume`, молчаливые no-op команд, потеря `options/multi` ask-схемы, дубли событий, orphan tool_use, гонки recover. Полный список: `review_consolidated.md` разделы 1-3.

## Принцип

Ран это строка в `runs` и журнал событий. Все участники (движок, HTTP-слой, клиент, будущие инстансы федерации) читают строку и дополняют журнал; in-memory структуры производны и восстанавливаемы. Два следствия держат всю архитектуру:

1. Управление раном = запись в журнал. send, respond, reject, retry, cancel не запускают ничего: они пишут события и меняют статус атомарной транзакцией.
2. Исполнение = забор lease у рана в статусе `queued` и прогон сегмента графа. Любой путь входа (send, respond, retry, расписание, перехват после смерти инстанса) приводит ран в `queued` и будит локальный клеймер. Корректность не зависит от будильника: ран, оставшийся в `queued`, подберет периодический обход.

Ран в `queued` переживает смерть процесса: после рестарта обход его заберет. Незачатое доделывается само, начатое требует решения человека (running с истекшим lease ждет ручного retry): середина сегмента без чекпоинтов узла не восстановится автоматически.

Правила заменяемости:

1. Состояние и события: только через `RunLifecycleStore`/`RunEventStore`. Движок не знает SQLite; Postgres, remote-клиент федерации, IPC-хост реализуют те же интерфейсы без правки ядра.
2. Транспорт: библиотека не знает HTTP и SSE. Helper `RunEventFeed` дает асинхронную подписку на журнал; studio оборачивает его в SSE, десктоп-оболочка в IPC, федерация в WebSocket, без правки ядра.
3. Исполнение: `RunClaimer` и `RunEngine` библиотечные; контекст исполнения (агент, состояние треда, инструменты) хост дает через порт `RunTargets`. Кто исполняет ран, решает lease, не процесс, создавший ран.
4. Клиент: `RunStreamClient` поверх transport-адаптера (`fetchSse` сегодня), состояния отделены от React. Замена SSE на другой транспорт = один адаптер.
5. Каждая зависимость модуля объявлена конструктором или аргументом функции; глобальный импорт адаптера из слоя ядра запрещен.

## Целевая модель

Единственный владелец состояния рана: таблица `runs` в БД через порты библиотеки. Движок: чистый интерпретатор сегмента графа без собственной памяти. Studio реализует порты на SQLite; федерация переиспользует те же порты с другими адаптерами.

### RunRecord

```
runs: runId (pk), threadId, status, interruptId?,
      parentRunId?, spawnId?, attempt, leaseInstanceId?, leaseExpiresAt?, leaseEpoch,
      lastSeq, createdAt, updatedAt
```

Статусы: `queued | running | needs_input | completed | failed | cancelled`. Иммутабелен `completed` (transition из него отклоняется кодом `run_terminal`). `failed | cancelled | running-с-истекшим-lease → queued` разрешен c `attempt + 1` (retry, «Перехват»): механика повтора тем же runId, seq-история не рвется. Повтор успешного хода только через новый `send`. `lastSeq` монотонно растет с записью событий.

`parentRunId` и `spawnId` вводятся колонками в фазе 1, заполняются в 0.6.0 (spawn/handoff). Саб-ран несет `parentRunId` родителя и собственный `spawnId`, имеет собственный lease, собственный seq-неймспейс и собственные события.

### Инвариант эксклюзивного писателя: состояние, не тред

Инвариант: на один `RuntimeState` не более одного исполняющего рана. Корневое состояние принадлежит треду; саб-ран получает собственное через `RuntimeState.child(spawnId)` (порт существует, `runtime-state.ts:10`).

- Частичный уникальный индекс: один не-терминальный **корневой** ран (`parentRunId IS NULL`, статус из `queued | running | needs_input`) на `threadId`. `queued` считается не-терминальным: второй send на ран в очереди невозможен.
- `activeByThread(threadId)` возвращает корневой не-терминальный ран. `send`/respond/retry смотрят только на него.
- Гонка двух параллельных `send`: оба идут `create` + частичный уникальный индекс; нарушение уникальности маппится в 409. Сценарий ручной проверки после фазы 4.
- Саб-ран: отдельная строка `runs`, параллельно с корневым и с братьями. Ограничений на число не-терминальных саб-ранов треда нет.
- Barrier `policy:'all'` (0.6.0): запрос `childrenByParent(parentRunId)`, ожидание терминальных статусов. Барьер stateless, переживает рестарт.
- Ветвление треда (ROADMAP_v0): новый тред с копией состояния, инвариант не затронут. Schedule поверх живого ask: очередь, ран расписания создается `queued` и ждет.

### Lease и fencing

Клеймер-инстанс забирает ран: `claim` атомарно проверяет статус `queued`, ставит `leaseInstanceId` + `leaseExpiresAt` (TTL 15с) и поднимает `leaseEpoch`. Пока сегмент исполняется, клеймер продлевает lease (`renewLease`, каждые 5с), таймер живет в `RunClaimer`, останавливается на конце сегмента (needs_input, терминал, ошибка) и `stop()` (утечки нет). Running с невалидным lease = инстанс умер: ран берется заново вручную (retry → `queued`). `needs_input` без исполнителя. Два инстанса не исполняют один ран: `claim` возвращает `null` проигравшему гонку.

Fencing: `leaseEpoch` (монотонный int на ране) поднимается каждым `claim` и каждым `transition` из `running` (cancel тоже); `append` и `renewLease` требуют текущий epoch, запись с чужим отклоняется кодом `lease_stale`. Зависший владелец (пауза GC) не пишет в журнал после нового claim: его записи отклоняются. `renewLease` проверяет владельца и epoch: чужой инстанс получает `false`. Сравнение времени lease делает стор (`leaseExpiresAt` в его тайм-зоне), не вызывающий код.

### RunLifecycleStore (packages/harnesys/src/ports/)

```ts
export type RunLifecycleStatus =
  | 'queued' | 'running' | 'needs_input' | 'completed' | 'failed' | 'cancelled';

export type RunRecord = {
  runId: string;
  threadId: string;
  status: RunLifecycleStatus;
  interruptId?: string;
  parentRunId?: string;
  spawnId?: string;
  attempt: number;
  leaseInstanceId?: string;
  leaseExpiresAt?: number;
  leaseEpoch: number;
  lastSeq: number;
  createdAt: string;
  updatedAt: string;
};

export interface RunLifecycleStore {
  /** Создает ран в статусе queued; initial-события пишутся той же транзакцией
   *  (user-сообщение обязано попасть в журнал до того, как ран станет claimable). */
  create(run: { runId: string; threadId: string; parentRunId?: string; spawnId?: string }, events?: PendingSessionEvent[]): Promise<RunRecord>;
  get(runId: string): Promise<RunRecord | null>;
  /** Не-терминальный корневой ран потока, если есть. */
  activeByThread(threadId: string): Promise<RunRecord | null>;
  /** Саб-раны родителя (0.6.0, barrier). */
  childrenByParent(parentRunId: string): Promise<RunRecord[]>;
  /** Атомарный CAS queued → running + lease + epoch+1. null = гонку проиграли. */
  claim(runId: string, instanceId: string, ttlMs: number): Promise<RunRecord | null>;
  /**
   * Атомарный переход статуса: CAS from → to, epoch поднимается всегда.
   * События patch.events пишутся той же транзакцией (статус и журнал неделимы).
   * Ошибки coded: 'run_terminal' (из completed), 'already_resumed' (respond не на needs_input),
   * 'unknown_interrupt' (interruptId не совпал), 'lease_stale' (чужой epoch),
   * 'already_queued' (повторный retry).
   */
  transition(
    runId: string,
    expectedEpoch: number,
    patch: {
      from: RunLifecycleStatus;
      to: RunLifecycleStatus;
      interruptId?: string | null;
      advanceAttempt?: boolean;
      events?: PendingSessionEvent[];
    },
  ): Promise<RunRecord>;
  /** Продление: только владелец с текущим epoch; чужой инстанс получает false. */
  renewLease(runId: string, instanceId: string, ttlMs: number): Promise<boolean>;
  /** Клеймер: queued-раны, limit + курсор createdAt, без полного скана. */
  listClaimable(opts?: { limit?: number; before?: string }): Promise<RunRecord[]>;
  /** GC-тикер: needs_input старше TTL, limit + курсор updatedAt. */
  listExpiredAsks(opts?: { limit?: number; before?: string }): Promise<RunRecord[]>;
}
```

### RunEventStore (packages/harnesys/src/ports/)

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

`SessionEvent` получает обязательные `seq: number` и `runId: string`. `PendingSessionEvent` = `SessionEvent` без `seq`/`runId`. Индекс `(runId, seq)` в SQLite-адаптере.

### RunEventFeed: helper подписки без транспорта

```ts
export function createRunEventFeed(deps: {
  events: RunEventStore;
  lifecycle: RunLifecycleStore;
}): RunEventFeed;

export interface RunEventFeed {
  /** Живые события рана после fromSeq; завершается на терминальном статусе. */
  subscribe(runId: string, fromSeq: number): AsyncIterable<SessionEvent>;
}
```

Реализация helper'а: `tail()` из `RunEventStore` + подписка на публикацию `append`. При переполнении in-memory кольцевого буфера подписчик с отставшим `fromSeq` добирает середину через `tail()`, не теряет события. Библиотека не знает HTTP/SSE/IPC. Запись всегда предшествует публикации. Гарантия фида: at-least-once, дедуп по `(runId, seq)` на получателе.

### Исполнение: RunTargets, RunClaimer, RunEngine без памяти

Исполнение запускается только клеймером. Контекст исполнения резолвится в момент claim, не в момент send: это снимает зависимость от живых объектов создателя и делает любой инстанс способным исполнить любой ран своего хранилища (фундамент федерации).

```ts
// ports/run-targets.ts
export type RunTarget = {
  state: RuntimeState;
  agent: AgentDefinition;
  permissions?: PermissionMap;
  paths?: PathsConfig;
};
export interface RunTargets {
  resolve(threadId: string): Promise<RunTarget | null>;
}
```

```ts
// application/run-claimer.ts
export function createRunClaimer(deps: {
  lifecycle: RunLifecycleStore;
  targets: RunTargets;
  instanceId: string;
  leaseTtlMs?: number;   // дефолт 15с
  renewMs?: number;      // дефолт 5с
  sweepMs?: number;      // дефолт 5с
}): { kick(): void; stop(): void };
```

Цикл клеймера: `listClaimable` → на каждый ран `claim` → продление lease по таймеру, пока сегмент жив → `engine.execute(runId)` → на конце сегмента таймер остановлен. `kick()` будит обход немедленно (локальная задержка миллисекунды), периодический `sweepMs` ловит раны других инстансов и пропущенные будильники. Клеймер подписан на журнал своих ранов: терминальное событие чужой записи (cancel) прерывает сигнал сегмента. Studio создает один клеймер на процесс, `instanceId` = id инстанса.

`RunEngine` чистый интерпретатор: `execute(runId)` читает ран, снапшот состояния (`RunTarget.state`) и журнал; собирает `GraphOpts` (compile агента, toolRegistry, models из `RuntimeContext`); запускает один сегмент. Все записи движка идут через `append`/`transition`, публикация через feed. Поля `interrupt`, `applied`, replay-буфер, `idleWaits` не существуют. Пауза это `transition(running → needs_input)` с ask-событием в той же транзакции: статус, `interruptId`, снапшот-курсор и карточка ask неделимы, окно гонки respond отсутствует. Конец сегмента: `transition(running → completed | failed)` с терминальным событием.

Жизненный цикл команд (все через библиотечный `SessionHandle`, все = записи журнала):

- **send**: busy-проверка по `activeByThread` (409 с `pendingAskId` или `runId`) → `create(run, [user-событие с clientEventId])` → `claimer.kick()` → клеймер claim'ит и исполняет. Движок в момент send не создается.
- **interrupt** (HITL): узел графа бросает `AskUserInterrupt`; пул доигрывает in-flight вызовы (чекпоинт ниже); движок `transition(running → needs_input, events: [ask-событие])`.
- **respond/reject**: валидация payload по `cursor.interrupt.resumeSchema` из снапшота (единая точка, 400 при провале) → `transition(needs_input → queued, events: [hitl.answer с clientEventId])` → `claimer.kick()`. Второй respond: status уже не `needs_input`, CAS дает `already_resumed` → 409. Движка в момент respond не существует, lease не нужен.
- **claim + resume сегмента**: клеймер забирает ран; движок видит `cursor.interrupt` и `hitl.answer` в журнале, строит provider-сообщения единым строителем (`tool-message.ts`), восстанавливает `output` из `toolCalls` последнего assistant-сообщения для ReAct (1.1), запускает сегмент с узла прерывания. Чистый перезапуск исполнения, никакого «продолжения живого объекта»: recover() не существует.
- **retry**: `transition(failed|cancelled|running-истекший → queued, advanceAttempt)` → `kick()`. Двойной клик: второй переход упирается в CAS (`already_queued`) → 409. Lease для retry не нужен: это постановка в очередь, не исполнение.
- **cancel**: `transition(running → cancelled, events: [run.cancelled])`; из `running` epoch поднимается, следующая запись исполнителя получает `lease_stale`, сегмент раскручивается; клеймер дополнительно прерывает сигнал по терминальному событию. Из `needs_input`/`queued` cancel тоже разрешен (CAS от соответствующего from).
- **command() возвращает результат записи**: ошибки кодированные, не молчаливые (1.5).

`SessionHandle` (библиотека): `send`, `respond`, `reject`, `cancel`, `subscribe(runId)` через `RunEventFeed`, чтение статуса из store. Ни один метод не держит живой движок. `RuntimeContext` получает `claimer`; `SessionHandle` и host use-cases вызывают `claimer.kick()` после записи. `threadId` берется из `state.sessionId`.

### Идемпотентность send и respond: clientEventId

Клиент генерирует `clientEventId` (uuid) для send и respond. Перед persist `user`/`hitl.answer` события сервер ищет в треде событие с тем же `clientEventId`: повтор возвращает существующее, второго сообщения нет. Индекс `(threadId, clientEventId)`; время жизни = время жизни события, отдельной чистки нет. Оптимистичное событие клиента заменяется эхом по `clientEventId`, не по тексту.

### Идемпотентность батча и чекпоинт узла графа

Механизм approve (`approveStateKey`) обобщается до чекпоинта узла графа: ключ state `$nodeCheckpoint_{nodeId}` = `{ completed: Record<callIdx, ToolCallResult> }`. Пишется перед каждым interrupt (approve, permission, ask_user в батче). Воркер, поймавший `AskUserInterrupt`, не роняет `Promise.all`: пул помечает вызов pending, доигрывает in-flight вызовы, сохраняет их результаты в чекпоинт, бросает interrupt. На resume узел восстанавливает чекпоинт и выполняет только незавершенные вызовы (1.2). Чекпоинт удаляется при успешном завершении узла. `interruptId` хранится в `runs` и снапшоте, отдельного поля в чекпоинте нет. Крупные выводы инструментов идут через `ArtifactStore` (механизм fold существует): чекпоинт хранит результаты в пределах бюджета, снапшот не распухает.

### HITL-схема

Новый `packages/harnesys/src/application/ask-schema.ts`:

```ts
export function askUserSchema(input: {
  options?: Array<{ id: string; label: string }>;
  multi?: boolean;
  allowText?: boolean;
}): JsonSchema;
```

`options` заданы → схема включает `optionIds` с `items.enum = ids`, `maxItems: 1` при `multi: false`. Валидация подмножества опций декларативна (2.2). `AskUserInterrupt` теряет поля `options/multi` (часть `resumeSchema`); полная схема с опциями пишется в `cursor.interrupt.resumeSchema` и в metadata ask-события (2.1 единым местом). `run-engine-events.ts` сохраняет слияние `meta.options` при чтении старых строк. `resumeSchema()`-вырезание опций в движке удаляется; Ajv strict:false игнорирует служебные ключи; перечень служебных ключей (`options`, `multi`, `allowText`) фиксируется в `ask-schema.ts`. Валидация resume-payload: одна точка, respond (схема из снапшота), 400 при провале; движок журналу доверяет, дублирующая проверка при entry в graph.ts удаляется.

Permission gate: ветка `gate === 'ask'` в `tool-call.ts` бросает `AskUserInterrupt` с `source:'permission'`, `tool`, схемой `{approved: boolean}` через `askUserSchema`-механику approve. Resume `approved:true` → исполнение вызова; `false` → tool-сообщение «denied by user» + `tool.skipped` (1.6). В режиме `mode='ask'` инструменты `write_file`, `edit_file`, `shell`, `http` паркую ран в `needs_input` вместо строковой ошибки; бюджет `maxSteps` считают только узлы графа, не паузы HITL.

Reject: при resume сегмента с `hitl.answer {rejected: true}` узел `tool:call` берет `toolCalls` последнего assistant-сообщения, для каждого пишет tool-сообщение «rejected by user» и `tool.skipped` (2.4). Синтетические сообщения reject и approve строит одна функция в библиотеке (`tool-message.ts`), структура ролей для провайдеров не разъедется.

## События жизненного цикла

Терминальные и граничные переходы журнализируются той же транзакцией, что и статус:

- `run.started { attempt }` в транзакции claim: клиент снимает pending-карточку, показывает исполнение, видит границу попыток.
- `run.completed` / `run.failed { message }` / `run.cancelled { reason }` в транзакции терминального transition: клиент рисует статус и кнопку retry.
- `hitl.answer { interruptId, payload, clientEventId }` в транзакции respond: решение человека в журнале, карточка подтверждается.
- Ask-событие (interrupt) в транзакции needs_input: карточка в журнале, рендер после reload.
- `run.started` и `hitl.answer` участвуют в мердже, не рендерятся как сообщения ленты (замена `run.resumed`, отдельного события больше нет).

## SSE и синхронизация

- Кадры это события журнала, `id: seq`. `GET /api/runs/:id/events?fromSeq=N` отдает `tail(fromSeq)` через `RunEventFeed`, затем живые. Клиент хранит `lastSeq` на ран, reconnect шлет `fromSeq` (2.6).
- SSE закрывается сервером на `needs_input` (финальный кадр ask, затем служебный `event: run-paused`) и на терминальном статусе. Обрыв соединения на живом ране клиент трактует как разрыв, не как финиш (2.8).
- После respond на паркованном ране клиент переподключается к SSE того же рана с `lastSeq` и получает `hitl.answer`, `run.started` и хвост исполнения. После 409 `already_resumed` то же самое.
- `send` при не-терминальном корневом ране → 409 с `pendingAskId` (needs_input) или `runId` (running, queued); параллельные send атомарны через `create` + частичный уникальный индекс (2.9). `PendingHitlError`/`ThreadBusyError` маппятся в 409.

## HTTP-контракт

- `POST /api/threads/:id/send`: 202 `{runId}` (ран в очереди) | 409 `{pendingAskId}` | 409 `{runId}`.
- `GET /api/threads/:id`: `ThreadRecord.activeRun: { runId, status, leaseExpired? } | null` из `activeByThread`; `leaseExpired` вычисляется сравнением `leaseExpiresAt` (корень 1.4).
- `POST /api/runs/:id/respond|reject`: 202 `{runId}` | 400 `resume_validation_failed` | 409 `unknown_interrupt`, `run_terminal`, `already_resumed`, `lease_stale`. Слепой `{ok:true}` удален.
- `POST /api/runs/:id/retry`: для `failed | cancelled | running с истекшим lease`: transition → `queued` с `advanceAttempt`, ответ 202. Иначе 409 (`run_terminal`, `already_queued`).
- `POST /api/runs/:id/cancel`: transition → `cancelled`, 202 | 409.
- `GET /api/runs/:id/events?fromSeq=N`: SSE.
- Эндпоинта `/resume` не существует. Клиент: 409 с `runId` → подключиться к SSE, не ретраить; in-flight guard и backoff в `RunStreamClient`.

## Ресурсы и хвосты

- Replay-буфер фида: источник правды `RunEventStore`; in-memory кольцевой буфер 500 событий на ран, только для переподключений в пределах процесса (3.1, 3.2). Подписчик с отставшим `fromSeq` добирает через `tail()`.
- TTL ask: `needs_input` старше `ASK_TTL` (дефолт 7 дней, глобальный конфиг) → тикер через `listExpiredAsks` переводит в `cancelled` с событием `run.cancelled { reason: 'ask_expired' }` (3.3). Running с истекшим lease не GC-ится до ручного retry/отмены; в `activeRun` отдается `leaseExpired: true`.
- `finish()` фида вычисляет idle по `runs` (есть ли не-терминальный ран потока), не по живым записям (2.8 хвост).
- `tokens` без usage не растет (3.5). Мертвый `if` фоллбека удаляется (3.6). `resolveConcurrency` без дубля проверки (3.7). Tooltip композера (3.10). Union `HitlPayload` в shared для payload Confirm/Ask (3.9).
- `publishDeskThread` инкрементальный: заголовок потока + `latestSeq`, полное чтение только при первичной загрузке и reconcile (3.4). Инвалидация кеша инкремента: терминальные события, `rejected`, компакция треда, retry.

## Клиент

- Один `RunStreamClient` (`features/send-message/model/run-stream-client.ts`) поверх transport-адаптера (сегодня `fetchSse`): состояния `connecting | queued | live | paused | reconnecting | terminal | offline`, зеркалят статусы рана. connect → `run.started` → live → ask + `run-paused` → paused → respond → reconnect с `fromSeq` → live → терминал: одноразовый reconcile `getThread`. Разрыв на live → reconnecting с backoff, после N неудач offline (UI «Отключено, повторить»). Второй `connect` на тот же `runId` запрещен guard'ом вне React-стейта. `send-message.ts`, `drain-run-stream.ts`, `follow-live.ts`, `resume-paused.ts` заменяются тонкими вызовами; три источника ретрая исчезают (1.4 клиент).
- `reconcileEvents` с мерджем по ключу `(runId, seq)` вместо `replaceEvents`: серверные события по ключу, оптимистичные не затираются, дубли отбрасываются. Оптимистичное `user`-событие несет `clientEventId`, замена по эху сервера.
- `pendingHitl` снимается на `run.started`; union `HitlPayload` типизирует Confirm/Ask (3.9). Ран в `queued` отображается индикатором очереди до `run.started`.

## Не-цели (зафиксировано)

- Федерация инстансов, реестр инстансов, маршрутизация ранов между ними: вторая спека. Фундамент здесь: lease с fencing, `RunTargets`, клеймер (инстанс федерации подбирает чужие `queued` тем же `claim`), `parentRunId`/`spawnId` в схеме, порты без host-зависимостей.
- Мигратор схемы: появится в спеке федерации (до 0.6.0); до этого схема меняется свободно, dev-БД пересоздается.
- Per-thread TTL ask, observability-метрики (0.9 по ROADMAP), исполнение `control:spawn` (0.6.0): колонки и порты готовы, исполнение не здесь.

## Удаления

`SessionHandle.resume()`; `engine.recover()`; `ActiveRunRegistry`; `drainAgentRun` (движок пишет журнал сам); `idleWaits`; in-memory `applied`/`interrupt`/replay движка; in-memory `live`-указатель `createSession`; `run.resumed` (замещен `run.started`); `listExpiredLeases` (замещен `listClaimable`/`listExpiredAsks`); `tryAcquireLease` (замещен `claim`); `appliedResume` и `canonicalJson`-сравнение; `resumeSchema()`-вырезание; поля `AskUserInterrupt.options/multi`; `hitl-actions.ts` ensureLiveRun-ветка; `follow-live.ts`; HTTP `/api/threads/:id/resume`; лимит буфера фида по байтам; дублирующие ветки маппинга событий (маппинг один: `rowToSessionEvent` переиспользует конвертер библиотеки).

## Порядок работ

Фазы, внутри каждой порядок = зависимости, каждый коммит собирается (`bun run lint`, tsc):

1. Порты (`RunLifecycleStore` с claim/transition-CAS, `RunEventStore`, `RunTargets`) + SQLite-адаптеры (`runs` с `parentRunId`/`spawnId`/`leaseEpoch`, индекс `(runId, seq)`, индекс `(threadId, clientEventId)`, частичный уникальный индекс корневых ранов) + `RunEngine.execute` без памяти + `createRunClaimer` + `SessionHandle` на записях журнала + helper `createRunEventFeed`.
2. HTTP: `send` 202/409, `respond`/`reject` коды, `/retry`, `/cancel`, SSE `fromSeq`, `activeRun` с `leaseExpired`, `clientEventId`. `/resume` не существует.
3. HITL: `ask-schema.ts`, чекпоинт узла, permission ask, единый строитель tool-сообщений, восстановление `output`, чистки graph.ts.
4. Клиент: `RunStreamClient` со состояниями (`queued` включительно), `reconcileEvents` по `(runId, seq)`, обработка `run.started`/`run-paused`, удаление старых потоков, tooltip, `HitlPayload`.
5. GC: тикер TTL через `listExpiredAsks`, `leaseExpired`, инкрементальный publish с инвалидацией.

Проверка после фазы 4: флоу send → SSE (queued → live) → ask → respond → run.started и хвост; reload на parked ране; рестарт процесса: running с истекшим lease ждет retry, queued дообирается обходом; дабл-сабмит ответа и send; гонка двух параллельных send; retry из failed и дабл-клик retry; cancel на живом ране.
