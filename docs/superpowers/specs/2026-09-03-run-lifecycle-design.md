# Run lifecycle: единый владелец состояния рана

Дата: 2026-09-03. Статус: утверждено в диалоге, спека.
Вход: `review_consolidated.md` (22 пункта P0-P2, сверены с кодом 2026-09-03).
Решения, принятые человеком: вариант B (полная персистентность жизненного цикла), ядро через порты в `packages/harnesys`, ручной перезапуск running-ранов после падения узла, федерация узлов отдельной спекой, обратной совместимости и миграторов нет, dev-БД пересоздается.

## Проблема

Четыре частичные модели состояния рана: `RunEngine` (поля экземпляра), `ActiveRunRegistry` (in-memory), `drainAgentRun` (жизнь SSE-цикла), клиентский `session.store`. Ни одна не владеет правдой. Следствия: невозможный resume ReAct-агента, шторм `/resume`, молчаливые no-op команд, потеря `options/multi` ask-схемы, дубли событий, orphan tool_use, гонки recover. Полный список: `review_consolidated.md` разделы 1-3.

## Целевая модель

Единственный владелец состояния рана: таблица `runs` в БД через порты библиотеки. In-memory структуры производны и восстанавливаемы. Движок: чистая машина состояний без собственной памяти. Studio реализует порты на SQLite; федерация узлов (вторая спека) переиспользует те же порты с другими адаптерами.

### RunRecord

```
runs: runId (pk), threadId, status, interruptId?, appliedResume?,
      leaseNodeId?, leaseExpiresAt?, lastSeq, createdAt, updatedAt
```

Статусы: `running | needs_input | completed | failed | cancelled`. Терминальные иммутабельны: transition с терминального отклоняется кодом `run_terminal`. `lastSeq` монотонно растет с записью событий. `appliedResume` — canonical JSON последнего примененного resume-payload, для идемпотентности повторных respond.

### Lease

Узел-исполнитель продлевает lease (`leaseNodeId`, TTL 15с, продление каждые 5с) пока ран исполняется; продление ведет `RunEngine` на время активного сегмента. Running с невалидным lease = узел умер: ран можно взять заново вручную (retry) или оставить до отмены. `needs_input` исполняется без lease; его возьмет любой узел при ответе пользователя. Два узла не могут исполнять один ран: второй получает `lease_held` → HTTP 409. При старте процесса незавершенные раны с истекшим lease остаются `running`, UI показывает `leaseExpired: true` и кнопку retry. Авто-догона нет (решение человека).

### Порты (packages/harnesys/src/ports/)

`run-lifecycle-store.ts`:

```ts
export type RunRecord = {
  runId: string;
  threadId: string;
  status: RunLifecycleStatus; // 'running' | 'needs_input' | 'completed' | 'failed' | 'cancelled'
  interruptId?: string;
  leaseNodeId?: string;
  leaseExpiresAt?: number;
  lastSeq: number;
  createdAt: string;
  updatedAt: string;
};

export interface RunLifecycleStore {
  create(run: { runId: string; threadId: string }): Promise<RunRecord>;
  get(runId: string): Promise<RunRecord | null>;
  /** Не-терминальный ран потока, если есть. */
  activeByThread(threadId: string): Promise<RunRecord | null>;
  /** Атомарный переход статуса. Ошибка coded 'run_terminal' | 'already_resumed' при конкуренции. */
  transition(
    runId: string,
    from: RunLifecycleStatus,
    to: RunLifecycleStatus,
    patch?: { interruptId?: string | null; appliedResume?: string | null },
  ): Promise<RunRecord>;
  tryAcquireLease(runId: string, nodeId: string, ttlMs: number): Promise<boolean>;
  renewLease(runId: string, nodeId: string, ttlMs: number): Promise<boolean>;
  listExpiredLeases(): Promise<RunRecord[]>;
}
```

`run-event-store.ts`:

```ts
export interface RunEventStore {
  /** Пишет события с монотонными seq внутри рана, обновляет runs.lastSeq. Одна транзакция. */
  append(runId: string, events: SessionEvent[]): Promise<void>;
  tail(runId: string, fromSeq: number): Promise<SessionEvent[]>;
  latestSeq(runId: string): Promise<number>;
}
```

`SessionEvent` получает обязательное `seq: number` (номер в ране). Присваивает `RunEventStore.append`, не движок.

### RunEngine без памяти

Удаляются поля: `interrupt`, `applied`, `events` (in-memory replay), `idleWaits`-очередь как контракт. Движок на каждый переход читает `RunLifecycleStore`/`RunEventStore`:

