# Консолидированное ревью: флоу send → SSE → ask → respond → resumed

Все пункты сверены с кодом (пути и строки актуальны на 2026-09-03). Статусы:
**[BUG]** — подтвержденный дефект, **[RISK]** — подтвержденный риск/расхождение, **[DEBT]** — техдолг.
Переоцененные и неподтвердившиеся утверждения исходных ревью вынесены в конец.

---

## 0. Корневая архитектурная проблема

Ни один участник конвейера не владеет правдой о состоянии рана. Четыре частичные модели:
движок (`RunEngine`), реестр (`ActiveRunRegistry`), серверный дрейнер (`drainAgentRun`),
клиентский store (`session.store.ts`). Плюс `SessionHandle.session.ts` со своим `live`.
Все критичные баги ниже — следствия расхождения этих моделей. Починкой точечных багов
проблема не закрывается полностью: нужен один owner состояния рана, доступный по `threadId`
(см. план, фаза 1).

---

## 1. P0 — блокеры, ломающие основной флоу

### 1.1 [BUG] ReAct-граф невозобновляем: `$output.toolCalls` теряется при resume

- `graph-snap.ts:18` — `mkSnap` персистит только `state/cursor/budget`; `output` не пишется.
- `graph.ts:206` — `let output: unknown = null` создается заново на каждый `startGraph`.
- Прерывание происходит внутри узла `act`; при resume движок стартует с `startNodeId='act'` (`run-engine.ts:331`).
- `react-preset.ts:13` (apps/studio/server/application/agents) — узел `act`: `calls: '$output.toolCalls'`.
  `tool-call.ts:127` → `evalExpr('$output.toolCalls', slots)` при `output=null` → `unknown_path`
  (`expr-eval.ts:142` бросает) → `runSegment` ловит → `run.failed`.
- Итог: resume для ReAct-агента через узел `act` невозможен в принципе — после ответа пользователя ран умирает.

Фикс: при старте сегмента с `tool:call`-узла восстанавливать `output` из последнего
assistant-сообщения в `$state.messages` (там уже лежат `toolCalls`, `finishReason` —
`graph.ts:563-572`). Персистентность `output` в снапшот — альтернатива, но раздувает хранилище.

### 1.2 [BUG] `AskUserInterrupt` внутри параллельного батча: потеря результатов + двойные side effects

- `tool-call.ts:282-284` — `AskUserInterrupt` ре-бросается из `runOneRaw`; при `concurrency='parallel'`
  это роняет весь `Promise.all` воркеров (`tool-call.ts:415-420, 449+`).
- Результаты уже выполненных вызовов батча теряются (нигде не сохранены, кроме approve-ветки,
  у которой есть чекпоинт `approveStateKey` — `tool-call.ts:324-333`).
- При resume весь батч выполняется заново → повторные side effects (shell, write_file и т.п.).

Фикс: перед броском interrupt сохранять выполненные результаты в state (по аналогии с
approve-веткой), при resume доигрывать только незавершенные вызовы. Для обычного батча
(side-effect) нужен тот же механизм чекпоинта, что и для approve.

### 1.3 [BUG] Гонка `recover()` vs respond: команда застревает в очереди навсегда

- `session.ts:114` — `void engine.recover()` не awaited; `resume-thread-run.use-case.ts:114`
  регистрирует ран в `activeRuns` синхронно после `handle.resume()`.
- Дефолтный статус движка — `running` (`run-engine.ts:79`). `command()` (`run-engine.ts:371-376`)
  кладет respond в очередь; `drainQueue()` (`run-engine.ts:351-353`) видит `status==='running'` → `break`.
- `recover()` завершается через `notifyIdle()` (`run-engine.ts:176`), но **не вызывает `drainQueue()`**.
  Команда висит в очереди до конца «сегмента», которого нет (статус `needs_input`).

Фикс: `await engine.recover()` до `activeRuns.register` (вернуть промис из `createRun`) и/или
в конце `recover()` вызывать `void this.drainQueue()`.

### 1.4 [BUG] `POST /resume` неработоспособен для живого припаркованного рана → шторм resume

