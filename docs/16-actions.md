# 16. Actions (harnesys/actions)

**Depends:** 07, 14, 15  
**Sources:** RUNTIME Actions; Harnyx adapters/actions

## Контракт

Имена tools как Harnyx:

| Фабрика | Tools |
|---|---|
| `files()` | `read_file`, `write_file`, `edit_file`, `list_dir`, `glob`, `grep` |
| `shell()` | `shell` |
| `fetch()` | `http` |
| `askUser()` | `ask_user` |

Опции: `files({ root?, blocklist? })`: clamp ∩ effective paths. Без root: только ctx.

### operations по умолчанию

| tools | operations |
|---|---|
| read_file, list_dir, glob, grep | `['fs.read']` |
| write_file, edit_file | `['fs.write']` |
| shell | `['process']` |
| http | `['network']` |
| ask_user | `[]` (HITL через interrupt; map не блокирует) |

### ask_user

Host tool. Модель вызывает → runtime не завершает call → `needs_input` / `control:interrupt` с resumeSchema вопроса (text / optionIds). Session: `ask` `source: 'ask_user'` → `respond(payload)`. Отдельной ноды в графе нет (02, 12).

### task

Host обязан поставить tool `task` (13): spawn child через `rt.run` + `state.child`.

## Инварианты

- Execute под `ToolContext` (cwd, paths, signal).
- Перенос path-resolve / gitignore / blocklist из Harnyx: в плане реализации, поведение совместимо.

## Out of scope

MCP tools (18), ArtifactStore put из write (19 optional).
