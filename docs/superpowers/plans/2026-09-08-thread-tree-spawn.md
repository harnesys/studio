# Дерево тредов, ветка по ссылке, видимость спавнов — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ветка треда наследует прошлое по ссылке (отображение + контекст модели), спавны видны карточкой в ленте и открываются read-only, сайдбар — дерево тредов, `ThreadHeader` удалён.

**Architecture:** Единый event-лог: события спавнов пишутся в `run_events` треда-родителя (`runId = spawnId`), лента и спавн-вью — два представления одного лога. Контекст ветки — одноразовый seed первого snapshot'а из событий родителя до `forkAt`. Отображение истории ветки — склейка на чтении в `GetThreadUseCase` + `inheritedEventCount`.

**Tech Stack:** Bun, Hono, Drizzle/SQLite, harnesys (монорепо-пакет), React, zustand, biome.

**Spec:** `docs/superpowers/specs/2026-09-08-thread-tree-spawn-design.md`

## Global Constraints

- Тесты запрещены (`AGENTS.md`): не создавать `*.test.ts` / `*.spec.ts`. Верификация каждой задачи: `bun run typecheck` (в `apps/studio`), `bunx biome check` на затронутых путях, ручная проверка по чек-листу задачи.
- Порты и типы harnesys (`packages/harnesys/src/ports/**`) меняются только в задачах, где это явно прописано (санкция дана в спеке).
- Слайс FSD наружу только через `index.ts` (`noRestrictedImports` в `biome.json`).
- Файл ~300 строк; резать по ответственности.
- Размер событий: не дублировать родительский журнал в `run_events` ветки; seed пишется один раз в snapshots.
- Lint/формат: biome на весь монорепо; после каждой задачи `bunx biome check --write` на затронутых файлах.
- Дев-сервер Studio может быть уже поднят хозяином; порты 3000/5173 не перехватывать. Ручная проверка — agent-browser (читать `agent-browser skills get core` перед работой).

## Ключевые факты о кодовой базе (контекст исполнителю)

- Ран создаёт `SessionHandle.send` (`packages/harnesys/src/application/session.ts:140-163`): `lifecycle.create({runId, threadId}, [userEvent])` + kick claimer. Lease берёт claimer (`run-claimer.ts:55-77`): `targets.resolve(threadId)` → `lifecycle.claim` → `engine.execute`.
- `StudioRunTargets.resolve` (`apps/studio/server/adapters/studio-run-targets.adapter.ts:56`) строит состояние: `runtimeStates.forState(threadId)`; `sessionId` треда = `threadId` (`sqlite-runtime-state-repo.adapter.ts:12-14`).
- `startGraph` (`packages/harnesys/src/application/graph.ts:201`) делает `state.load()` (212) и берёт `snapshot.state` как `st` (215-217); пустой snapshot → `st = {}`, дальше `core:start` создаёт `st.messages` и пушит user-сообщение. Значит seed = закоммитить snapshot с заполненным `state.messages` до рана.
- `runSegment` (`run-engine-segment.ts:260`) мапит события через `eventToSessionEvent` (271) и журналирует под runId родителя. Спавн-эмиссии коммитятся в `graph.ts:988-991` уже ПОСЛЕ завершения детей (`Promise.all` в `graph-spawn.ts:210`).
- Дочерний граф: `runOneChild` (`graph-spawn.ts:113-176`) дренирует события в никуда (141-143). Child `RuntimeState` = `parent.state.child(spawnId)`; в sqlite `sessionId = spawnId`, `threadId` наследуется (`sqlite-runtime-state.repo.ts:58-60`). У ребёнка свой внутренний `runId` (свежий UUID из его snapshot), НО `Event.sessionId = spawnId`.
- `RunEventStore.appendForThread(threadId, runId, events)` (`sqlite-run-events.adapter.ts:136-144`) пишет в журнал без lease-проверки —_child runs строк в `runs` не имеют.
- SSE живого рана: `GET /api/runs/:id/events` (`thread.controller.ts:192-199`) → `StreamRunEventsUseCase` (`stream-run-events.use-case.ts:25`) — проверяет ТОЛЬКО существование run-записи. Для спавнов (нет записи в `runs`) нужен отдельный путь.
- Клиент: `connectThreadRun(threadId, runId)` (`features/send-message/model/client-registry.ts:34`) — один `RunStreamClient` на тред; события аппендятся в `useSessionStore.events[threadId]`.
- `splitRuns` (`widgets/chat-transcript/model/run-groups.ts:27-60`) режет лог по терминальным событиям; `groupSegments` (`model/turn-segments.ts`) — единственная проекция лог → сегменты; `agent.spawned` сейчас в стрим не попадает вовсе.
- `ThreadRecord` (`apps/studio/shared/thread.ts:14-31`), клиентский `Thread` (`entities/thread/model/thread.ts:3-17`), маппер `toClientThread` (`entities/thread/model/thread-record.ts`).
- `IdeTab.kind: 'thread' | 'file'` (`features/ide/model/ide.store.ts:21-30`), `openThread` (206-211); таб-лейбл `tab-meta.tsx:44-58`.
- `agent-thread-row.tsx` — плоский список; бейджи `branch`/`N×`/`← parent` (97-125), меню Open parent/Open child (156-167).

---

### Task 1: harnesys — события спавнов в SessionEvent

**Files:**
- Modify: `packages/harnesys/src/ports/session.ts` (union `SessionEvent`)
- Modify: `packages/harnesys/src/application/run-engine-events.ts` (`eventToSessionEvent`)
- Modify: `packages/harnesys/index.ts` (если типы реэкспортируются поштучно — проверить)

**Interfaces:**
- Produces: варианты `SessionEvent`:
  ```ts
  | { type: 'agent.spawned'; agentId: string; spawnId: string; seq?: number; runId?: string }
  | { type: 'agent.completed'; agentId: string; spawnId: string; seq?: number; runId?: string }
  | { type: 'agent.failed'; agentId: string; spawnId: string; code?: string; message?: string; seq?: number; runId?: string }
  ```
  Далее по плану их читают: Task 2 (эмиссия), Task 8-9 (клиент).