Серверная часть:
- `session.ts:146-151` — `resume()` бросает `ThreadBusyError`, если `live.status === 'needs_input'`
  (`isBusy`, `session.ts:50-52`). Т.е. `/resume` на живой parked ран **всегда 409** — по построению.
- `resume-thread-run.use-case.ts:69-71` — вторая проверка `findByThread` тоже отклоняет (запись
  в реестре жива, т.к. `drainAgentRun` висит в `run.stream()`, а `needs_input` не терминальный —
  `run-engine.ts:379`, `run-engine-stream.ts:38`).
- Старые engine не удаляются из `activeRuns`: каждый `handle.resume()` (`session.ts:112`)
  перезаписывает `live`, а запись под старым `runId` в реестре живет, пока открыт его SSE.

Клиентская часть:
- После reload страницы клиент **не знает `runId`** живого рана (хранится только в памяти
  zustand — `send-message.ts:50`, `getThread` его не возвращает). Единственный путь — `POST /resume`.
- `hitl-prompt.tsx:27-31` — эффект `pending && !streaming → resumePausedThread`; `resume-paused.ts:27-30`
  — при ошибке `finishRun` → `streaming` меняется → эффект срабатывает снова. In-flight флага,
  backoff и обработки 409 нет → бесконечный цикл запросов.
- Третий источник ретрая: `hitl-actions.ts:26-33` (`ensureLiveRun`), `follow-live.ts:18-21`.
- TOCTOU в `resume-thread-run.use-case.ts:69-114`: проверка `findByThread` и `register` разделены
  await-цепочкой — параллельные запросы оба проходят.

Фикс (сервер): `/resume` при живом parked ране должен возвращать **202 с существующим runId**
(идемпотентное подключение), а не 409; `findByThread` должен игнорировать `finished` записи;
`register`/проверку сделать атомарными.
Фикс (клиент): 409/202-с-чужим-runId → подключиться к SSE этого рана, не ретраить; in-flight guard
в `resumePausedThread`; backoff с выходом после N неудач.

### 1.5 [BUG] Молчаливые no-op в движке — «сервер проглатывает запросы»

- `run-engine.ts:283-285` — respond/reject с чужим/устаревшим `interruptId`: `return` без ошибки.
  Контроллер (`thread.controller.ts:165-171`) в любом случае отдает `{ok:true}` → 200.
- `run-engine.ts:355-357` — команды на терминальном ране молча `resolve()`.
- `run-engine.ts:276-279` — дедуп `applied` при том же payload тоже молчит.
- Клиент после такого «успеха» ждет `resumed`, которого не будет (см. 2.4).

Фикс: все три пути возвращают явную ошибку (`unknown_interrupt`, `run_terminal`, `already_resumed`),
мапятся в 400/409; клиент показывает toast.

### 1.6 [BUG] Permission gate `ask` не задействует HITL-пайплайн

- `tool-call.ts:212-227` — `gate==='ask'` возвращает tool-result строку `permission ask: …` с
  `isError:true, skipped:true`. Ни `AskUserInterrupt`, ни `needs_input`, ни события `ask`.
- При этом `permissionMapFor('ask')` (`tool-confirm-policy.ts`) ставит `ask` на `write_file`,
  `edit_file`, `shell`, `http` и хост-мутации — т.е. основной режим `mode='ask'` studio
  молча пропускает вызовы с ошибкой-строкой, модель ретраит вызов, цикл.
- `source: 'permission'` в `SessionEvent` (`ports/session.ts:40`) — мертвый код.

Фикс: ветка `gate==='ask'` должна бросать `AskUserInterrupt` с `source:'permission'`,
`resumeSchema: {approved:boolean}` — переиспользовать approve-механику (`tool-call.ts:336-383`).

---

## 2. P1 — существенные дефекты HITL-контракта и синхронизации

### 2.1 [BUG] Потеря `options/multi` у ask-схемы — три независимых пути

