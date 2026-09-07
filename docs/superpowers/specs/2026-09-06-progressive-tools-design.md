# Progressive Tools — дизайн

## Контекст

Каждый запрос агента несёт полный реестр тулов: ~12 пакетных + ask_user + все MCP (playwright ~25, duckduckgo ~5). Реестр студии: 60+ тулов (`GET /api/workspaces/:id/tools`). Схемы всех тулов уходят в каждый запрос (`toAiTools`, `ai-llm-chunks.ts:41`): лишние токены и деградация выбора тула моделью. История контекст-менеджмента: компакция для истории, каталог+`load_skill` для скилов; у тулов и MCP управление экспозицией отсутствует.

Скилы уже решают ту же задачу паттерном «каталог в notes + тело по запросу» (`skills.ts:21-29`). Тулы повторяют этот паттерн.

## Решения

| # | Решение | Статус |
|---|---|---|
| D1 | Мета-тул `load_tools` + динамический набор тулов в запросе. Нативный tool calling сохраняется полностью. | подтверждено |
| D2 | Deferred — только MCP-тулы. Пакетные тула и ask_user остаются always-on. | подтверждено |
| D3 | Режим включён всегда, без конфига. Behavior change для всех агентов. | подтверждено |
| D4 | Поле `AgentDefinition.mcpServers` оживает: per-agent фильтрация MCP. | подтверждено |

## Механика

### Флаги ToolDefinition

`ports/tools.ts`:

```ts
exposure?: 'always' | 'deferred'; // default 'always'
revealsTools?: boolean;           // результат раскрывает схемы тулов (load_tools)
```

MCP-тулы получают `exposure: 'deferred'` в `createMcpTool` (`application/mcp/create-mcp-tool.ts`). Сервер уже пишется в `group` (`:15`) и `operations: ['mcp']` (`:17`) — эти поля остаются маркерами для фильтрации по агенту.

### load_tools

Новый тул `application/tools/create-load-tools-tool.ts`. Фабрика принимает live-ссылку на реестр рантайма.

- Input: `{ names: string[] }`, `maxItems: 16`, `required: ['names']`.
- Output: `{ loaded: string[], unknown: string[], tools: [{ name, description, input }] }` — `loaded` для движка, `tools` (полные схемы) для модели в тексте tool-результата.
- `revealsTools: true`, без `operations` (минуes permission gate), `sideEffect: 'read'`.
- Реестр рантайма — глобальный; per-agent оверлаи (например `memory.knowledge.spec.topK`) не deferred и загрузки не требуют, расхождение схем недостижимо.

### Состояние загрузки

`state.loadedTools: string[]` в run-state. State-объект мутируется движком так же, как чекпоинты (`tool-approve-checkpoint.ts` пишет в `ctx.state`) и переживает снапшот/resume. Компакция переписывает `messages`, `loadedTools` не трогает.

Хук раскрытия — одна точка: `runSingleToolCall` (`tool-approve.ts:128`), сразу после `const value = await def.execute(...)`: если `def.revealsTools` и `value.loaded` — строковый массив, merge в `ctx.state.loadedTools` с клампом по реестру рана (`loaded.filter(n => ctx.toolRegistry.has(n))`) — агент, лишённый MCP-сервера фильтром `mcpServers`, не может обойти фильтр через `load_tools`.

### Резолюция набора на шаге (llm.ts)

Точка: `llm.ts:106`. Правило:

- `node.tools === undefined` (react-preset и все «все тула реестра») — progressive: из набора убираются deferred с ещё не загруженными именами; `load_tools` остаётся; `state.loadedTools` уже подмножество реестра и в наборе присутствует.
- Явный `node.tools` в кастомном графе — автор графа определил контракт, набор уходит как есть, без инъекций.
- Guard: если `load_tools` нет в реестре (хост собрал рантайм без него) — swap не выполняется, поведение прежнее.

Каталог deferred-тулов уходит notes-каналом: `llm.ts` дописывает `{ tag: 'tools', text: 'Deferred tools (schemas via load_tools): - name: description …' }` к `ctx.notes` перед `assembleNotes`. Формат повторяет каталог скиллов. Лимиты каталога: 60 записей / 4000 символов.

### mcpServers (D4)

Хелпер `filterToolsForAgent(registry, agent)` в `tool-registry.ts`: MCP-тул (`operations` содержит `'mcp'`) остаётся только если `def.group` входит в `agent.mcpServers`; не-MCP тула не затрагиваются. `mcpServers: []` — агент без MCP; `undefined` — все серверы (текущее поведение).

Точки применения — все три входа в граф: `create-runtime.ts` `run`/`start` и `run-engine.ts:131` (`opts.toolRegistry ?? deps.toolRegistry`). Фильтрация на уровне реестра рана закрывает и экспозицию (не попадёт в каталог/запрос), и исполнение (act-нода не найдёт тул).

## Гигиена контекста (из ревью)

| Проблема | Решение |
|---|---|
| `tools: []` в ноде = «ноль тулов» — футган регрессии f48b03b | `validate.ts`: структурная ошибка `tools_empty` на llm-ноде с явным пустым массивом |
| Дубли заголовков фрагментов | fetch: `## Retrieval` → `## Network`; semantic-memory: `## Durable state` → `## Memory` (строки под заголовками не меняются) |
| Notes без лимита | каталог скиллов: 40 записей / 4000 символов (`formatSkillsCatalog`); каталог тулов: 60 / 4000 |
| Неизмеряемость | событие `model.stats` в фиде рана: `tools`, `deferredPending`, `systemChars`, `notesChars` |
| Тихое глотание ошибок notes-провайдеров (`graph.ts` `catch {}`) | ошибки собираются в `notesErrors`, уходят метаданными `model.stats` (не в промпт) |
| `update-agent.use-case.ts` не бампает `updatedAt` | `patch.updatedAt = new Date().toISOString()` |

## Не входит

- Поисковый meta-тул с query/embeddings: каталог ~30 тулов читается моделью напрямую; поиск — при росте каталога.
- Переключатель режима в UI агента: режим всегда включён (D3).
- Deferred для пакетных тулов и skills: у skills свой механизм (`load_skill`).
- Инъекция progressive-набора в кастомные графы с явным `node.tools`.

## Риски

- Модель зовёт `load_tools` с именами always-on тулов: вернёт схемы, безвредно; `loaded` не меняет always-on набор.
- Провайдеры требуют тул из истории в текущем списке: OpenAI-compatible принимают tool-сообщения истории для тулов, не входящих в текущий `tools` (проверяется на живом стенде, Task последней верификации).
- First-step без загруженных тулов: MCP-тулов в первом запросе нет — агент должен сначала вызвать `load_tools`. Инструкция в каталоге notes (`schemas via load_tools`) покрывает; на живом стенде смотрим, что qwen3.8-flash схватывает паттерн.