- [ ] **Step 1: расширить union `SessionEvent`** в `ports/session.ts` тремя вариантами выше (после `agent.handoff`).
- [ ] **Step 2: замапить эмиссии** в `run-engine-events.ts`. Блок `agent.handoff || agent.spawned` (строки 290-301) разделить:
  ```ts
  if (t === 'agent.handoff') {
    const m = ev.metadata as Record<string, unknown> | undefined;
    const fromMeta = typeof m?.agentId === 'string' ? m.agentId : '';
    const agentId = fromMeta || ev.agentId;
    if (!agentId) {
      return null;
    }
    return { type: 'agent.handoff', agentId };
  }
  if (t === 'agent.spawned' || t === 'agent.completed' || t === 'agent.failed') {
    const m = ev.metadata as Record<string, unknown> | undefined;
    const agentId = typeof m?.agentId === 'string' ? m.agentId : ev.agentId;
    const spawnId = typeof m?.spawnId === 'string' ? m.spawnId : '';
    if (!spawnId) {
      return null;
    }
    if (t === 'agent.failed') {
      return {
        type: 'agent.failed',
        agentId,
        spawnId,
        code: typeof m?.code === 'string' ? m.code : undefined,
        message: typeof m?.message === 'string' ? m.message : undefined,
      };
    }
    return { type: t, agentId, spawnId };
  }
  ```
  Старое условие `m?.handoff !== true` исчезает: события спавнов больше не выбрасываются. Существующее поведение handoff (карточка в ленте) не меняется.
- [ ] **Step 3: проверить `agent.handoff`-экспорт при spawn-эмиссии с `handoff: true`.** В graph.ts handoff-эмиссия идёт типом `agent.handoff` (не `agent.spawned`), поэтому отдельная ветка не нужна; убедиться чтением `graph.ts` вокруг `prepareHandoff`.
- [ ] **Step 4: Верификация.** `bunx tsc -p packages/harnesys/tsconfig.json --noEmit` (или `bunx tsc -p apps/studio/tsconfig.json --noEmit` после Task 3 — union касается обоих). `bunx biome check packages/harnesys/src`.
- [ ] **Step 5: Commit** `feat(harnesys): surface agent.spawned/completed/failed in SessionEvent stream`.

---

### Task 2: harnesys — journaling дочерних событий спавна

**Files:**
- Modify: `packages/harnesys/src/application/graph.ts` (тип `GraphOpts` ~строка 133; блок `control:spawn` 969-996)
- Modify: `packages/harnesys/src/application/graph-spawn.ts` (`runOneChild`, `runSpawnNode`)
- Modify: `packages/harnesys/src/application/run-engine.ts` (`execute`, наполнение `graphOpts` 127-152)

**Interfaces:**
- Consumes: `eventToSessionEvent` из Task 1; `RunEventStore.appendForThread` / `.next` / `feed.publish` (существующие).
- Produces: поле `GraphOpts.childJournal?: (spawnId: string, ev: Event) => void`. Контракт: вызывается из drain-цикла дочернего графа для каждого события; реализация в engine пишет SessionEvent в журнал треда под `runId = spawnId` и публикует в feed. Также `runSpawnNode` из `graph-spawn.ts` заменяется на `prepareSpawn` + `executeSpawn` (см. Step 4).

- [ ] **Step 1: `GraphOpts.childJournal`.** В `graph.ts` в тип `GraphOpts` добавить `childJournal?: (spawnId: string, ev: Event) => void;`.
- [ ] **Step 2: две фазы вместо runSpawnNode.** В `graph-spawn.ts` удалить предварительный пуш `agent.spawned` в `emissions` (192-198) — эмиссия коммитится в graph.ts ДО детей (Step 4). Разбивку на `prepareSpawn`/`executeSpawn` сделать в Step 4 этого же таска; здесь только подготовить: перенести `resolveTargets`/`resolveConcurrency`/`parseCalls` в `prepareSpawn`, телодвижения `sequential/Promise.all` + сбор результатов — в `executeSpawn`.
- [ ] **Step 3: drain → childJournal.** В `runOneChild`:
  ```ts
  for await (const ev of runChild(childOpts)) {
    parent.childJournal?.(target.spawnId, ev);
  }
  ```
  И прокинуть рекурсию: в `childOpts` добавить `childJournal: parent.childJournal` (вложенные спавны пишутся под свои spawnId).
- [ ] **Step 4: graph.ts — коммит `agent.spawned` до детей.** В `graph-spawn.ts` разложить `runSpawnNode` на две экспортируемые фазы:
  ```ts
  export function prepareSpawn(
    node: SpawnNodeSpec,
    parent: GraphOpts,
    slots: SpawnSlots,
  ): {
    targets: { call: SpawnCall; def: AgentDefinition; spawnId: string }[];
    concurrency: 'parallel' | 'sequential';
  }
  export async function executeSpawn(
    prepared: ReturnType<typeof prepareSpawn>,
    parent: GraphOpts,
    runChild: ChildRunner,
  ): Promise<SpawnNodeOutcome> // results + agent.completed/failed emissions
  ```
  `prepareSpawn` валидирует calls/targets/concurrency (те же coded-ошибки). В graph.ts блок `control:spawn` заменить вызов:
  ```ts
  const prepared = prepareSpawn(node as SpawnNodeSpec, { ...opts, agent, plan, input, toolRegistry }, slots);
  for (const t of prepared.targets) {
    const e = await commit('running', 'agent.spawned', 'recorded', { agentId: t.call.agentId, spawnId: t.spawnId });
    yield e;
  }
  const spawnOutcome = await executeSpawn(prepared, { ...opts, agent, plan, input, toolRegistry }, startGraph);
  for (const emission of spawnOutcome.emissions) { // только completed/failed
    const e = await commit('running', emission.type, 'recorded', emission.metadata);
    yield e;
  }
  ```
  try/catch вокруг `prepareSpawn` + `executeSpawn` — существующий (978-987). `appendSpawnResultsMessage` / `clearQueuedSpawns` / `output = spawnOutcome.results` — без изменений. Старый `runSpawnNode` удалить (вызов один).
