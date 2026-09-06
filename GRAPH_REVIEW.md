# Ревью графового движка агента

Обновлён: 2026-09-06 после волны бюджет/notes (`1a07299`, `a81949a`, `84f8194`). Находки из прежней редакции, закрытые этой волной, убраны; справка — в git log этого файла.

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

`compile.ts` индексирует эджи по `from`, `graph.ts` исполняет `while(true)` по нодам: условные эджи через компактный expression-движок (`expr-eval.ts`, 4 слота `$input/$state/$output/$resume`, без исполняемого кода — безопасно). Каждое событие коммитит снапшот (event-sourcing), чекпоинты частично выполненных батчей тулов (`tool-approve-checkpoint.ts`), HITL approve, interrupt/resume через cursor. Архитектура здравая.

## Намудрили или нет: точечные подпорки под ReAct

Движок знает о форме конкретного паттерна в трёх местах:

1. `isSkippedEntry` (`graph-edges.ts:23`): специальный скип ноды interrupt/tool:call при `rejected`.
2. `core:start` (`graph.ts:289-343`) сам пушит user message в `state.messages`, разбирает attachments/audio/video/origin и коммитит `user.message`. Чат-логика внутри универсальной ноды старта.
3. `messagesPath`/`lastMsg` (`graph.ts:549`, `tool-call.ts:78`): tool:call узнаёт путь к массиву чата из предыдущей LLM-ноды, чтобы дописывать tool-сообщения.

Для Jarvis всё это работает согласованно, включая resume. Но это связь «движок ↔ chat-форма», а не чистый граф.

## Качество кода

- `nodeSteps` пишется, читается только ради `nodeExecutionId` (`graph-snap.ts:33`).

## Итог

Граф агента — реальный граф, LLМ-нода плюс нода инструментов, «react ноды» нет. Из прежних рисков остались только точечные подпорки вокруг resume и chat-формы; валидация циклов, бюджет (шаги/токены/дедлайн) и словарь нод закрыты волной 2026-09-06: save-гейт через `compileOrThrow`/`validateStructural`, бюджет проставляется студией, неподдерживаемые ноды (`control:spawn`, `control:handoff`, `custom:*`) падают громко с `node_unsupported`.
