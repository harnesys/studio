Факт: флоу `send -> SSE -> ask -> respond -> resumed` собран из трех несогласованных контуров, `ask_user` висит из-за связки silent-drop + resume-flood + потеря `options`.

Флоу по шагам:

1. `client/features/send-message/model/send-message.ts:40-65` `POST /api/threads/:id/runs` -> `server/application/threads/send-thread-run.use-case.ts:117-130` `handle.send()` + `activeRuns.register()` + `void drainAgentRun()`, ответ `202 {runId}`.
2. `client/.../send-message.ts:65-94` `GET /api/runs/:id/events` -> `server/adapters/http/thread/thread.controller.ts:152-157,209-244` `streamSSE`, источник `server/application/threads/stream-run-events.use-case.ts:25-48` + `server/adapters/active-runs.adapter.ts:103-130` buffer + fanout.
3. Библиотека: `packages/harnesys/src/application/session.ts:76-134` создает `RunEngine` на каждый `send/resume`, `packages/harnesys/src/application/run-engine.ts:189-229` `runSegment(startGraph)`, `packages/harnesys/src/application/graph.ts:654-686` ловит `AskUserInterrupt`, коммитит `snapshot needs_input + cursor.interrupt` + `yield interrupt.triggered`.
4. `packages/harnesys/src/application/run-engine-events.ts:137-156` маппит в `SessionEvent ask{askId=interruptId}`, `run-engine.ts:179-187 parkAsk` ставит `status=needs_input`. Сервер `server/application/threads/drain-agent-run.ts:16-21` `emit(runId, ask)`.
5. Клиент `features/send-message/ui/hitl-prompt.tsx:19-35` рендерит `AskCard/ConfirmCard`, ответ через `features/send-message/model/hitl-actions.ts:6-24` `ensureLiveRun -> POST /api/runs/:id/respond {askId,payload}` -> `server/application/threads/respond-run.use-case.ts:24-33` `run.respond()` -> `run-engine.ts:266-338 apply()` -> `emit resumed` + `launchSegment({startNodeId, resumePayload})`.
6. Продолжение идет в тот же SSE того же `runId`. Новый `runId` создает только `POST /threads/:id/resume` через `session.ts:146-151 recover()` + `run-engine.ts:143-177` повторный `emit ask`.

P0, `ask_user` не возобновляется:

1. Silent-drop в `run-engine.ts:283-285`. Несовпадение `interruptId` делает `return` без ошибки. Контроллер `thread.controller.ts:165-171` все равно отдает `{ok:true}`. Клиент считает успех, `run.resumed` нет. Тот же эффект при `applied` с другим payload: `already_resumed`, клиент повторяет через 15с и упирается в запрет.
2. Очередь блокируется в `run-engine.ts:351-353`. Пока `status=running`, `resume/reject` лежат в `queue`. Обработка только в `finally:227 drainQueue`. Ответ, пришедший до `parkAsk`, висит до конца сегмента без обратной связи.
3. `session.ts:112 live=engine` перезатирается. Каждый `resume()` создает новый `RunEngine` и кладет в `live`, старый engine с `interrupt` остается в `activeRuns` под старым `runId`. `active-runs.adapter.ts:56-63 findByThread` возвращает первый попавшийся при нескольких записях на один `threadId`. `respond` уходит не в тот engine.
4. Resume-flood от клиента. Логи показывают 5x `POST resume` в `11:30:48.255-403` на один `threadId`. Источники: `hitl-prompt.tsx:27-31 useEffect pending && !streaming -> resumePausedThread`, `hitl-actions.ts:26-33 ensureLiveRun -> resumePausedThread`, `follow-live.ts:18-20`. Дедупа и in-flight флага нет, `resume-paused.ts:18-32` делает `startRun` без проверки. Каждый вызов создает новый `runId` + `drainRunStream`, старый SSE утекает. `resume-thread-run.use-case.ts:69-71` проверка `findByThread` имеет TOCTOU: параллельные запросы проходят до `register`.
5. `drain-agent-run.ts:29-31 finally onPersist + finish + registry.forget(threadId)` удаляет `SessionHandle` из `thread-runtime.registry.ts:34-36`. Следующий `resume` создает новый handle с новым `live=null`, старый `needs_input` engine теряется.
6. `active-runs.adapter.ts:93-95` `finish()` никогда не зовет `idleListeners`: `findByThread(threadId)` находит саму завершенную запись (удаление через 30с), ранний `return` срабатывает всегда.