1. **Даже в живом флоу**: `graph.ts:659-672` кладет в снапшот `cursor.interrupt` только
   `resumeSchema` (без опций), опции — только в `metadata` события (`graph.ts:681-682`).
   `run-engine.ts:200-207` при парковке берет `schema = stored?.resumeSchema ?? mapped.schema` —
   `stored.resumeSchema` есть → схема **без `options`** кладется в `parkAsk`, хотя в SSE
   уходит `mapped` (с опциями, `run-engine-events.ts:139-146`).
2. **После recover**: `run-engine.ts:159` — схема из снапшота, `options/multi` потеряны.
3. **После reload/reconcile**: `get-thread.use-case.ts:155-165` маппит `interrupt.triggered`
   → `ask` с `schema = meta.resumeSchema` **без слияния** `meta.options`/`meta.multi`
   (в отличие от `run-engine-events.ts:140-146`). `replaceEvents` из reconcile
   (`send-message.ts:119`, `drain-run-stream.ts:41`) затирает живые события →
   `hitl-prompt.tsx:143` видит пустые `options`, рендерит только текстовое поле.

Фикс: в каноническом месте (снапшот или `get-thread`) объединять схему с `options/multi`;
лучше — хранить `options/multi` прямо в `cursor.interrupt.resumeSchema`, тогда все три пути
чинятся одним изменением записи (плюс убрать вырезание в `resumeSchema()` — см. 2.2).

### 2.2 [RISK] Валидация resume не проверяет `optionIds`

- `run-engine.ts:61-67` — `resumeSchema()` вырезает `options/multi` перед Ajv; дефолтная схема
  (`graph.ts:662-668`) без `required`/`enum` на `optionIds`. Любой `{text, optionIds:[...]}` проходит.
- Двойная валидация расходится: `graph.ts:189-196` валидирует полную схему, `run-engine.ts:315-325` — урезанную.
- `ask-user.ts:55-56` — принимает любой не-null `ctx.resume`; `formatResumeResult` (`ask-user.ts:7-23`)
  склеивает опции в строку без проверки существования `optionIds`.

Фикс: валидировать `optionIds ⊆ options.id` (серверная проверка в `apply()` или в `ask_user`),
зафиксировать единственную точку валидации.

### 2.3 [BUG] `pendingHitl` не очищается на `resumed`; `resumed` не персистится

- `pending-hitl.ts:11-25` смотрит только `done`/`error`/`ask`. `resumed` есть в типе
  (`ports/session.ts:44`), эмитится (`run-engine.ts:330`), но клиентом нигде не обрабатывается.
- Форма ответа висит до прихода следующей дельты модели.
- `resumed` не пишется в БД (только в памяти event log движка) — после reload след ответа теряется,
  `rowToSessionEvent` (`get-thread.use-case.ts`) не имеет ветки `resumed`.

Фикс: клиент — сброс `pending`/индикация на `resumed`; сервер — персистить `run.resumed`
и маппить в `rowToSessionEvent`.

### 2.4 [BUG] Orphan tool_use при reject

- Reject `ask_user` → `launchSegment({startNodeId:'act', rejected:true})` (`run-engine.ts:303-312`).
- `graph-edges.ts:23-28` (`isSkippedEntry`) — узел `tool:call` при `rejected` пропускается **без
  записи tool-сообщений**; при этом assistant-сообщение с `toolCalls` уже в истории (`graph.ts:563-572`).
- Следующий `think` отправляет провайдеру историю с `tool_use` без парного `tool_result` →
  у большинства провайдеров 400.
- Синтетический результат есть только для approve-ветки (`tool-call.ts:354-366`).

Фикс: при skip-entry `tool:call` писать синтетические tool-сообщения «rejected by user»
(тот же механизм, что в approve-ветке).

### 2.5 [BUG] Дубли `ask` при recover

- `recover()` реэмитит `ask` (`run-engine.ts:168-175`) в replay-лог; тот же ask уже лежит в БД
  и приедет через `getThread` reconcile (`get-thread.use-case.ts:155-165`) → дубли в `events[]`,
  мерджа по sequence нет (см. 2.7).

