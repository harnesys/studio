# 18. MCP

**Depends:** 05, 07, 14  
**Sources:** RUNTIME MCP; Harnyx createMcpTool / McpServerManager; Cursor mcp.json

## Wire: Cursor JSON

```ts
type CursorMcpJson = {
  mcpServers: Record<string, StdioEntry | UrlEntry>
}
type StdioEntry = { command: string; args?: string[]; env?: Record<string, string>; enabled?: boolean }
type UrlEntry = { url: string; headers?: Record<string, string>; type?: 'sse' | 'http'; enabled?: boolean }
```

## McpRegistry

```ts
loadJson(json)
enable(id) / disable(id)  // connect | close
reload(id?)               // без id — все enabled заново
list() / tools() / closeAll()
```

`createRuntime({ mcp: CursorMcpJson | McpRegistry })`: JSON → registry; enable где `enabled !== false`.

MCP tools в общий реестр:

- имя: `prefix + raw.name` (как Harnyx)
- `group: serverId`
- `operations: ['mcp']` (default)
- коллизия имён → error

`rt.mcp` / `rt.reloadMcp()`; текущий run: снимок tools на старте; `close()` → `closeAll()`.

## Out of scope

Транспорт MCP connector internals (портировать из Harnyx), OAuth remote.