- [ ] **Step 5: engine — реализация childJournal.** В `run-engine.ts` `execute`, до построения graphOpts (record уже получен, `record.threadId`):
  ```ts
  const childJournal = (spawnId: string, ev: Event): void => {
    const mapped = eventToSessionEvent(ev);
    if (!mapped) {
      return;
    }
    const withRun = { ...mapped, runId: spawnId } as SessionEvent;
    const seq = deps.events.next(spawnId);
    const full = { ...withRun, seq } as SessionEvent;
    void deps.events
      .appendForThread(record.threadId, spawnId, [full])
      .then((stored) => deps.feed.publish(spawnId, stored))
      .catch(() => {});
  };
  ```
  Добавить в `graphOpts` поле `childJournal`. Импорт `eventToSessionEvent` уже есть косвенно — добавить прямой. `appendForThread` есть в порту `RunEventStore`? Проверить `packages/harnesys/src/ports/run-event-store.ts`: если метода нет в порту — добавить в порт (санкционировано спекой) и реализация уже существует в sqlite-адаптере.
  Проглатывание ошибки `.catch(() => {})` — осознанно: журнал ребёнка не должен ронять родительский ран; потеря стрима ребёнка не влияет на snapshot. (`trace` недоступен в библиотеке.)
- [ ] **Step 6: Верификация.** `bunx tsc -p apps/studio/tsconfig.json --noEmit` (типит и harnesys через project refs; если нет — типить пакет отдельно). `bunx biome check packages/harnesys/src`. Ручной смоук позже (Task 12), здесь — только компиляция.
- [ ] **Step 7: Commit** `feat(harnesys): journal spawn child events under spawnId and emit agent.spawned before children`.

---

### Task 3: Studio shared — `inheritedEventCount` в ThreadRecord

**Files:**
- Modify: `apps/studio/shared/thread.ts` (ThreadRecord, ThreadSummary)
- Modify: `apps/studio/client/src/entities/thread/model/thread.ts` (тип `Thread`)
- Modify: `apps/studio/client/src/entities/thread/model/thread-record.ts` (`toClientThread`)
- Modify: серверные сборщики ThreadRecord: `apps/studio/server/application/threads/get-thread.use-case.ts`, `list-threads.use-case.ts`, `create-thread.use-case.ts` (+ `thread.helpers.ts`, `schedules/create-schedule.use-case.ts:163` — все места, где literals собирают ThreadRecord; найти по `forkAt:` в `apps/studio/server/application`)

**Interfaces:**
- Produces: `ThreadRecord.inheritedEventCount: number` (0 для не-веток), включено в `ThreadSummary` Pick. Клиентский `Thread.inheritedEventCount?: number`. Читают Task 5 (сервер), Task 9-10 (клиент).

- [ ] **Step 1:** `shared/thread.ts`: в `ThreadRecord` добавить `inheritedEventCount: number;` (после `forkAt`), в `ThreadSummary` Pick добавить `'inheritedEventCount'`.
- [ ] **Step 2:** заполнить во всех литералах ThreadRecord на сервере: `get-thread.use-case.ts` — реальное значение (Task 5, пока `0`), остальные (`create-thread`, `list-threads`, `create-schedule`, helpers) — `0`.
- [ ] **Step 3:** клиент: `Thread.inheritedEventCount?: number`, `toClientThread` переносит поле.
- [ ] **Step 4:** `bun run typecheck` в `apps/studio` (сервер+клиент tsconfig прогонит все литералы; компилятор найдёт незаполненные места — заполнить).
- [ ] **Step 5: Commit** `feat(studio): inheritedEventCount on thread records`.

---

### Task 4: Studio server — fork-logs: отсечка и seed-сообщения

**Files:**
- Create: `apps/studio/server/application/threads/fork-logs.ts`
- Modify: `apps/studio/server/application/threads/get-thread.use-case.ts`

**Interfaces:**
- Produces:
  ```ts
  /** События родителя до forkAt включительно. forkAt — id события, clientEventId или runId. */
  export function cutParentEvents(events: SessionEvent[], forkAt: string): SessionEvent[]
  /** История до forkAt → messages для seed snapshot'а ветки. */
  export function seedMessagesFromEvents(events: SessionEvent[]): { role: 'user' | 'assistant'; content: string; attachments?: unknown[]; origin?: string }[]
  ```
  Правила отсечки `cutParentEvents`: (а) если forkAt совпадает с `runId` какого-то события — включить все события этого runId (весь ран, до его терминального фрейма); взять события с порядковым индексом ≤ индекса последнего события этого runId. (б) иначе найти событие с `id === forkAt` или `clientEventId === forkAt` — включить до него включительно. (в) не нашли ничего — вернуть `[]` (ветка без наследования; не ошибку: родитель мог быть удалён, старые forkAt).
  `seedMessagesFromEvents`: `user` → `{role:'user', content: text, attachments?, origin?}`; по ранам: конкатенация `text-delta` одного runId → один `{role:'assistant', content}`. Служебные фреймы (`run.started`, `model.usage`, `model.stats`, `done`, `error`, `compaction`, `ask`, `hitl.answer`, `agent.handoff`, tool-события) в seed не попадают. Ран без text-delta не даёт assistant-сообщения.
