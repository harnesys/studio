# 07. tool() и registry

**Depends:** 05  
**Sources:** RUNTIME tool(); Harnyx define-tool; PUBLIC_API tools unresolved

## Контракт

```ts
// ToolSpec
tool(name, {
  description: string,
  group?: string,           // catalog; не HITL
  operations?: string[],    // ключи permissions (14)
  input: JsonSchema,        // контракт 02
  execute(input, ctx): Promise<unknown> | unknown,
})

// ToolContext
{
  cwd: string
  paths: { allow: string[] }
  signal?: AbortSignal
  artifacts?: ArtifactStore // если задан на runtime
}
```

`input` это `JsonSchema` из definition (02). Runtime валидирует args по схеме перед `execute`. Zod не входит в публичный API; host конвертирует снаружи при желании.

Имена в `llm:generate.tools` и fixed `tool:call.name` резолвятся в `createRuntime.tools` (+ MCP tools). Нет имени → `tools_unresolved`.

Коллизия имён (host tool vs MCP) → error при сборке registry.

## sideEffect и commit

На tool (и при необходимости на узле) задаётся `sideEffect`:  
`pure | read | write | destructive | financial | communication | credentialed`.

Правила `intent`/`recorded` и replay: таблица в `04-runtime-state.md`. Ядро подставляет `idempotencyKey` и `abortSignal` в execute.

Permissions gate (`operations` map, 14) ортогонален `sideEffect`. Порядок на tool call: permissions map, затем middleware `beforeTool` (05, 14), затем intent/recorded + execute.

## ToolCatalogEntry

```ts
type ToolCatalogEntry = {
  name: string
  description: string
  group?: string
}
```

Каталог инструментов без schema/execute. Используется для UI и списка доступных инструментов. Подмножество `ToolDefinition`.

## Инварианты

- `toolPermission(name)` на createRuntime нет; gate через `operations` + map (14).

## Out of scope

Builtin actions (16), MCP wrap (18), approve barrier (10), queue `dispatch` (`23-later.md`).
