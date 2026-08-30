# 14. Permissions

**Depends:** 05, 07, 12  

**Sources:** docs; gate allow|ask|deny

## Контракт

Gate: `'allow' | 'ask' | 'deny'`.

Слои (карта **заменяется целиком**, не deep-merge):

1. `tool.operations`: `('fs.read' | 'fs.write' | 'process' | 'network' | 'mcp' | …)[]`
2. `DEFAULT_PERMISSIONS` (пакет):
   - `fs.read` → allow
   - `fs.write` → ask
   - `process` → ask
   - `network` → ask
   - `mcp` → ask
3. `createRuntime({ permissions })`
4. `session` / `send` / `run` / `start` (`{ permissions }`)

Резолв карты: `call ?? session/runtime ?? DEFAULT_PERMISSIONS`.  
Gate по **каждой** operation tool; любой `deny`/`ask` побеждает `allow`.

- `ask` → `needs_input` / SessionEvent `ask` (`source: 'permission'`) + `respond({ approved })` / `reject` → Command.
- `deny` → run `status: 'failed'` (класс policy). Tool не пропускается.
- Путь вне effective.allow (15) → как `fs.*` (обычно ask).

`toolPermission(name)` на createRuntime **нет**.

Порядок на tool call: permissions map → middleware `beforeTool` (`05`) → intent/recorded + execute (`04`, `07`).

Расширение вне map: `middleware` на `createRuntime` (`05`). Map остаётся.

Двойной HITL: код `duplicate_hitl` (`08`).

## Утилиты

```ts
function resolveToolPermission(
  operations: string[],
  map: PermissionMap,
): PermissionGate
```

Резолв gate по operations инструмента. Любой `deny`/`ask` побеждает `allow`. Если operations пустой — `'allow'`.

## Out of scope

Конкретные operations builtin/MCP (16, 18), session UX (20).