- старт: `store.create(run)` → запуск сегмента графа;
- ask: `transition(needs_input)` с `interruptId`; схема interrupt хранится в снапшоте (`cursor.interrupt.resumeSchema`), она же источник при recover;
- respond/reject: `transition(needs_input → running, WHERE interruptId=?)` одним атомарным шагом. Дедуп по `interruptId`+`appliedResume` в БД, не в памяти: тот же payload → идемпотентный успех, другой → `already_resumed`, чужой interruptId → `unknown_interrupt`, терминальный ран → `run_terminal`. Silent no-op запрещены (1.5);
- recover(runId): валидация lease/статуса, восстановление `interrupt` из снапшота, никаких реэмитов ask (2.5): клиент получает ask через tail/reconcile;
- `command()` возвращает результат transition: ошибки кодированные, не молчаливые.

`SessionHandle.resume(runId)` приходит на смену `resume()` без аргумента; `session.ts` ожидает `engine.recover()` перед возвратом рана (`await`, не `void` — 1.3).

### Идемпотентность батча и чекпоинт ноды

Механизм approve (`approveStateKey`) обобщается до чекпоинта ноды: ключ state `$nodeCheckpoint_{nodeId}` = `{ completed: Record<callIdx, ToolCallResult>, pendingInterrupt?: { callIdx, interruptId } }`. Пишется перед каждым interrupt (approve, permission, ask_user в батче). Воркер, поймавший `AskUserInterrupt`, не роняет `Promise.all`: пул помечает вызов pending, доигрывает in-flight вызовы, сохраняет их результаты в чекпоинт, бросает interrupt. На resume нода восстанавливает чекпоинт и выполняет только незавершенные вызовы (1.2). Чекпоинт удаляется при успешном завершении ноды.

### HITL-схема

Новый `packages/harnesys/src/application/ask-schema.ts`:

```ts
export function askUserSchema(input: {
  options?: Array<{ id: string; label: string }>;
  multi?: boolean;
  allowText?: boolean;
}): JsonSchema;
```

`options` заданы → схема включает `optionIds` с `items.enum = ids`, `maxItems: 1` при `multi: false`. Валидация подмножества опций декларативна (2.2). `AskUserInterrupt` теряет поля `options/multi` (часть `resumeSchema`); полная схема с опциями пишется в `cursor.interrupt.resumeSchema` и в metadata события (2.1 единым местом). `run-engine-events.ts` сохраняет слияние `meta.options` при чтении старых строк. `resumeSchema()`-вырезание опций в движке удаляется; Ajv strict:false игнорирует служебные ключи. Единая точка валидации resume: движок перед `launchSegment` ( graph.ts дублирующую проверку при entry удалить).

Permission gate: ветка `gate === 'ask'` в `tool-call.ts` бросает `AskUserInterrupt` с `source:'permission'`, `tool`, схемой `{approved: boolean}` через `askUserSchema`-механику approve. Resume `approved:true` → исполнение вызова; `false` → tool-сообщение «denied by user» + `tool.skipped` (1.6).

Reject: в skip-entry ветке `graph.ts` для `tool:call` при `rejected:true` берутся `toolCalls` последнего assistant-сообщения, для каждого пишется tool-сообщение «rejected by user» и `tool.skipped` (2.4). История для провайдера всегда парная.

Resume ReAct (1.1): при старте сегмента с узла `tool:call` движок восстанавливает `output` из `toolCalls/finishReason` последнего assistant-сообщения в `$state.messages`.

## SSE и синхронизация

- SSE закрывается сервером на терминальном статусе и на `needs_input`: финальный кадр `ask`, затем служебный `event: run-paused`. Обрыв соединения на живом ране клиент трактует как разрыв, не как финиш (2.8).
- Кадры несут `id: seq`; `GET /runs/:id/events?fromSeq=N` отдает `tail(fromSeq)` из `RunEventStore`, затем живые. Клиент хранит `lastSeq` на ран, reconnect шлет `fromSeq` (2.6). После успешного respond на паркованном ране клиент переподключается к SSE того же рана с `lastSeq` и получает `resumed` и хвост исполнения.
- `run.resumed` персистится как обычное событие со seq, `rowToSessionEvent` маппит; клиент снимает pending-карточку на `resumed` (2.3).
- `send` при `activeByThread` → 409 с `pendingAskId` (если `needs_input`) или `runId` (если running с валидным lease); параллельные send атомарны через `create`+уникальность (2.9). `PendingHitlError`/`ThreadBusyError` маппятся в 409.
- recover не реэмитит ask (2.5).