Фикс: не реэмитить (клиент получает ask через reconcile), либо дедуп на клиенте по `askId`.

### 2.6 [BUG] `fromSeq` игнорируется сервером — переподключение дублирует события

- Клиент шлет `fromSeq` (`threads.ts:100`), всегда 0 (`send-message.ts:65`, `drain-run-stream.ts:15`).
- Контроллер не парсит query (`thread.controller.ts:152-157`), `stream-run-events.use-case.ts:5-7`
  не принимает offset, `active-runs.adapter.ts:103-117` реплеит весь `buffer` с нуля.
- Переподключение → дубли `ask/text-delta/tool` в клиентском `events[]`.

Фикс: протянуть `fromSeq` до реестра (события с монотонным seq), реплей только хвоста;
после открепления — reconnect с последним полученным seq вместо reconcile-перечитки.

### 2.7 [BUG] `replaceEvents` затирает локальное состояние без мерджа

- `session.store.ts:49-54` — полная замена; оптимистичный `user`, недослитые `text-delta`,
  события, пришедшие по SSE после снапшота `getThread`, теряются/дублируются.
- Дедуп `user` (`session.store.ts:60-66`) работает только если событие последнее — после
  reconcile порядок другой.

Фикс: мердж по sequence (серверные события имеют seq в БД — прокинуть в `SessionEvent`),
локальные乐观истичные события вставлять по позиции, не затирать свежий хвост.

### 2.8 [BUG] Жизненный цикл SSE и клиентского «стрима»

- `run-engine-stream.ts:38` + `stream-run-events.use-case.ts:37-39` — SSE закрывается только на
  терминальном статусе; на `needs_input` соединение висит открытым бесконечно (до таймаута прокси).
- `send-message.ts:103-113` и `drain-run-stream.ts:33-45`: обрыв SSE после полученных кадров
  трактуется как норма → `finally` → `getThread` + `replaceEvents` + `finishRun`. При живом ране
  клиент считает его завершенным, сервер живым → рассинхрон (усугубляет 1.4).
- `finish()` реестра не зовет `idleListeners` (`active-runs.adapter.ts:90-100`): `findByThread`
  находит саму завершенную запись (удаление через 30с) и делает ранний `return`. Ломает
  schedule-очередь (`wire-schedules.ts:52`).

Фикс: закрывать SSE на `needs_input` (с финальным кадром `ask`) и на терминале; клиент на обрыв —
reconnect с `fromSeq`, а не «finish»; в `finish()` вычислять idle без учета самой записи.

### 2.9 [RISK] `send` поверх незакрытого ask

- `send-thread-run.use-case.ts` не проверяет pending ask в БД; после `registry.forget`
  (`drain-agent-run.ts:31`, срабатывает на терминале) `threadOf` создает новый handle с
  `live=null` → `send` проходит, старый interrupt из БД теряется, в истории остается
  assistant с `toolCalls` без результатов (тот же orphan, что 2.4).
- `PendingHitlError`/`ThreadBusyError` из `session.send` не мапятся в HTTP-код (500 вместо 409).

Фикс: `send` должен либо отклонять при незакрытом interrupt (409 + `pendingAskId`), либо явно
отменять предыдущий ран; мапить ошибки session-слоя в HTTP.

---

## 3. P2 — ресурсы, производительность, мелочи