P0, Bug 2, `permission ask` не останавливает граф:

7. `tool-call.ts:212-227` ветка `gate=ask` возвращает `{result:"permission ask: ...", skipped:true}` вместо `throw AskUserInterrupt`. Нет `needs_input`, нет `interrupt.triggered`, нет `ask`. Строка уходит в историю тулзов, модель повторяет вызов, цикл. `approve` в том же файле `336-382` бросает interrupt корректно. Два HITL-механизма с разной семантикой.

P1, потеря `options/multi` после persist/recover:

8. `graph.ts:659-683` кладет в `snapshot.cursor.interrupt` только `interruptId/reason/resumeSchema/nodeId/source/tool`, а `options/multi` только в `event.metadata`. `run-engine.ts:152-166 recover()` и `parkAsk:179-187` восстанавливают схему без `options/multi`. `get-thread.use-case.ts:155-165` маппит `ask.schema = resumeSchema`, без слияния как в `run-engine-events.ts:140-146`. После `replaceEvents` из `GET /threads/:id` (`send-message.ts:117-119`, `drain-run-stream.ts:39-41`) `AskCard hitl-prompt.tsx:142-144` видит пустые `options`, рендерит только текстовое поле.
9. Валидация не ловит неверный выбор. `run-engine.ts:61-67 resumeSchema()` вырезает `options/multi` перед Ajv, дефолтная схема `graph.ts:662-668` без `required` и `enum`. Любой `{text, optionIds}` проходит, несуществующий `optionId` принимается. Двойная валидация расходится: `graph.ts:189-196` валидирует полную схему, `run-engine.ts:315-325` урезанную.
10. `ask-user.ts:55-56` принимает любое не-null `ctx.resume` как ответ, включая `{approved:false}` от `approve reject run-engine.ts:294-301` или пустой объект. `formatResumeResult:7-23` склеивает в строку без проверки `optionIds` против `options`.

P1, SSE и состояние:

11. `fromSeq` игнорируется. Клиент шлет `getRunEventsStream(runId,0)` (`threads.ts`), `thread.controller.ts:152` не парсит query, `stream-run-events.use-case.ts:5-7` не принимает offset, `active-runs.adapter.ts:103-112 subscribe` реплеит весь `buffer` с нуля. Переподключение дублирует `ask/text-delta/tool`, клиент `appendEvent` складывает дубли.
12. `run-engine-stream.ts:25-48 stream(isDone)` завершается только на `completed/failed/cancelled`. На `needs_input` SSE висит открытым бесконечно, `stream-run-events.use-case.ts:37-39` не выходит. Держатся соединения, прокси режут их таймаутом, клиент в `send-message.ts:97-113` трактует обрыв после кадров как норму и молча идет в `reconcile`.
13. `get-thread.use-case` после `reconcile` затирает локальные `events` (`replaceEvents`), включая оптимистичный `user` и недослитые `text-delta`. Мерджа по `sequence` нет.
14. `HitlPrompt:33 if (!pending || !streaming) return null` прячет вопрос в момент когда он нужен: после reload `streaming=false`, `pending` есть, идет `resume`, промпт мигает или отсутствует. Ошибки `resume` (`409/404`) глотаются `catch(()=>{})`.

UX:

15. Композер блокируется при `hitl` (`chat-composer.tsx:69`), отдельного пояснения нет. Пользователь с клавиатуры упирается в `Submit disabled` в `AskCard:270-278` без причины при пустом вводе.
16. Нет идемпотентности ответа. `busy` локальный, дабл-клик Enter+кнопка до `setBusy(true)` шлет два `respond`. Сервер второй режет как `already_resumed`, клиент показывает `Could not answer`, хотя первый прошел.
17. Нет статуса `resumed`. После `Submit` нет `resumed`-индикатора, только вечный `waiting...`. `resumed` событие вообще не маппится в `get-thread.use-case`, после reload след ответа теряется.
18. `ConfirmCard` и `AskCard` разные контракты (`{approved,reason}` vs `{optionIds,text}`), в коде это не зафиксировано типом, только рантайм-веткой `pending.source`.

Что проверить человеку логами: `runId` в `POST respond` против активного `runId` в `activeRuns`, `askId` против `snapshot.cursor.interrupt.interruptId`, число engine на `threadId` после flood, `resumeSchema` в SQLite против `options` в `events.metadata`.