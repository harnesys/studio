# 15. Paths (FS scope)

**Depends:** 02, 05, 14  
**Sources:** RUNTIME Paths

## Контракт

Три слоя, всегда **пересечение** (∩), никогда union:

1. `AgentDefinition.paths`: `{ allow: string[]; cwd?: string }`
2. `createRuntime({ paths })` — потолок host / workspace (optional)
3. `session` / `send` (`{ paths }`) — overlay хода (optional)

```
effective.allow = ∩ всех заданных allow
effective.cwd   = send/session.cwd ?? agent.cwd ?? runtime.cwd ?? effective.allow[0]
```

`cwd` обязан лежать под `effective.allow` (иначе ошибка конфига).

`ToolContext`: `{ cwd: effective.cwd, paths: { allow: effective.allow }, … }`.  
`files()` / `shell()` читают ctx. `files({ root, blocklist? })` дополнительно ∩ с effective (Harnyx adapters).

- Путь операции вне `effective.allow` → gate `fs.*` (обычно ask).
- Нет ни одного allow и tool лезет в FS → ошибка конфига (не «весь диск»).

## Кейсы

- CLI: при создании агента `paths.allow = [workspace]`.
- Studio: разные агенты → разные allow внутри одного workspace.
- Multi-tenant: `runtime.paths.allow` = tenant root; agent не расширит.

## Out of scope

Реализация path-resolve/blocklist (перенос из Harnyx в плане 16), ArtifactStore (19).