- [ ] **Step 1:** написать `fork-logs.ts` (чистые функции, без IO). Порядок обхода — как в массиве (сервер отдаёт отсортированный по `timestamp, seq`).
- [ ] **Step 2:** в `get-thread.use-case.ts` — применить: если `thread.parentThreadId` и `forkAt`: загрузить события родителя (`this.runEvents.listByThread(thread.parentThreadId)`), `const inherited = cutParentEvents(parentEvents, thread.forkAt)`, вернуть `events: [...inherited, ...events]`, `inheritedEventCount: inherited.length`. Иначе `inheritedEventCount: 0`.
- [ ] **Step 3:** `bun run typecheck` + `bunx biome check apps/studio/server/application/threads`.
- [ ] **Step 4: Commit** `feat(studio): branch inheritance via forkAt cut in GetThreadUseCase`.

Замечание исполнителю: `GetThreadUseCase` вызывается часто (poll, refresh) — `cutParentEvents` линейна, N событий родителя; приемлемо. Кэш не вводить (YAGNI).

---

### Task 5: Studio server — seed первого snapshot'а ветки

**Files:**
- Create: `apps/studio/server/application/threads/seed-branch-state.use-case.ts` (+ порт в `apps/studio/server/domain/thread.port.ts` не нужен — порт отдельный)
- Create: `apps/studio/server/domain/branch-state-seeder.port.ts`
- Modify: `apps/studio/server/adapters/studio-run-targets.adapter.ts` (вызов seeder в `resolve`)
- Modify: `apps/studio/server/composition/studio.ts` / `wire-controllers.ts` (сборка; seeder получает ThreadRepository + RunEventStore + RuntimeStateRepo)

**Interfaces:**
- Consumes: `seedMessagesFromEvents` из Task 4; `RuntimeState` порт; `ThreadRepository`; `RunEventStore`.
- Produces: порт
  ```ts
  export interface BranchStateSeeder {
    /** Идемпотентно: пишет seed snapshot ветке без snapshot'ов. Вызывается перед claim/exec. */
    seedIfNeeded(threadId: string): Promise<void>;
  }
  ```
  `StudioRunTargets.resolve` вызывает `await this.deps.branchSeeder.seedIfNeeded(threadId)` до `runtimeStates.forState(threadId)`.

- [ ] **Step 1:** порт `branch-state-seeder.port.ts` (чистый интерфейс, по образцу соседних `*.port.ts`).
- [ ] **Step 2:** use-case `SeedBranchStateUseCase`:
  1. `thread = threads.findById(threadId)`; если нет, или `!thread.parentThreadId`, или `!thread.forkAt` — return.
  2. `state = runtimeStates.forState(threadId)`; `if (await state.load() !== null) return;` — уже есть snapshot (первый ран прошёл или compaction) → не трогаем.
  3. `parentEvents = runEvents.listByThread(thread.parentThreadId)`; `inherited = cutParentEvents(parentEvents, thread.forkAt)`; `messages = seedMessagesFromEvents(inherited)`; пусто → return (snapshot останется пустым, граф отработает как обычный новый тред).
  4. Commit: 
     ```ts
     await state.commit(
       { sessionId: state.sessionId, runId: crypto.randomUUID(), definitionHash: '', planHash: '', sequence: 0, status: 'idle', runtimeVersion: 'seed', initialInput: null, state: { messages }, cursor: { nodes: {} }, artifacts: null },
       [], { kind: 'recorded', sequence: 0 },
     );
     ```
     Проверить форму `Snapshot`/`Cursor` (`packages/harnesys/src/domain/snapshot.ts`) и `CommitMeta` — поля сверить с `mkSnap` (`graph-snap.ts:28`). `definitionHash`/`planHash` пустые: `startGraph` их не сверяет при load (проверить! если сверяет — подставить фактические из `compileOrThrow`; сверка хэшей ищется грепом `definitionHash` в `graph.ts`/`run-engine.ts`).
  5. Гонка двух параллельных resolve: повторный `load() !== null` после commit — ок; commit с тем же sequence 0 идемпотентен (`onConflictDoUpdate` в `sqlite-runtime-state.repo.ts:41-48`). Одиночный writer на тред гарантируется lifecycle.
- [ ] **Step 3:** `studio-run-targets.adapter.ts`: добавить dep `branchSeeder: BranchStateSeeder`, вызвать первым делом в `resolve`. Посмотреть конструктор и место сборки (`composition/studio.ts`), добавить провод.
- [ ] **Step 4:** `bun run typecheck`, `bunx biome check apps/studio/server`.
- [ ] **Step 5: Commit** `feat(studio): seed branch thread state from parent log before first run`.

---

### Task 6: Studio server — SSE живых событий спавна

**Files:**
- Modify: `apps/studio/server/application/threads/stream-run-events.use-case.ts`
- Modify: `apps/studio/server/adapters/store/sqlite/repos/sqlite-run-events.adapter.ts` (если нужен exists-запрос)
- Modify: `apps/studio/server/domain/` — при необходимости расширение порта `RunEventStore` НЕ делать; exists — методом use-case deps.

**Interfaces:**
- Consumes: `run_events` (у спавнов есть строки с `runId = spawnId`, `threadId` родителя), `feed.subscribe`.
- Produces: `GET /api/runs/:runId/events` теперь отвечает и для spawnId.

- [ ] **Step 1:** расширить порт `RunEventStore` (harnesys, `ports/run-event-store.ts`) методом `hasRun(runId: string): Promise<boolean>` (санкция спеки; sqlite-реализация: `SELECT 1 FROM run_events WHERE run_id = ? LIMIT 1`). В `StreamRunEventsUseCase` (добавить dep `runEvents: RunEventStore`) заменить проверку `lifecycle.get(runId)`: если run-записи нет, проверить `hasRun(runId)`; и там и там пусто — `NotFoundError` как сейчас.
- [ ] **Step 2:** `thread.stream-sse.ts` — проверить, что terminal-логика не завязана на lifecycle-запись спавна (у спавна её нет): если завязана — для отсутствующего run-рекорда стрим закрывать по feed-терминалу (`agent.completed`/`agent.failed` для спавна) без попыток lifecycle. Прочитать файл и адаптировать минимально.
- [ ] **Step 3:** `bun run typecheck`, biome, `curl -N localhost:3000/api/runs/<spawnId>/events` при живом стенде (если хозяин поднял) — ручная проверка в Task 12.
- [ ] **Step 4: Commit** `feat(studio): stream spawn run events over existing SSE route`.

