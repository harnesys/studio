# 03. Expr, slots, edges, messages

**Depends:** 02  
**Sources:** PUBLIC_API «Слоты и выражения», «Рёбра», «Messages»

## Слоты

| Слот | Когда живёт | Кто пишет |
|---|---|---|
| `$input` | весь run | host (`initialInput`); immutable в snapshot |
| `$state` | весь run | `state.initial` на старте; `control:assign`; messages-append; spawn merge через `reducers`; handoff parent `$state` не мутирует |
| `$output` | последний **завершённый** узел | runtime; при входе в узел ещё предыдущий |
| `$resume` | после успешного resume на активный interrupt | host payload; очищается при уходе с узла по ребру |

`state.initial` оценивается один раз при входе в `core:start`. Expr резолвится; прочие значения копируются. На этом шаге доступны `$input`; `$output` старта ещё не записан.

## Expr

Строка, subset path + ops (билдер может снижать typed `when` в ту же строку):

- Path: `$input.orderId`, `$output.finishReason`, `$output.output.ok`, `$output.results[0].isError`, `$state.messages`. Вложенность: `.`, `[index]`, `["key"]`.
- Ops в `when` и Expr: `=`, `!=`, `>`, `<`, `>=`, `<=`, `!`, `&&`, `||`, скобки, литералы `string` / `number` / `boolean` / `null`.
- Функции: `exists($path)` → boolean; `length($path)` → number (массивы и строки). Идентификаторы вне `$…` запрещены.
- Подстановка в `prompts.*.instructions`: `{$input.orderId}`. Рендер = `JSON.stringify(value)`. Это не защита от prompt injection; trust boundary на host.
- Неизвестный path при evaluate → `unknown_path`. При compile, если path выводим из schema/state → `expr_path`.

## Рёбра

Режим: **first-wins** (порядок массива `edges`). Fan-out только через `control:spawn`, не через несколько истинных `when`.

1. Рёбра с `when`: evaluate → boolean. Первый `true` побеждает.
2. Ребро без `when`: default. ≤ 1 default на каждый `from`; если есть хотя бы один `when`, default **обязателен** (`missing_default`).
3. Default последний среди рёбер этого `from` (`default_edge`).
4. Ни один `when` не true и default нет → `no_matching_edge`.
5. `when` на `control:interrupt` читает `$resume` после успешного resume.

`steps` = переходы между нодами (включая goto и вход в ветку spawn как step родителя; шаги внутри ветки/child суммируются в родителя при handoff/spawn-agent).

## Messages

После `state.initial` на `core:start`, для **каждого** `llm:generate` с полем `messages`:

- Expr обязан быть path в `$state.*` (иначе compile `messages_path`, см. `08`).
- Если значение по path `undefined`, runtime ставит `$input.messages` (если Array), иначе `[]`.
- Append assistant (после этого llm) и tool results следующего `tool:call` (порядок `calls`) всегда в path этого llm. Молчаливый drop запрещён.
- Если у узла нет `messages`, этот узел историю в `$state` не пишет.

Типичный граф: host `run(agent, { input: { messages: … } })`; агент `state.initial.messages: '$input.messages'`, llm `messages: '$state.messages'`.

Картинка/аудио = parts в сообщении (host / session fold, 19). Session нормализует `SendInput` → `input.messages` (+ attachments) внутри (20). Наружу: структурный тип сообщений пакета, не AI SDK.

## Out of scope

Исполнение llm/tool (09–10), session SendInput API (20).
