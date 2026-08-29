# 17. Skills

**Depends:** 05  
**Sources:** RUNTIME Skills; Harnyx SkillRegistry / AgentSpec.skills

## Контракт

Порт `SkillRegistry`: `list` / `load` / `reload`.

```ts
createRuntime({ skills: new FsSkillRegistry({ roots: string[] }) })
rt.reloadSkills() // текущий run не трогаем; снимок на старте run
```

`AgentDefinition.skills?: string[]` — allowlist id. `undefined` = политика registry (все доступные / как зафиксируем в плане: default «все из list»).

На старте run: catalog (+ `load_skill` tool при необходимости) попадает в контекст графа/промптов по правилам плана реализации.

FS-адаптер: roots как `.agents/skills`, `~/.agents/skills` (порядок last-wins при коллизии имён — зафиксировать в плане; кандидат: last-wins как обсуждали).

## Out of scope

Формат SKILL.md на диске (как Harnyx/agents skills), memory.
