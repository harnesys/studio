# 05. createRuntime

**Depends:** 01, 04  
**Sources:** PUBLIC_API граница; RUNTIME hello-world wiring

## Контракт

```ts
const rt = await createRuntime({
  models: ProviderConfig[] | ModelsPort, // 06
  tools?: ToolDefinition[],              // 07, 16
  mcp?: CursorMcpJson | McpRegistry,     // 18
  skills?: SkillRegistry,                // 17
  agents: { resolve: (id: string) => AgentDefinition | undefined },
  permissions?: PermissionMap,           // 14; иначе DEFAULT_PERMISSIONS
  paths?: { allow?: string[]; cwd?: string }, // 15 потолок host
  artifacts?: ArtifactStore,             // 19
  nodes?: Record<string, CustomNodeImpl>, // custom:*
  middleware?: Middleware[],
  // stream?, mergeState?, …
})
```

Graph API:

```ts
rt.run(agent, { input, state, permissions?, paths? })   // → RunResult
rt.start(agent, { input, state, permissions?, paths? }) // → AsyncIterable<Event>
rt.resume(state, command, { definition })               // definition обязателен
rt.compile(def) / rt.check(def)                         // 08
rt.session(agent, opts)                                 // 20
rt.reloadSkills() / rt.reloadMcp() / rt.close()
```

`agent`: `AgentDefinition | string`. `string` → `agents.resolve`; нет id → ошибка. Объект: тесты / без catalog.

`discoverModels`, `DRIVERS`: рядом с models (06). `close()` → MCP `closeAll` и освобождение ресурсов.

## Middleware

```ts
type GuardDecision =
  | { action: 'allow' }
  | { action: 'deny'; code: string; message?: string }
  | {
      action: 'ask'
      reason: string
      resumeSchema: JsonSchema // минимум под payload resume
    }

type MiddlewareContext = {
  stage: 'run' | 'node' | 'model' | 'tool'
  agentId: string
  runId: string
  nodeId?: string
  usage: { steps: number; tokens: number; cost?: number }
  state: Readonly<Record<string, unknown>>
  // stage-specific:
  tool?: { name: string; input: unknown; operations?: string[] }
  model?: { provider: string; model: string }
  node?: { type: string }
  signal?: AbortSignal
}

type Middleware = {
  name?: string
  beforeRun?(ctx: MiddlewareContext): GuardDecision | void | Promise<GuardDecision | void>
  afterRun?(ctx: MiddlewareContext): void | Promise<void>
  beforeNode?(ctx: MiddlewareContext): GuardDecision | void | Promise<GuardDecision | void>
  afterNode?(ctx: MiddlewareContext): void | Promise<void>
  beforeModel?(ctx: MiddlewareContext): GuardDecision | void | Promise<GuardDecision | void>
  afterModel?(ctx: MiddlewareContext): void | Promise<void>
  beforeTool?(ctx: MiddlewareContext): GuardDecision | void | Promise<GuardDecision | void>
  afterTool?(ctx: MiddlewareContext): void | Promise<void>
}
```

Hard-stop ядра: `maxSteps`, `maxTokens`, `deadlineMs`. Cost и custom limits: host `middleware`. `Usage.cost?` заполняет host/middleware для телеметрии; ядро по нему run не останавливает.

Permissions map остаётся (`14`); middleware её не заменяет.

Порядок на tool call:

1. permissions map (`14`)
2. `beforeTool` по порядку `middleware[]`; первый `deny` / `ask` побеждает
3. intent/recorded + execute (`04`, `07`)
4. `afterTool` только после success terminal (v1)

| `GuardDecision` | исход |
|---|---|
| `allow` / void | дальше по цепочке |
| `deny` | `RunResult.status: 'failed'` (policy) |
| `ask` | `needs_input` / interrupt; resume как permissions ask (`12`) |

Те же `before*` / `after*` и `GuardDecision` на стадиях `run` / `node` / `model`. `after*` в v1 только после success terminal.

Двойной HITL: `duplicate_hitl` в `08` (check: approve ∩ permissions ask; runtime: middleware `ask` после approve на том же call).

## Инварианты

- Каталог агентов SoT для session(id), handoff, task/spawn: один `resolve`.
- Низкий `resume`: host передаёт `definition`; mismatch → `12-hitl-run-result.md` (`onDefinitionMismatch`).
- Session.resume сам берёт definition из session (resolve или переданный def) и передаёт в graph resume.

## Out of scope

Детали models/tools/mcp/skills/permissions/paths/session: темы 06–20.
