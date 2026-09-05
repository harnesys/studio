Отчёт готов. Изменений не вносил.

# Ревью графового движка агента

## Граф в базе — честный

Единственный агент Jarvis (`~/.harnesys/studio.db`, `agents.graph_json`) описан стандартным словарём движка, без отдельной «react ноды»:

```
start: core:start
think: llm:generate { prompt: main, messages: $state.messages }
act:   tool:call    { calls: $output.toolCalls, concurrency: parallel }
end:   core:end

start→think; think→act when $output.finishReason = "tool-calls"
think→end when $output.finishReason = "stop"; think→end (default); act→think
```

Это ReAct-цикл из LLM-ноды и ноды инструментов, связанных эджами с условиями на `$output.finishReason`. Пресет генерируется студией (`apps/studio/server/application/agents/react-preset.ts`) и перезаписывается при смене тулов (`update-agent.use-case.ts:104`). Тулов у агента в базе `[]`, поэтому `think` без `tools` — а `llm.ts:89` при `tools === undefined` отдаёт весь реестр хоста (files, shell, fetch, askUser, MCP). Замысел или упущение, судить вам, но это поведение движка по контракту, не хак.

## Исполнение

`compile.ts` индексирует эджи по `from`, `graph.ts:150` (846 строк) исполняет `while(true)` по нодам: условные эджи через компактный expression-движок (`expr-eval.ts`, 4 слота `$input/$state/$output/$resume`, без исполняемого кода — безопасно). Каждое событие коммитит снапшот (event-sourcing), чекпоинты частично выполненных батчей тулов (`tool-approve-checkpoint.ts`), HITL approve, interrupt/resume через cursor. Архитектура здравая.

## Намудрили или нет: точечные подпорки под ReAct

Движок знает о форме конкретного паттерна в четырёх местах:

1. `restoreReActOutput` (`graph-helpers.ts:146`) + `outputHint` (`graph.ts:122`): при resume прерванного `act` результат LLM не восстанавливается из снапшота, а вычисляется обратным проходом по `state.messages` в поиске последнего `assistant.toolCalls`. Тип называется `ReActOutput` — пресет хоста протёк в библиотеку. Правильнее сохранять `output` в cursor при interrupt.
2. `isSkippedEntry` (`graph-edges.ts:23`): специальный скип ноды interrupt/tool:call при `rejected`.
3. `core:start` (`graph.ts:289-343`) сам пушит user message в `state.messages`, разбирает attachments/audio/video/origin и коммитит `user.message`. Чат-логика внутри универсальной ноды старта.
4. `messagesPath`/`lastMsg` (`graph.ts:549`, `tool-call.ts:78`): tool:call узнаёт путь к массиву чата из предыдущей LLM-ноды, чтобы дописывать tool-сообщения.

Для Jarvis всё это работает согласованно, включая resume. Но это связь «движок ↔ chat-форма», а не чистый граф.

## Существенные находки

1. **Цикл без бюджета.** Граф Jarvis циклический, студия не проставляет `budget` (`workspace-harnesys.registry.ts:124-135`). Валидатор такое ловит (`validate.ts:419`, `cycle_budget`), но у резолвленных агентов `validateStructural` не вызывается: `defineAgent` студия не использует, а diagnostics из `compile()` отбрасываются (`run-engine.ts:114`, `create-runtime.ts:101`). Если модель стабильно возвращает `finishReason = "tool-calls"`, цикл бесконечен: `maxSteps` не задан, `deadlineMs` не задан. Останавливает только abort или сама модель.
2. **`control:spawn` и `control:handoff` не исполняются.** Типы объявлены (`agent-definition.ts:119,127`), валидируются (`validate.ts:328,346`) и известны `check.ts`, но в `graph.ts` веток нет: нода проваливается в `else` (`graph.ts:810`) и молча завершается `node.completed`. Публичный словарь шире интерпретатора. `custom:*` тоже no-op.
3. **`budget.maxTokens` мёртв.** Объявлен в домене, токены считаются (`graph.ts:573-581`), сравнения нигде нет.
4. **`tokens += 1`** при отсутствии `usage.totalTokens` (`graph.ts:579`) — счётчик раздувается фиктивными единицами.
5. **Дедлайн на сегмент, не на ран.** `t0` создаётся заново в каждом `startGraph` (`graph.ts:201`), при resume `deadlineMs` отсчитывается с нуля.

## Качество кода

- Парсинг `$state.X` → ключ скопирован трижды: `graph.ts:549-553`, `llm.ts:42-45`, `tool-call.ts:78-89`.
- Блок budget-чеков (maxSteps + deadline) повторён трижды: `graph.ts:272-284`, `771-783`, `816-828`.
- Форвардинг стрим-событий: 12 однотипных веток if-else (`graph.ts:461-520`), просится таблица типов.
- `nodeSteps` пишется, читается только ради `nodeExecutionId` (`graph-snap.ts:33`).
- Fallback-модели резолвятся двумя разными путями: `resolveFallbackBindings` для массива конфигов и inline-цикл для ModelsPort (`graph.ts:391-421`).

## Итог

Граф агента — реальный граф, LLМ-нода плюс нода инструментов, «react ноды» нет. Хаки точечные и живут вокруг resume и chat-формы, не в механике исполнения. Главные риски качества: неотключаемый цикл без бюджета (молча пропущенная валидация), необъявленная половина словаря нод (spawn/handoff), мёртвый `maxTokens`.