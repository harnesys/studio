# 02. AgentDefinition

**Depends:** 01  
**Sources:** PUBLIC_API «Контракт», «Минимальность набора»

## Контракт

`defineAgent(def)`: единственный конструктор. Definition сериализуема как plain JSON.

```ts
type JsonSchema = {
  type?: string
  properties?: Record<string, JsonSchema>
  required?: string[]
  enum?: unknown[]
  items?: JsonSchema
  additionalProperties?: boolean | JsonSchema
  [key: string]: unknown
}

type Expr = string // path или булево/арифметика над слотами; на wire: string

type AgentModelRef = {
  provider: string
  model: string
  effort?: string
  generation?: {
    temperature?: number
    topP?: number
    topK?: number
    frequencyPenalty?: number
    presencePenalty?: number
    seed?: number
    maxTokens?: number
  }
}

type AgentDefinition = {
  id: string
  version?: string // semver; id без версии не менять после публикации
  prompts: Record<string, { instructions: string }>
  model?: AgentModelRef // дефолт llm; ключ 'default' в models = это же
  models?: Record<string, AgentModelRef>
  fallback?: AgentModelRef[]
  skills?: string[] // allowlist; undefined = политика runtime (17-skills)
  paths?: { allow: string[]; cwd?: string } // ∩ с runtime/session (15-paths)
  state?: {
    initial: Record<string, Expr | unknown>
    reducers?: Record<string, 'replace' | 'merge'> // omit ключа = merge; детали 04/08/11
  }
  graph: { nodes: Record<string, Node>, edges: Edge[] }
  budget?: {
    maxSteps?: number
    maxTokens?: number
    deadlineMs?: number // wall-clock только пока run не в needs_input
  }
  // hard-stop ядра: три поля выше; cost → middleware (05)
}

type Edge = { from: string; to: string; when?: Expr }

type Node =
  | { type: 'core:start' }
  | { type: 'core:end'; output?: Expr }
  | {
      type: 'llm:generate'
      model?: string | AgentModelRef // omit|'default' → agent.model; string → models[id]
      prompt: string
      messages?: Expr
      tools?: string[]
      output?: JsonSchema
    }
  | ToolCallFixed
  | ToolCallBatch
  | { type: 'control:assign'; patch: Record<string, Expr | unknown> }
  | {
      type: 'control:spawn'
      calls: Expr
      concurrency: Expr | 'parallel' | 'sequential'
      barrier?: { policy: 'all' } // omit = { policy: 'all' }; post-v1: any | n-of-m (13, 23)
    }
  | { type: 'control:goto'; target: Expr }
  | { type: 'control:interrupt'; reason: string; resumeSchema: JsonSchema }
  | {
      type: 'control:handoff'
      agentId: string | Expr
      input: Expr | Record<string, Expr | unknown>
    }
  | { type: `custom:${string}`; config?: JsonSchema | unknown }

type ToolCallFixed = {
  type: 'tool:call'
  name: string
  args: Record<string, Expr | unknown>
  calls?: never
  concurrency?: never
  approve?: never
}

type ToolCallBatch = {
  type: 'tool:call'
  calls: Expr
  concurrency: Expr | 'parallel' | 'sequential'
  barrier?: { policy: 'all' } // omit = all; тот же predicate, что у spawn (10, 13)
  approve?: {
    tools: string[]
    reason: string
    resumeSchema: JsonSchema // минимум { approved: boolean }
  }
  name?: never
  args?: never
}
```

XOR `tool:call`: ровно `name`+`args` или `calls`+`concurrency`. Иначе `tool_call_shape`. Fixed = сахар над batch из одного элемента; после нормализации `$output` всегда batch-формы.

| Node | `$output` после успеха |
|---|---|
| `core:start` | `{ input }` (копия run input) |
| `core:end` | финальный return (12-hitl-run-result) |
| `llm:generate` | `{ finishReason, text?, toolCalls?, ...structured }` |
| `tool:call` | `{ results: [{ id, name, result, isError, skipped?, cancelled? }] }` |
| `control:assign` | `{ patched: string[] }` |
| `control:spawn` | `{ results: [{ target, output, isError?, cancelled? }] }` порядок = `calls` |
| `control:goto` | не пишется |
| `control:interrupt` | не пишется; после resume `$resume` = payload |
| `control:handoff` | `{ agentId, output }` = return child run |
| `custom:*` | хост-определено |

Structured `output` у llm дополняет `$output`. Ключи `finishReason` / `text` / `toolCalls` в schema: системные поля побеждают, structured отбрасывается с warning `output_key_reserved`.

## Минимальный набор нод

9 типов: `core:start`, `core:end`, `llm:generate`, `tool:call`, `control:assign`, `control:spawn`, `control:goto`, `control:interrupt`, `control:handoff`.  
`approve` и fixed `tool:call`: сахар. `map` = `spawn` + `assign`. Post-v1 из VISION (`control:loop`, `control:join`, `tool:mcp`) сюда не входят.

`custom:*` только если тип в `createRuntime.nodes`; иначе fail-closed `unsupported_node`.

## Инварианты

- `tools` у llm и fixed `name`: имена; схема/execute из `createRuntime.tools`.
- Модель: `agent.model` / `models` + `createRuntime.models` (06-models).

## Out of scope

Семантика исполнения нод (09–13), Expr evaluate (03), check codes (08).