| # | Тип | Что | Где |
|---|-----|-----|-----|
| 3.1 | [BUG] | Replay-буфер движка растет безгранично (`replay.push` без чистки) | `run-engine-stream.ts:9,22` |
| 3.2 | [BUG] | Буфер реестра тоже (`buffer.push`), чистится только удалением записи через 30с | `active-runs.adapter.ts:124,90-92` |
| 3.3 | [BUG] | Нет GC parked runs: ни таймаута, ни лимита `needs_input` на воркспейс | `run-engine.ts`, `active-runs.adapter.ts` |
| 3.4 | [DEBT] | `getThread` перечитывает **всю** историю событий на каждый `publishDeskThread` (O(n) на каждое событие рана) | `get-thread.use-case.ts:203-208`, `publish-desk-thread.ts` |
| 3.5 | [DEBT] | `tokens += 1` при отсутствии usage — бюджет фейлится на фейковых токенах | `graph.ts:575-585` |
| 3.6 | [DEBT] | Пустой `if (attempt < bindingsToTry.length - 1) {}` — фоллбек-цикл мертв (повторный стрим после частичных дельт не откатывается) | `graph.ts:536-540` |
| 3.7 | [DEBT] | `resolveConcurrency` дублирует проверку `'parallel'|'sequential'` | `tool-call.ts:70-88` |
| 3.8 | [DEBT] | Дабл-сабмит ответа возможен: `busy` — React-стейт, асинхронный; одинаковый payload молча проходит дедуп (1.5), разный — `already_resumed` | `hitl-prompt.tsx:51,158-184`, `run-engine.ts:276-280` |
| 3.9 | [DEBT] | `ConfirmCard`/`AskCard` — разные контракты payload, не зафиксированы типом | `hitl-prompt.tsx:37,71,175` |
| 3.10 | [DEBT] | Композер блокируется при HITL; пояснение есть (плейсхолдеры `chat-composer.tsx:84-92`), но кнопка disabled без tooltip — minor | `chat-composer.tsx:69` |

---

## 4. Переоцененные / не подтвердившиеся утверждения исходных ревью

1. **«respond уходит не в тот engine»** (review_2 п.3) — для respond **неверно**:
   `respond-run.use-case.ts:25` ищет по `runId`. Реальная проблема — дубли записей в реестре
   и 409 на `resume`/`findByThread` (учтено в 1.4).
2. **«`forget` теряет engine»** (review_2 п.5) — переоценено: для parked рана `finally` в
   `drainAgentRun` не наступает (SSE не закрывается), `forget` срабатывает только на
   терминальном. Риск от `forget` другой — см. 2.9.
3. **«Промпт прячется при `!streaming`»** (review_2 п.14) — подтверждено (`hitl-prompt.tsx:33`),
   но следствие того же цикла resume (1.4); отдельного фикса не требует после 1.4.
4. **«Второй respond всегда ошибка»** (review_2 п.16) — частично: одинаковый payload молча
   проходит (см. 3.8).
5. **Числа из логов** (60 запросов за 4с, 5x resume в 11:30:48) — по репозиторию не проверяемы.
   Механизм цикла подтвержден (1.4); фактическая частота зависит от RTT.
6. **«Клиент повторяет respond через 15с»** (review_2 п.1) — фиксированного интервала в коде нет;
   ретрай идет из эффекта при смене зависимостей.

---

## 5. План исправлений

### Фаза 1 — Ядро движка (разблокирует всё)
1. **1.4 (сервер)**: идемпотентный `/resume` (202 + существующий runId), атомарная проверка+register,
   `findByThread` игнорирует `finished`. *(корень шторма)*
2. **1.3**: `await recover()` до `register` + `drainQueue()` после recover.
3. **1.5**: явные ошибки вместо silent no-op (`unknown_interrupt` / `run_terminal`), маппинг в HTTP.
4. **1.1**: восстановление `output` из последнего assistant-сообщения при старте с `tool:call`.
5. **1.2**: чекпоинт результатов батча перед interrupt (по образцу approve-ветки).

### Фаза 2 — HITL-контракт
6. **1.6**: permission `ask` → `AskUserInterrupt` (source `permission`).
7. **2.1**: `options/multi` в `cursor.interrupt.resumeSchema`; убрать расхождение `get-thread`
   vs `run-engine-events`; починить `parkAsk`.
8. **2.2**: валидация `optionIds` против `options`, единая точка валидации.
9. **2.4**: синтетический tool-result при reject.
10. **2.3 (сервер)**: персистить и маппить `run.resumed`.