## HTTP-контракт

- `GET /api/threads/:id`: `ThreadRecord.activeRun: { runId, status, leaseExpired? } | null` из `activeByThread`. Клиент после reload знает runId (корень 1.4).
- `POST /api/threads/:id/resume` идемпотентен:
  1. active ран `needs_input` → 202 `{runId, status:'paused', resumed:false}`;
  2. active `running` с валидным lease → 409 `{runId, status:'running'}`;
  3. active `running` с истекшим lease → `tryAcquireLease` (атомарно) → успех: 202 `{runId, status:'resumed', resumed:true}`, `handle.resume(runId)`; занято → ветка 2;
  4. нет active рана → 404; терминальный → 409 `run_terminal`.
- `POST /api/runs/:id/respond|reject`: коды движка в HTTP: `unknown_interrupt` → 409, `run_terminal` → 409, `already_resumed` → 200 идемпотентный успех (3.8), `resume_validation_failed` → 400. Слепой `{ok:true}` удален.
- Клиент: 409 на resume с `runId` → подключиться к SSE этого рана, не ретраить; in-flight guard и backoff в `RunStreamClient`.

## Ресурсы и хвосты

- Replay-буферы: источник правды `RunEventStore`; in-memory буфер реестра — кольцевой, 500 событий на ран, только для переподключений в пределах процесса (3.1, 3.2).
- TTL ask: `needs_input` старше `ASK_TTL` (дефолт 7 дней) → тикер переводит в `cancelled` с событием кода `ask_expired` (3.3). Running с истекшим lease не GC-ится до ручного retry/отмены; в `activeRun` отдается `leaseExpired: true`.
- `finish()` реестра вычисляет idle по `runs` (есть ли не-терминальный ран потока), не по записям реестра (2.8 хвост).
- `tokens` без usage не растет (3.5). Мертвый `if` фоллбека удаляется (3.6). `resolveConcurrency` без дубля проверки (3.7). Tooltip композера (3.10). Union `HitlPayload` в shared для payload Confirm/Ask (3.9).
- `publishDeskThread` инкрементальный: заголовок потока + `latestSeq`, полное чтение только при первичной загрузке и reconcile (3.4).

## Клиент

- Один `RunStreamClient` (`features/send-message/model/run-stream-client.ts`): connect → apply → disconnect: reconnect с `fromSeq` (backoff, выход после N неудач) → `run-paused` → ожидание ответа → terminal: одноразовый reconcile `getThread`. `send-message.ts`, `drain-run-stream.ts`, `follow-live.ts`, `resume-paused.ts` заменяются тонкими вызовами; три источника ретрая исчезают (1.4 клиент).
- `reconcileEvents` с мерджем по seq вместо `replaceEvents`: серверные события по seq, оптимистичные не затираются, дубли отбрасываются; оптимистичное `user` с временной отрицательной seq заменяется серверным по совпадению текста (2.7).
- `pendingHitl` реагирует на `resumed`; union `HitlPayload` типизирует Confirm/Ask (3.9).

## Удаления

`resumeSchema()`-вырезание; поля `AskUserInterrupt.options/multi`; `SessionHandle.resume()` без runId; in-memory `applied`/`interrupt`/replay движка; `hitl-actions.ts` ensureLiveRun-ветка; `follow-live.ts` как отдельный поток; дублирующие ветки маппинга событий (маппинг один: `rowToSessionEvent` переиспользует конвертер библиотеки).

## Порядок работ

Фазы, внутри каждой порядок = зависимости, каждый коммит собирается (`bun run lint`, tsc):

1. Порты + SQLite-адаптеры (`runs`, seq на ран) + `RunEngine` без памяти + `SessionHandle.resume(runId)`.
2. HTTP: `activeRun`, идемпотентный `/resume`, respond/reject коды, send 409, `fromSeq`, реестр как локальный подписчик.
3. HITL: `ask-schema.ts`, чекпоинт ноды, permission ask, reject-сообщения, восстановление `output`, чистки graph.ts.
4. Клиент: `RunStreamClient`, `reconcileEvents`, обработка `resumed`/`run-paused`, удаление старых потоков, tooltip, `HitlPayload`.
5. GC: тикер TTL, `leaseExpired`, инкрементальный publish.

Проверка после фазы 4: флоу send → SSE → ask → respond → resumed, reload на parked ране, рестарт процесса, дабл-сабмит ответа.