---

### Task 7: Studio client — spawn-группы и карточка спавна в ленте

**Files:**
- Create: `apps/studio/client/src/widgets/chat-transcript/model/spawn-groups.ts`
- Modify: `apps/studio/client/src/widgets/chat-transcript/model/turn-segments.ts` (сегмент `spawn`)
- Modify: `apps/studio/client/src/widgets/chat-transcript/ui/turn-segments-view.tsx` или `agent-turn.tsx` (рендер сегмента)
- Create: `apps/studio/client/src/widgets/chat-transcript/ui/spawn-card.tsx`
- Modify: `apps/studio/client/src/widgets/chat-transcript/index.ts` (экспорт `openSpawnView`-хелпера, если нужен Task 8)

**Interfaces:**
- Consumes: `agent.spawned/completed/failed` события (Task 1) в `useSessionStore.events[threadId]`.
- Produces:
  ```ts
  export type SpawnInfo = {
    spawnId: string;
    agentId: string;
    status: 'running' | 'done' | 'failed';
    lastActivity: string; // короткая строка: последний text-delta или имя последнего tool
  };
  /** Извлекает спавны из лога и убирает их события из основной ленты. */
  export function extractSpawns(events: SessionEvent[]): { feedEvents: SessionEvent[]; spawns: SpawnInfo[] };
  ```
  Правила: событие `agent.spawned` открывает спавн (`agentId`, `spawnId`); `agent.completed`/`agent.failed` закрывают статус. События с `runId` из множества spawnId (активность детей) в `feedEvents` не попадают. `lastActivity` — по событиям этого spawnId: последний `text-delta` (обрезка ~60 символов) или `name` последнего `tool`.
  Сегмент: `groupSegments` при `ev.type === 'agent.spawned'` пушит `{ type: 'spawn'; spawnId: string; seq?: number }`. Рендер в `TurnSegmentView` → `SpawnCard` (см. ниже).

- [ ] **Step 1:** `spawn-groups.ts` — чистая функция; юнит-проверок нет (запрещены), проверка ручная.
- [ ] **Step 2:** сегмент в `turn-segments.ts`: новый вариант `{ type: 'spawn'; spawnId: string }`, кейс в `groupSegments` (после handoff), ключ в `segmentKey` (`spawn-${spawnId}`), spacing как у handoff.
- [ ] **Step 3:** `spawn-card.tsx`: props `{ threadId: string; spawnId: string; spawn: SpawnInfo; onOpen: (spawnId: string) => void }`. Имя агента — из `useAgentStore.byId(agentId)?.name` (fallback `agentId.slice(0,8)`). Строка: точка-статус (running — `var(--live)` с пульсацией, done — muted, failed — destructive), имя, `lastActivity` truncate. Клик по строке → `onOpen(spawnId)`. `data-testid="spawn-card"`, строки `data-testid="spawn-row-${spawnId}"`.
- [ ] **Step 4:** вставка в рендер тиranа: `ThreadPanel`/`RunTurn` передают `extractSpawns`-данные? Нет — сегменты строятся внутри рана из его событий; `agent.spawned` остаётся в `feedEvents` (это событие runId родителя), активность детей вычищена. `TurnSegmentView` получает коллбек `onOpenSpawn` через props-цепочку `ThreadPanel → RunTurn → AssistantMessageView → TurnSegmentView`. В `RunTurn`/`thread-panel.tsx` прогнать `events` через `extractSpawns` ОДИН раз (memo по событиям) и отфильтрованный массив отдать в `splitRuns`.
- [ ] **Step 5:** `ThreadJournal` (`widgets/thread-journal`) получает то же бесплатно через `RunTurn` — проверить, что его события тоже проходят фильтр `extractSpawns` (он делает свой `splitRuns(events)` — обернуть так же).
- [ ] **Step 6:** `bun run typecheck`, biome. Ручная проверка откладывается до Task 12.
- [ ] **Step 7: Commit** `feat(studio): spawn card in transcript with per-spawn status`.

---

### Task 8: Studio client — спавн-вью (read-only вкладка)

**Files:**
- Modify: `apps/studio/client/src/features/ide/model/ide.store.ts` (`IdeTabKind`, `IdeTab`, `openSpawn`)
- Modify: `apps/studio/client/src/widgets/ide-tabs/ui/tab-meta.tsx` (лейбл/иконка)
- Create: `apps/studio/client/src/widgets/chat-transcript/ui/spawn-view.tsx`
- Modify: `apps/studio/client/src/widgets/ide-content/ui/ide-content.tsx` (ветка `tab.kind === 'spawn'`)
- Modify: `apps/studio/client/src/widgets/chat-transcript/index.ts` (экспорт `SpawnView`)
- Modify: `apps/studio/client/src/features/ide/model/ide-sync.ts` — проверить, что URL-синхронизация не ломается на новом kind (если маппинг kind↔URL исчерпывающий — добавить вариант).

**Interfaces:**
- Consumes: `SpawnInfo` (Task 7), `useSessionStore.events[threadId]`, `connectThreadRun(threadId, spawnId)` (Task 6 открыл SSE).
- Produces: `IdeTabKind = 'thread' | 'file' | 'spawn'`; `IdeTab.spawnId?: string`; action `openSpawn(workspaceId: string, agentId: string, threadId: string, spawnId: string): void` (tab id `spawn:${threadId}:${spawnId}`, апсерт как `openThread`).