### Фаза 3 — SSE и синхронизация состояния
11. **2.8**: закрывать SSE на `needs_input` (финальный `ask`-кадр) и терминале; фикс `finish()`/idleListeners.
12. **2.6**: серверный `fromSeq` (монотонные seq на события реестра).
13. **2.7**: мердж `replaceEvents` по seq; клиент — reconnect по `fromSeq` вместо слепого reconcile.
14. **2.5**: дедуп `ask` при recover (не реэмитить при живом reconcile-пути).
15. **2.3 (клиент)**: обработка `resumed` (сброс формы, индикация).
16. **2.9**: `send` при незакрытом interrupt — 409/автоотмена; маппинг `PendingHitlError`/`ThreadBusyError`.

### Фаза 4 — Клиентская устойчивость
17. **1.4 (клиент)**: in-flight guard в `resumePausedThread`, 409 → подключение к SSE рана, backoff.
18. **3.8**: идемпотентность ответа (ref-guard вне React-стейта).
19. **3.9**: типизированный union для payload Confirm/Ask.

### Фаза 5 — Ресурсы и долг
20. **3.1–3.3**: лимит replay-буфера (кольцевой), чистка буфера реестра, TTL/GC parked runs.
21. **3.4**: инкрементальная публикация desk-thread (или кэш последнего снапшота).
22. **3.5–3.7, 3.10**: точечные чистки.

### Ключевой архитектурный шаг (сделать в фазе 1 или 3)
Единый owner состояния рана: `GET /api/threads/:id` должен возвращать активный `runId` и
`runStatus` (или отдельный endpoint), а `ActiveRunRegistry` — единственное место, отвечающее на
вопрос «жив ли ран этого thread и какой у него runId». Это устраняет класс расхождений 1.4/2.8/2.9
и делает `/resume` тривиально идемпотентным.

---

## Приложение: сверка с review_1 / review_2

| Пункт | Вердикт проверки | В консолидированном |
|---|---|---|
| R1 Баг 1 ($output) | подтверждено | 1.1 |
| R1 Баг 2 (recover race) | подтверждено | 1.3 |
| R1 Баг 3 (шторм resume) | механизм подтвержден, цифры — нет | 1.4 |
| R1 Баг 4 (silent no-op) | подтверждено | 1.5 |
| R1 P1.1 (resumed) | подтверждено | 2.3 |
| R1 P1.2 (orphan tool_use) | подтверждено структурно | 2.4 |
| R1 P1.3 (дубль ask) | подтверждено как риск | 2.5 |
| R1 P1.4 (permission ask) | подтверждено | 1.6 |
| R1 P1.5 (replay buffer) | подтверждено | 3.1 |
| R1 P1.6 (GC parked) | подтверждено | 3.3 |
| R1 P1.7 (tokens+=1, пустой if) | подтверждено | 3.5, 3.6 |
| R1 P2 (4 пункта) | подтверждено | 3.4, 3.7, 2.7, 3.8-контекст |
| R2 п.1 (silent-drop) | подтверждено | 1.5 |
| R2 п.2 (очередь при running) | подтверждено | 1.3 |
| R2 п.3 (live перезатирание) | частично (respond верен) | 1.4 |
| R2 п.4 (resume-flood, TOCTOU) | подтверждено | 1.4 |
| R2 п.5 (forget) | переоценено | 2.9 |
| R2 п.6 (finish без idle) | подтверждено | 2.8 |
| R2 п.7 (permission) | подтверждено | 1.6 |
| R2 п.8 (options/multi) | подтверждено, уточнено | 2.1 |
| R2 п.9 (валидация) | подтверждено | 2.2 |
| R2 п.10 (любой resume) | подтверждено | 2.2 |
| R2 п.11 (fromSeq) | подтверждено | 2.6 |
| R2 п.12 (SSE на needs_input) | подтверждено | 2.8 |
| R2 п.13 (replaceEvents) | подтверждено | 2.7 |
| R2 п.14 (промпт прячется) | подтверждено (следствие 1.4) | 1.4 |
| R2 п.15 (композер) | частично (пояснение есть) | 3.10 |
| R2 п.16 (дабл-сабмит) | частично | 3.8 |
| R2 п.17 (resumed в get-thread) | подтверждено | 2.3 |
| R2 п.18 (контракты Confirm/Ask) | подтверждено | 3.9 |