- [ ] **Step 1:** ide.store: расширить типы и action по образцу `openThread` (206-211), `tabIdFor('spawn', \`${threadId}:${spawnId}\`)`. `closeByEntity`/persist работают по id — проверить, что не завязаны на kind.
- [ ] **Step 2:** tab-meta: `tab.kind === 'spawn'` → лейбл: имя агента из `useAgentStore.byId(tab.agentId)` (fallback `'Spawn'`), иконка — `WorkflowIcon` (lucide) muted.
- [ ] **Step 3:** `spawn-view.tsx`: props `{ tab: IdeTab; threadId: string; spawnId: string }`. Внутри: события треда из session store; фильтрация через `extractSpawns` из Task 7 (получить `spawns` для текущего треда, собрать множество `spawnIds`, взять события `runId === spawnId || spawnIds.has(runId)` — вложенные спавны видны карточками тем же механизмом), `splitRuns` → `RunTurn` (реиспольз, без message-actions — прокинуть `readOnly` проп или не передавать onBranch/onDelete), без композера и HitlPrompt. Хедер вкладки не нужен. Заголовок-строка сверху: имя агента + статус (из `extractSpawns`). Live: `useEffect` → `connectThreadRun(threadId, spawnId)` пока спавн running (статус из extractSpawns), disconnect при терминале (`finishRun` уже есть в registry).
- [ ] **Step 4:** ide-content: ветка
  ```tsx
  if (tab.kind === 'spawn' && tab.threadId && tab.spawnId) {
    return <SpawnView tab={tab} threadId={tab.threadId} spawnId={tab.spawnId} />;
  }
  ```
- [ ] **Step 5:** провязать `onOpenSpawn` из Task 7. Общий хелпер перехода создать в `features/ide/model/open-ide.ts` (файл существует, `useOpenIdeTab` там) и экспортировать из `features/ide/index.ts`:
  ```ts
  export function openThreadTab(workspaceId: string, agentId: string, threadId: string): void
  // useIdeStore.openThread(...) + setActive + useStudioNavigation().openThread(...)
  export function openSpawnTab(workspaceId: string, agentId: string, threadId: string, spawnId: string): void
  // useIdeStore.openSpawn(...) + setActive + навигация
  ```
  Точная навигационная механика — по образцу `goTo` из удаляемого `thread-header.tsx:40-47`. `thread-panel.tsx` строит `onOpenSpawn = (spawnId) => openSpawnTab(workspaceId, agentId, threadId, spawnId)`.
- [ ] **Step 6:** `bun run typecheck`, biome.
- [ ] **Step 7: Commit** `feat(studio): read-only spawn view as IDE tab`.

---

### Task 9: Studio client — наследованная история и разделитель ветки

**Files:**
- Create: `apps/studio/client/src/widgets/chat-transcript/ui/fork-separator.tsx`
- Modify: `apps/studio/client/src/widgets/chat-transcript/ui/thread-panel.tsx` (мьют-обёртка + разделитель + скрытие actions)
- Modify: `apps/studio/client/src/widgets/agent-turn.tsx` / `message-actions.tsx` (prop `inherited`)

**Interfaces:**
- Consumes: `Thread.inheritedEventCount` (Task 3), события ветки уже склеены сервером (Task 4).
- Produces: read-only унаследованная зона + кликабельный разделитель.

- [ ] **Step 1:** `thread-panel.tsx`: `inheritedCount = thread.inheritedEventCount ?? 0`. События → runs (`splitRuns`). Runs с кумулятивным индексом событий < inheritedCount — унаследованные. Проще и надёжнее: резать по событиям — первые `inheritedCount` элементов `events` (сервер гарантирует порядок `[...inherited, ...own]`) образуют inherited-массив; `splitRuns` звать на каждом куске отдельно. Рендер: inherited-руns обёрнуты в `<div className="opacity-60 pointer-events-none select-none">` с исключением: интерактивные элементы внутри (кнопки tool-detail) не должны получать клики — `pointer-events-none` на контейнере решает; hover-actions (MessageActions) скрыть пропом `inherited` (не рендерить).
- [ ] **Step 2:** `fork-separator.tsx`: между зонами. Вид: тонкая линия по центру, слева иконка `GitBranchIcon size-3.5`, текст «Ветвление отсюда», кнопка «Открыть родителя» (muted → hover foreground). Клик — переход к родителю: механика `goTo` из удаляемого хедера (Task 11) — `useIdeStore.openThread(workspaceId, parent.agentId, parent.id)` + `useDeskStore.setFocusedThreadId` + `openThread` из `useStudioNavigation`. Props: `{ parentThreadId: string; parentAgentId: string; parentTitle?: string }`. `data-testid="fork-separator"`, кнопка `data-testid="fork-open-parent"`. Появляется только если `inheritedCount > 0 && thread.parentThreadId`. ВАЖНО: если inherited пуст (родитель удалён/старая ветка), разделитель не рендерится.
- [ ] **Step 3:** MessageActions: проп `inherited?: boolean` — `if (inherited) return null;` (hover-меню ветвления/удаления в прошлом недоступны). Прокинуть через `RunTurn`/`AssistantMessageView` для унаследованных runs.
- [ ] **Step 4:** composer работает как обычно — ветка отвечает дальше, контекст у агента есть (Task 5).
- [ ] **Step 5:** `bun run typecheck`, biome.
- [ ] **Step 6: Commit** `feat(studio): muted inherited history and fork separator in branch threads`.

---

### Task 10: Studio client — значок ветвления на опорном сообщении

**Files:**
- Modify: `apps/studio/client/src/widgets/chat-transcript/ui/thread-panel.tsx` (вычислить fork-индексы)
- Modify: `apps/studio/client/src/widgets/chat-transcript/ui/agent-turn.tsx`, `run-turn.tsx` (проп `branchChildren`)
- Create: `apps/studio/client/src/widgets/chat-transcript/ui/branch-point-badge.tsx`

**Interfaces:**
- Consumes: `useThreadStore` items (дети: `parentThreadId === thread.id`, поля `forkAt`, `agentId`, `title`).
- Produces: значок «⎇ N» на сообщении/ране, от которого есть ветки; клик — список/переход.

- [ ] **Step 1:** в `thread-panel.tsx`: `const children = items.filter(t => t.parentThreadId === thread.id)`. Сопоставление forkAt → позиция в ленте. Доминирующий кейс: ветвление от рана — forkAt совпадает с `runId` группы; для каждого ребёнка найти run-группу с таким id и передать в её `RunTurn` пропы `branchCount` и `branchChildren: {id, agentId, title}[]`. Редкий кейс event-id: forkAt совпадает с `id`/`clientEventId` события user-сегмента — пометить соответствующий user-сегмент. Пропы пробрасываются `ThreadPanel → RunTurn → AssistantMessageView` (ран-кейс) и `ThreadPanel → RunTurn → TurnSegmentView` (user-кейс).
- [ ] **Step 2:** `branch-point-badge.tsx`: значок рядом с метаданными сообщения (рядом с MessageActions): `⎇ {n}` (GitBranchIcon + число). Наведение — tooltip со списком `title` детей; клик — если один ребёнок: переход сразу; если несколько — маленький dropdown (shared/ui dropdown-menu) со списком. Переход — та же механика `goTo`/`openSpawnTab`-хелпер из Task 8 (общий хелпер перехода `openThreadTab(workspaceId, agentId, threadId)` — вынести в `features/ide` index, чтобы не дублировать в fork-separator).
- [ ] **Step 3:** унаследованная зона тоже помечается (дерево рекурсивно) — badge работает одинаково, но в inherited зоне обёртка `pointer-events-none`… исключение: badge должен кликаться → рендерить badge ВНЕ мьют-обёртки невозможно (он в карточке рана). Решение: мьют-обёртке не глушить pointer-events у badge: обёртка `pointer-events-none`, а badge — `pointer-events-auto`. Проверить tooltip/dropdown внутри.
- [ ] **Step 4:** `bun run typecheck`, biome.
- [ ] **Step 5: Commit** `feat(studio): branch point badge on forked messages`.

---

### Task 11: удаление ThreadHeader + дерево в сайдбаре

**Files:**
- Delete: `apps/studio/client/src/widgets/chat-transcript/ui/thread-header.tsx`
- Modify: `apps/studio/client/src/widgets/chat-transcript/index.ts` (убрать экспорт)
- Modify: `apps/studio/client/src/widgets/ide-content/ui/ide-content.tsx` (убрать `<ThreadHeader>` в обоих местах, импорт)
- Modify: `apps/studio/client/src/widgets/workspace-sidebar/ui/agent-threads-panel.tsx` + `agent-thread-row.tsx` (дерево)

**Interfaces:**
- Consumes: `openThreadTab` хелпер (Task 10) — в сайдбаре он уже есть через `openThread` action.
- Produces: дерево тредов в сайдбаре.

- [ ] **Step 1:** удалить `thread-header.tsx` и экспорт; вычистить импорты в ide-content (два места рендера — строки 38 и 49). Грепнуть `ThreadHeader` по репо — не должно остаться ссылок. Бейдж-тесты `thread-header`/`thread-parent-link` в e2e-фикстурах? Тестов нет — проверить грепом `thread-parent-link` (если всплывут упоминания в доках — не трогать доки).
- [ ] **Step 2:** дерево в `agent-threads-panel.tsx`: вместо плоского `map` — построить дерево:
  ```ts
  type TreeNode = { thread: Thread; children: TreeNode[] };
  // roots: parentThreadId == null; node children: parentThreadId === node.thread.id, сорт по createdAt asc
  // roots сорт: pinned desc, затем updatedAt desc (текущее поведение)
  ```
  Рекурсивный рендер: корневые — как сейчас; ребёнок — обёртка `ml-5 border-l border-border/60 pl-3` (тонкая направляющая линия, как в дерева файлов), глубина любая (рекурсия). Строку узла оставить от `AgentThreadRow`, НО вычистить: бейдж `branch` (105-112), счётчик детей (113-120), мета `← parent title` (125), меню-айтемы Open parent/Open child (156-167), иконку `GitBranchIcon` вместо kind-иконки заменить на маленький `⎇` слева от заголовка ветки (или `data-branch` оставляем для стилистики — оставить только малый значок). `data-testid`: корень `agent-thread-${id}` сохранён; у веток — тот же тестид (id уникален).
- [ ] **Step 3:** падение производительности не ожидается: N тредов мало; фильтрация детей в memo по items.
- [ ] **Step 4:** `bun run typecheck`, biome, греп `ThreadHeader` = 0.
- [ ] **Step 5: Commit** `refactor(studio): drop thread header, sidebar thread tree`.

---

### Task 12: сквозная ручная проверка и чистка

**Files:** только фиксации найденных багов.

- [ ] **Step 1: поднять/проверить стенд.** `lsof -iTCP:3000 -iTCP:5173 -sTCP:LISTEN` — если хозяин держит стенд, использовать его; если нет — спросить.
- [ ] **Step 2: сценарий ветки.** agent-browser: тред с парой обменов → «ответвиться» от ответа агента → ветка открылась: сверху приглушённая история, разделитель, ниже пустая активная зона → написать вопрос, сформулированный как продолжение («а теперь сделай то, что я просил») → агент отвечает с учётом прошлого (контекст seed работает). Проверить «Открыть родителя».
- [ ] **Step 3: сценарий спавна.** Взять агента с `control:spawn` в графе (или сделать пресет): запустить → карточка «Сабагенты» появляется ДО завершения (статус running, lastActivity живёт) → клик → спавн-вью с активностью → после завершения карточка показывает done → повторный вход в спавн-вью показывает историю.
- [ ] **Step 4: сценарий дерева.** Вторая ветка от того же сообщения → сайдбар: обе под родителем с отступом; badge «⎇ 2» на опорном сообщении; переходы в обе стороны.
- [ ] **Step 5: регресс.** Обычный тред: лента без хедера, композер, HITL-карточки, handoff-карточка, compaction — не сломались. Schedule-тред (ThreadJournal) с ветвлением от wake-сообщения. Удаление родителя при живой ветке: ветка открывается, история пустая + разделителя нет, ран работает.
- [ ] **Step 6: чистка.** `bunx biome check .` на весь монорепо; `bun run typecheck`; grep хвостов: `ThreadHeader`, `thread-parent-link`, `GET /threads/:id/spawns` (в спеке endpoint был, в реализации заменён на события — убедиться, что в коде его нет).
- [ ] **Step 7: Commit** (если были фиксы) и отчёт хозяину: что проверено, какие отклонения от спеки (endpoint `/spawns` не нужен — статус и активность берутся из журнала; вложенные спавны видны на 1 уровень в карточке, глубже — в спавн-вью соответствующего уровня).

## Отклонения от спеки (зафиксировать в спеке после реализации)

1. `GET /threads/:id/spawns` не вводится: список спавнов, статусы и активность полностью выводятся из журнала (`agent.spawned/completed/failed` + события `runId = spawnId`), отдельный endpoint избыточен.
2. Порт `RunEventStore` harnesys расширяется методом `hasRun(runId)` (SSE для спавнов) — санкция спеки покрывает.
3. `agent.spawned` несёт `taskInput` (полный input вызова, без усечений) — задача видна из журнала, снапшоты не читаются.

---

### Task 13: taskInput спавна в журнале + чтение в клиенте

**Files:**
- Modify: `packages/harnesys/src/application/graph-spawn.ts` (prepareSpawn: таскать `call` дальше — уже есть в targets), `packages/harnesys/src/application/graph.ts` (spawned-коммит), `packages/harnesys/src/ports/session.ts` (вариант agent.spawned), `packages/harnesys/src/application/run-engine-events.ts` (маппинг)
- Modify: `apps/studio/client/src/widgets/chat-transcript/model/spawn-groups.ts` (SpawnInfo.taskText), `apps/studio/client/src/widgets/chat-transcript/ui/spawn-view.tsx` (шапка с полным текстом задачи)

**Interfaces:**
- Produces: `SessionEvent` вариант `agent.spawned` расширяется полем `taskInput?: unknown`. `SpawnInfo` расширяется `taskText?: string`. Правило вывода текста (клиент, display-only): string → как есть; объект с `messages` (массив, у первого `content` строка) → этот content; иначе компактный JSON (для UI допустим truncate 300 символов — ДАННЫЕ при этом целы в журнале, режется только отображение со ссылкой «показать полностью» в спавн-вью).

**Жёсткие правила:**
- НИКАКИХ усечений при записи в журнал: `call.input` целиком в metadata эмиссии. Metadata сериализуется в JSON журнала как есть.
- `call.input` приходит из tool-args (уже JSON) — дополнительная валидация не нужна; `undefined` → поле отсутствует.

- [ ] **Step 1: harnesys.** В graph.ts spawned-коммит: `metadata: { agentId, spawnId, taskInput: t.call.input }` (`undefined` JSON-строка дропает ключ — ок). Порт session.ts: `taskInput?: unknown` в вариант agent.spawned. Маппер run-engine-events.ts: пробросить `taskInput: m?.taskInput` (без преобразований).
- [ ] **Step 2: клиент extractSpawns.** `SpawnInfo.taskText?: string`; при обработке `agent.spawned` вывести текст по правилу выше. Пустой результат → поле отсутствует (карточка прячет строку).
- [ ] **Step 3: SpawnView шапка.** Найти в логе треда `agent.spawned` с этим spawnId → показать полный текст задачи (без truncate, collapsible при длине > 500 символов). Fallback: шапка без задачи.
- [ ] **Step 4: Верификация.** `bunx tsc -p apps/studio/tsconfig.json --noEmit` clean; client tsconfig — только pre-existing git-file-decorations; biome на затронутых.
- [ ] **Step 5: Commit** `feat(harnesys,studio): carry spawn taskInput in agent.spawned journal event`.

---

### Task 14: SpawnCard v2 + live-время

**Files:**
- Modify: `apps/studio/client/src/widgets/chat-transcript/model/spawn-groups.ts` (toolStats), `apps/studio/client/src/widgets/chat-transcript/ui/spawn-card.tsx` (переписать), `apps/studio/client/src/entities/session/model/session.store.ts` (arrival-метки)
- Create: `apps/studio/client/src/widgets/chat-transcript/model/use-now.ts` (тикающий хук, если нет общего)

**Interfaces:**
- Consumes: SpawnInfo (+taskText, toolStats) из Task 13/7; arrival map `seenAt: Record<eventKey, number>` из session store (заполняется в appendEvent/replaceEvents: `Date.now()`; reconcile — только для новых ключей).
- Produces: карточка: шапка (пульс, имя, elapsed, шаги), строка задачи (truncate 2 строки), живые tool-чипы (последние 4: имя + фаза), reasoning/text-превью, токены из model.usage, stalled-хинт (running + тишина > 90с → «нет активности Ns»).

**Жёсткие правила:**
- Arrival-метки — только live (история их не имеет и не нуждается).
- ToolStats: считать по событиям бакета: `{ [name]: { requested, completed, failed } }`, последние 4 tool-события с фазой, общий счётчик шагов = tool requested + assistant text-блоков.

- [ ] **Step 1: session store.** `seenAt` + заполнение в appendEvent (и replaceEvents/reconcileEvents для новых ключей). Проверить eventKey (session.store.ts:49-61) — переиспользовать.
- [ ] **Step 2: spawn-groups.** toolStats + steps + tokens (сумма model.usage) в SpawnInfo.
- [ ] **Step 3: spawn-card.tsx.** Переписать по дизайну выше. Клик → onOpenSpawn (как сейчас). testids сохранить (`spawn-card`, `spawn-row-${spawnId}`).
- [ ] **Step 4: Верификация** (tsc/biome как обычно).
- [ ] **Step 5: Commit** `feat(studio): rich spawn card with task, tools and live timing`.
