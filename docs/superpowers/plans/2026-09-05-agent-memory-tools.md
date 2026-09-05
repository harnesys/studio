# Memory tools для агентов — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Дать агентам инструменты pin/semantic/episodic/knowledge памяти: фабрики в библиотеке harnesys, проводка и per-agent гейтинг в studio, инструктивный блок в системном промпте.

**Architecture:** Спека `docs/superpowers/specs/2026-09-05-agent-memory-tools-design.md`. Библиотека получает чистые фабрики (`src/application/memory/`), студия регистрирует все 10 тулов на workspace через `setExtraTools`, видимость per-agent — через allowlist, запечённый в граф (`buildReactGraph`), scope читается в execute из `requireHostToolScope()`.

**Tech Stack:** TypeScript (bun), Hono + better-sqlite3 (сервер), biome.

**Spec:** `docs/superpowers/specs/2026-09-05-agent-memory-tools-design.md`

## Global Constraints

- **Тесты запрещены** (`AGENTS.md`): не создавать `*.test.ts` / `*.spec.ts`, не ставить vitest/RTL/playwright. Проверка задачи: `bunx biome check <зона>` + ручной сценарий.
- Стенд держит хозяин: порты `3000` (API) и `5173` (Vite). Не поднимать второй Vite/API, не рестартить процессы. Рестарт сервера после серверных правок и проверка в браузере — через хозяина в чате.
- Формат и линт: biome на весь монорепо, исправления только `biome check --write` в зоне задачи.
- Комментарии в коде не добавлять. UI-строки и описания тулов — английские.
- Именованные типы вместо `T['field']` / `Parameters<typeof fn>[0]` (плагин `no-indexed-access-type`).
- Файлы ~300 строк, резать по ответственности.
- Публичный API `create-runtime` не меняется. Порт-типы только из `packages/harnesys/src/ports/memory.ts`, новые — не вводить.

---

### Task 1: Библиотека — фабрики memory-инструментов и memoryToolNames

**Files:**
- Create: `packages/harnesys/src/application/memory/create-pin-tools.ts`
- Create: `packages/harnesys/src/application/memory/create-semantic-tools.ts`
- Create: `packages/harnesys/src/application/memory/create-episodic-tools.ts`
- Create: `packages/harnesys/src/application/memory/create-knowledge-tools.ts`
- Create: `packages/harnesys/src/application/memory/memory-tool-names.ts`

**Interfaces:**
- Consumes: `PinPort`, `SemanticMemoryPort`, `EpisodicPort`, `KnowledgePort`, `MemoryScopeId`, `SemanticScope`, `SemanticSessionTtl` из `../../ports/memory.ts`; `tool`, `ToolDefinition` из `../../ports/tools.ts`; `AgentMemoryConfig` из `../../domain/agent-definition.ts`.
- Produces (используют Task 2–4): `createPinTools(params: CreatePinToolsParams): ToolDefinition[]`, `createSemanticTools(params: CreateSemanticToolsParams): ToolDefinition[]`, `createEpisodicTools(params: CreateEpisodicToolsParams): ToolDefinition[]`, `createKnowledgeTools(params: CreateKnowledgeToolsParams): ToolDefinition[]`, `memoryToolNames(memory: AgentMemoryConfig | null | undefined): string[]`. Типы параметров: `{ port; resolveScope: () => MemoryScopeId }` плюс `sessionTtl?: SemanticSessionTtl | (() => SemanticSessionTtl | undefined)` у semantic и `topK?: number | (() => number | undefined)` у knowledge.

- [ ] **Step 1: create-pin-tools.ts**

```ts
import type { MemoryScopeId, PinPort } from '../../ports/memory.ts';
import { type ToolDefinition, tool } from '../../ports/tools.ts';

export type CreatePinToolsParams = {
  port: PinPort;
  resolveScope: () => MemoryScopeId;
};

type PinSetInput = {
  key: string;
  text: string;
};

type PinRemoveInput = {
  key: string;
};

export function createPinTools(params: CreatePinToolsParams): ToolDefinition[] {
  const { port, resolveScope } = params;
  return [
    tool('pin_set', {
      group: 'memory',
      description: 'Upsert a pin that stays visible in the agent window',
      input: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'Stable pin key' },
          text: { type: 'string', description: 'Pin body text' },
        },
        required: ['key', 'text'],
        additionalProperties: false,
      },
      sideEffect: 'write',
      async execute(input) {
        const parsed = input as PinSetInput;
        return await port.upsert(resolveScope(), {
          key: parsed.key,
          text: parsed.text,
          source: 'agent',
        });
      },
    }),
    tool('pin_remove', {
      group: 'memory',
      description: 'Remove a pin by key',
      input: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'Pin key to remove' },
        },
        required: ['key'],
        additionalProperties: false,
      },
      sideEffect: 'write',
      async execute(input) {
        const parsed = input as PinRemoveInput;
        await port.remove(resolveScope(), parsed.key);
        return { ok: true, key: parsed.key };
      },
    }),
    tool('pin_list', {
      group: 'memory',
      description: 'List all pins for this agent scope',
      input: { type: 'object', properties: {}, additionalProperties: false },
      sideEffect: 'read',
      async execute() {
        return await port.list(resolveScope());
      },
    }),
  ];
}
```

- [ ] **Step 2: create-semantic-tools.ts**

```ts
import type {
  MemoryScopeId,
  SemanticMemoryPort,
  SemanticScope,
  SemanticSessionTtl,
} from '../../ports/memory.ts';
import { type ToolDefinition, tool } from '../../ports/tools.ts';

export type CreateSemanticToolsParams = {
  port: SemanticMemoryPort;
  resolveScope: () => MemoryScopeId;
  sessionTtl?: SemanticSessionTtl | (() => SemanticSessionTtl | undefined);
};

type MemoryWriteInput = {
  scope: SemanticScope;
  text: string;
  key?: string;
};

type MemoryListInput = {
  scope?: SemanticScope;
  limit?: number;
};

type MemoryDeleteInput = {
  id: string;
};

export function createSemanticTools(params: CreateSemanticToolsParams): ToolDefinition[] {
  const { port, resolveScope } = params;
  const configuredTtl = params.sessionTtl;
  const ttlOf =
    typeof configuredTtl === 'function'
      ? configuredTtl
      : configuredTtl === undefined
        ? undefined
        : () => configuredTtl;
  return [
    tool('memory_write', {
      group: 'memory',
      description: 'Write a curated semantic memory fact (session or long)',
      input: {
        type: 'object',
        properties: {
          scope: {
            type: 'string',
            enum: ['session', 'long'],
            description: 'session = thread-bound; long = durable',
          },
          text: { type: 'string', description: 'Fact text' },
          key: { type: 'string', description: 'Optional upsert key within scope' },
        },
        required: ['scope', 'text'],
        additionalProperties: false,
      },
      sideEffect: 'write',
      async execute(input) {
        const parsed = input as MemoryWriteInput;
        const scopeId = resolveScope();
        const sessionTtl = ttlOf?.();
        return await port.upsert(scopeId, {
          scope: parsed.scope,
          text: parsed.text,
          key: parsed.key,
          threadId: scopeId.threadId,
          source: 'agent',
          ...(sessionTtl ? { sessionTtl } : {}),
        });
      },
    }),
    tool('memory_list', {
      group: 'memory',
      description: 'List curated semantic memory facts',
      input: {
        type: 'object',
        properties: {
          scope: { type: 'string', enum: ['session', 'long'], description: 'Filter by scope' },
          limit: { type: 'integer', minimum: 1, description: 'Max rows' },
        },
        additionalProperties: false,
      },
      sideEffect: 'read',
      async execute(input) {
        const parsed = input as MemoryListInput;
        const sessionTtl = ttlOf?.();
        return await port.list(resolveScope(), {
          scope: parsed.scope,
          limit: parsed.limit,
          ...(sessionTtl ? { sessionTtl } : {}),
        });
      },
    }),
    tool('memory_delete', {
      group: 'memory',
      description: 'Delete a semantic memory fact by id',
      input: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Memory record id' },
        },
        required: ['id'],
        additionalProperties: false,
      },
      sideEffect: 'write',
      async execute(input) {
        const parsed = input as MemoryDeleteInput;
        await port.remove(resolveScope(), parsed.id);
        return { ok: true, id: parsed.id };
      },
    }),
  ];
}
```

- [ ] **Step 3: create-episodic-tools.ts**

```ts
import type { EpisodicPort, MemoryScopeId } from '../../ports/memory.ts';
import { type ToolDefinition, tool } from '../../ports/tools.ts';

export type CreateEpisodicToolsParams = {
  port: EpisodicPort;
  resolveScope: () => MemoryScopeId;
};

type RecallSearchInput = {
  query: string;
  threadId?: string;
  limit?: number;
};

export function createEpisodicTools(params: CreateEpisodicToolsParams): ToolDefinition[] {
  const { port, resolveScope } = params;
  return [
    tool('recall_search', {
      group: 'memory',
      description: 'Search past thread experience (episodic recall)',
      input: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          threadId: { type: 'string', description: 'Limit search to one thread' },
          limit: { type: 'integer', minimum: 1, description: 'Max hits' },
        },
        required: ['query'],
        additionalProperties: false,
      },
      sideEffect: 'read',
      async execute(input) {
        const parsed = input as RecallSearchInput;
        const scope = resolveScope();
        return await port.search({
          workspaceId: scope.workspaceId,
          query: parsed.query,
          threadId: parsed.threadId,
          limit: parsed.limit,
        });
      },
    }),
  ];
}
```

- [ ] **Step 4: create-knowledge-tools.ts**

```ts
import type { KnowledgePort, MemoryScopeId } from '../../ports/memory.ts';
import { type ToolDefinition, tool } from '../../ports/tools.ts';

export type CreateKnowledgeToolsParams = {
  port: KnowledgePort;
  resolveScope: () => MemoryScopeId;
  topK?: number | (() => number | undefined);
};

type KnowledgeSearchToolInput = {
  query: string;
  limit?: number;
};

type KnowledgeReadToolInput = {
  id: string;
};

export function createKnowledgeTools(params: CreateKnowledgeToolsParams): ToolDefinition[] {
  const { port, resolveScope } = params;
  const configuredTopK = params.topK;
  const topKOf =
    typeof configuredTopK === 'function'
      ? configuredTopK
      : configuredTopK === undefined
        ? undefined
        : () => configuredTopK;
  return [
    tool('knowledge_search', {
      group: 'memory',
      description: 'Search the knowledge corpus (docs / wiki)',
      input: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          limit: { type: 'integer', minimum: 1, description: 'Max hits' },
        },
        required: ['query'],
        additionalProperties: false,
      },
      sideEffect: 'read',
      async execute(input) {
        const parsed = input as KnowledgeSearchToolInput;
        return await port.search({
          workspaceId: resolveScope().workspaceId,
          query: parsed.query,
          limit: parsed.limit ?? topKOf?.(),
        });
      },
    }),
    tool('knowledge_read', {
      group: 'memory',
      description: 'Read a knowledge document by id from search hits',
      input: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Knowledge chunk / document id' },
        },
        required: ['id'],
        additionalProperties: false,
      },
      sideEffect: 'read',
      async execute(input) {
        const parsed = input as KnowledgeReadToolInput;
        if (!port.read) {
          return {
            error: true,
            code: 'KNOWLEDGE_READ_UNSUPPORTED',
            message: 'knowledge port has no read()',
          };
        }
        return await port.read({
          workspaceId: resolveScope().workspaceId,
          id: parsed.id,
        });
      },
    }),
  ];
}
```

- [ ] **Step 5: memory-tool-names.ts**

```ts
import type { AgentMemoryConfig } from '../../domain/agent-definition.ts';

const PIN_TOOLS = ['pin_set', 'pin_list', 'pin_remove'];
const SEMANTIC_TOOLS = ['memory_write', 'memory_list', 'memory_delete'];
const EPISODIC_TOOLS = ['recall_search'];
const KNOWLEDGE_TOOLS = ['knowledge_search', 'knowledge_read'];

export function memoryToolNames(memory: AgentMemoryConfig | null | undefined): string[] {
  if (!memory) {
    return [];
  }
  const out: string[] = [];
  if (memory.pin != null) {
    out.push(...PIN_TOOLS);
  }
  if (memory.semantic != null) {
    out.push(...SEMANTIC_TOOLS);
  }
  if (memory.episodic != null) {
    out.push(...EPISODIC_TOOLS);
  }
  if (memory.knowledge != null) {
    out.push(...KNOWLEDGE_TOOLS);
  }
  return out;
}
```

- [ ] **Step 6: Проверка**

Run: `bunx biome check packages/harnesys`
Expected: no errors. Если ошибки — `bunx biome check --write packages/harnesys` и пересмотреть diff.

- [ ] **Step 7: Commit**

```bash
git add packages/harnesys/src/application/memory
git commit -m "feat(harnesys): memory tool factories — pin, semantic, episodic, knowledge, names"
```

---

### Task 2: Библиотека — resolveMemoryTools и публичные экспорты

**Files:**
- Create: `packages/harnesys/src/application/memory/resolve-memory-tools.ts`
- Modify: `packages/harnesys/index.ts`

**Interfaces:**
- Consumes: фабрики и типы из Task 1.
- Produces (использует Task 3–4 через импорт из `'harnesys'`): `resolveMemoryTools(input: ResolveMemoryToolsInput): ToolDefinition[]`, `memoryScopeResolver(workspaceId: string, agentName: string, threadId?: string): () => MemoryScopeId`, `memoryToolNames`, `createPinTools`, `createSemanticTools`, `createEpisodicTools`, `createKnowledgeTools` и их `Create*Params` — всё из корня пакета.

- [ ] **Step 1: resolve-memory-tools.ts**

```ts
import type { AgentDefinition, PortRef } from '../../domain/agent-definition.ts';
import type {
  EpisodicPort,
  KnowledgePort,
  MemoryScopeId,
  PinPort,
  SemanticMemoryPort,
  SemanticSessionTtl,
} from '../../ports/memory.ts';
import type { ToolDefinition } from '../../ports/tools.ts';
import { createEpisodicTools } from './create-episodic-tools.ts';
import { createKnowledgeTools } from './create-knowledge-tools.ts';
import { createPinTools } from './create-pin-tools.ts';
import { createSemanticTools } from './create-semantic-tools.ts';

export type ResolveMemoryScope = () => MemoryScopeId;

export type MemoryToolPorts = {
  pin?: PinPort;
  semantic?: SemanticMemoryPort;
  episodic?: EpisodicPort;
  knowledge?: KnowledgePort;
};

export type ResolveMemoryToolsInput = {
  definition: AgentDefinition;
  ports: MemoryToolPorts;
  resolveScope: ResolveMemoryScope;
};

export function resolveMemoryTools(input: ResolveMemoryToolsInput): ToolDefinition[] {
  const { definition, ports, resolveScope } = input;
  const memory = definition.memory;
  const out: ToolDefinition[] = [];
  if (memory?.pin && ports.pin) {
    out.push(...createPinTools({ port: ports.pin, resolveScope }));
  }
  if (memory?.semantic && ports.semantic) {
    out.push(
      ...createSemanticTools({
        port: ports.semantic,
        resolveScope,
        sessionTtl: sessionTtlFromRef(memory.semantic),
      }),
    );
  }
  if (memory?.episodic && ports.episodic) {
    out.push(...createEpisodicTools({ port: ports.episodic, resolveScope }));
  }
  if (memory?.knowledge && ports.knowledge) {
    out.push(
      ...createKnowledgeTools({
        port: ports.knowledge,
        resolveScope,
        topK: topKFromRef(memory.knowledge),
      }),
    );
  }
  return out;
}

export function memoryScopeResolver(
  workspaceId: string,
  agentName: string,
  threadId?: string,
): ResolveMemoryScope {
  return () => ({ workspaceId, agentName, ...(threadId ? { threadId } : {}) });
}

function sessionTtlFromRef(ref: PortRef): SemanticSessionTtl | undefined {
  const value = ref?.spec?.sessionTtl;
  return value === 'thread' || value === '24h' ? value : undefined;
}

function topKFromRef(ref: PortRef): number | undefined {
  const value = ref?.spec?.topK;
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : undefined;
}
```

- [ ] **Step 2: index.ts — экспорты**

В `packages/harnesys/index.ts` сразу после блока `} from './src/ports/memory.ts';` (секция экспортов `ports/memory.ts`, ~строка 155) добавить:

```ts
export {
  createEpisodicTools,
  type CreateEpisodicToolsParams,
} from './src/application/memory/create-episodic-tools.ts';
export {
  createKnowledgeTools,
  type CreateKnowledgeToolsParams,
} from './src/application/memory/create-knowledge-tools.ts';
export {
  createPinTools,
  type CreatePinToolsParams,
} from './src/application/memory/create-pin-tools.ts';
export {
  createSemanticTools,
  type CreateSemanticToolsParams,
} from './src/application/memory/create-semantic-tools.ts';
export { memoryToolNames } from './src/application/memory/memory-tool-names.ts';
export {
  memoryScopeResolver,
  type MemoryToolPorts,
  resolveMemoryTools,
  type ResolveMemoryToolsInput,
  type ResolveMemoryScope,
} from './src/application/memory/resolve-memory-tools.ts';
```

- [ ] **Step 3: Проверка**

Run: `bunx biome check packages/harnesys`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/harnesys/src/application/memory/resolve-memory-tools.ts packages/harnesys/index.ts
git commit -m "feat(harnesys): resolveMemoryTools + public memory tool exports"
```

---

### Task 3: Studio — create-memory-tools и проводка в runtime

**Files:**
- Create: `apps/studio/server/application/host-tools/create-memory-tools.ts`
- Modify: `apps/studio/server/composition/wire-host-tools.ts`
- Modify: `apps/studio/server/composition/studio.ts:250-266`

**Interfaces:**
- Consumes: `createPinTools`/`createSemanticTools`/`createEpisodicTools`/`createKnowledgeTools` из `'harnesys'` (Task 2); `requireHostToolScope` из `../../adapters/host-tool-scope.ts` (возвращает `{ workspaceId: string; agentId: string; threadId: string }`); `resolveAgentMemoryScope` из `../memory/agent-memory-scope.ts`; `sessionTtlFromAgentMemory` из `../memory/semantic-session-ttl.ts`; `StudioMemoryPorts` из `../wire-memory.ts` (поля `pin`, `semantic`, `episodic`, `knowledge` — Task 3 сам его не импортирует, тип приходит в deps из composition).
- Produces: `createMemoryTools(deps: MemoryToolsDeps): ToolDefinition[]`, где `MemoryToolsDeps = { pin: PinPort; semantic: SemanticMemoryPort; episodic: EpisodicPort; knowledge: KnowledgePort; workspaces: WorkspaceRepository; agents: AgentRepository }`. Зарегистрированные имена: `pin_set`, `pin_list`, `pin_remove`, `memory_write`, `memory_list`, `memory_delete`, `recall_search`, `knowledge_search`, `knowledge_read` (использует Task 4, Task 6).

- [ ] **Step 1: create-memory-tools.ts**

```ts
import type {
  AgentMemoryConfig,
  EpisodicPort,
  KnowledgePort,
  PinPort,
  SemanticMemoryPort,
  ToolDefinition,
} from 'harnesys';
import {
  createEpisodicTools,
  createKnowledgeTools,
  createPinTools,
  createSemanticTools,
} from 'harnesys';
import { requireHostToolScope } from '../../adapters/host-tool-scope.ts';
import type { AgentRepository } from '../../domain/agent.port.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';
import { resolveAgentMemoryScope } from '../memory/agent-memory-scope.ts';
import { sessionTtlFromAgentMemory } from '../memory/semantic-session-ttl.ts';

export type MemoryToolsDeps = {
  pin: PinPort;
  semantic: SemanticMemoryPort;
  episodic: EpisodicPort;
  knowledge: KnowledgePort;
  workspaces: WorkspaceRepository;
  agents: AgentRepository;
};

function topKFromMemory(memory: AgentMemoryConfig | undefined | null): number | undefined {
  const value = memory?.knowledge?.spec?.topK;
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : undefined;
}

export function createMemoryTools(deps: MemoryToolsDeps): ToolDefinition[] {
  const resolveScope = () =>
    resolveAgentMemoryScope(deps.workspaces, deps.agents, requireHostToolScope());
  const agentMemory = () => deps.agents.findById(requireHostToolScope().agentId)?.memory;
  return [
    ...createPinTools({ port: deps.pin, resolveScope }),
    ...createSemanticTools({
      port: deps.semantic,
      resolveScope,
      sessionTtl: () => sessionTtlFromAgentMemory(agentMemory()),
    }),
    ...createEpisodicTools({ port: deps.episodic, resolveScope }),
    ...createKnowledgeTools({
      port: deps.knowledge,
      resolveScope,
      topK: () => topKFromMemory(agentMemory()),
    }),
  ];
}
```

- [ ] **Step 2: wire-host-tools.ts — deps и регистрация**

Добавить импорты (biome расставит порядок):

```ts
import { createMemoryTools } from '../application/host-tools/create-memory-tools.ts';
```

и к существующему `import type { StudioDb } ...` группу типов composition:

```ts
import type { StudioMemoryPorts } from './wire-memory.ts';
```

В `WireHostToolsDeps` (после поля `semanticSessions?: SemanticSessionCleanup;`) добавить:

```ts
  memory: StudioMemoryPorts;
```

В массив `extraTools` в `wireHostTools` последним элементом добавить:

```ts
    ...createMemoryTools({
      pin: deps.memory.pin,
      semantic: deps.memory.semantic,
      episodic: deps.memory.episodic,
      knowledge: deps.memory.knowledge,
      workspaces: deps.workspaces,
      agents: deps.agents,
    }),
```

Регистрация в `setExtraTools` и `toolRegistry` происходит существующим циклом в конце `wireHostTools` — дополнительно ничего не нужно.

- [ ] **Step 3: studio.ts — передать memory в deps**

В вызове `wireHostTools({...})` (строка 250) добавить поле (переменная `memory` уже в скоупе, studio.ts:133):

```ts
    memory,
```

- [ ] **Step 4: Проверка**

Run: `bunx biome check apps/studio/server`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/studio/server/application/host-tools/create-memory-tools.ts apps/studio/server/composition/wire-host-tools.ts apps/studio/server/composition/studio.ts
git commit -m "feat(studio): wire memory tools into workspace runtime"
```

---

### Task 4: Studio — per-agent гейтинг через граф

**Files:**
- Modify: `apps/studio/server/application/agents/create-agent.use-case.ts:70-71`
- Modify: `apps/studio/server/application/agents/update-agent.use-case.ts:51,95-98`

**Interfaces:**
- Consumes: `memoryToolNames(memory)` из `'harnesys'` (Task 2); `requireAgent(...): Agent` из `./agent.helpers.ts` (возвращает агента, поле `memory: AgentMemoryConfig` не null).
- Produces: граф агента содержит имена memory-тулов включённых групп; в БД `tools` остаётся пользовательским allowlist без имён memory-тулов.

- [ ] **Step 1: create-agent.use-case.ts**

Добавить импорт:

```ts
import { memoryToolNames } from 'harnesys';
```

Заменить (строки 70–71):

```ts
    const tools = request.tools ?? [];
    const graph = buildReactGraph(tools);
```

на:

```ts
    const tools = request.tools ?? [];
    const graph = buildReactGraph([...new Set([...tools, ...memoryToolNames(memory)])]);
```

Переменная `memory` определена выше (строка 66: `request.memory ?? defaultAgentMemory()`). В `insert` уходит `tools` без имён memory-тулов — это сознательно.

- [ ] **Step 2: update-agent.use-case.ts**

Добавить импорт:

```ts
import { memoryToolNames } from 'harnesys';
```

Заменить строку 51:

```ts
    requireAgent(this.agents, request.workspaceId, request.id);
```

на:

```ts
    const agent = requireAgent(this.agents, request.workspaceId, request.id);
```

Заменить блок (строки 95–98):

```ts
    if (request.tools !== undefined) {
      patch.tools = request.tools;
      patch.graph = buildReactGraph(request.tools);
    }
```

на:

```ts
    if (request.tools !== undefined) {
      patch.tools = request.tools;
    }
    if (request.tools !== undefined || request.memory !== undefined) {
      const tools = request.tools !== undefined ? request.tools : agent.tools;
      const memory = request.memory !== undefined ? request.memory : agent.memory;
      patch.graph = buildReactGraph([...new Set([...tools, ...memoryToolNames(memory)])]);
    }
```

Блок `if (request.memory !== undefined) { patch.memory = request.memory; }` (строки 91–93) остаётся без изменений.

- [ ] **Step 3: Проверка**

Run: `bunx biome check apps/studio/server`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/studio/server/application/agents/create-agent.use-case.ts apps/studio/server/application/agents/update-agent.use-case.ts
git commit -m "feat(studio): gate memory tools per agent via graph allowlist"
```

---

### Task 5: Studio — инструктивный блок в системном промпте

**Files:**
- Modify: `apps/studio/shared/default-agent-instructions.ts`

**Interfaces:**
- Consumes: ничего нового.
- Produces: `DEFAULT_AGENT_SYSTEM` упоминает memory/knowledge-тулы; сигнатуры `composeAgentSystem` и экспорты не меняются (используют Task 6 и рантайм).

- [ ] **Step 1: четыре правки в DEFAULT_AGENT_SYSTEM**

Секция `## Retrieval` — заменить:

```
## Retrieval
- A known path or exact string: read_file, grep, glob, list_dir.
- Network: fetch.
```

на:

```
## Retrieval
- A known path or exact string: read_file, grep, glob, list_dir.
- Indexed corpus: knowledge_search, then knowledge_read by hit id.
- Network: fetch.
- Past compacted threads: recall_search (query in words: a decision, a failure, a module name).
```

Секция `## Durable state` — заменить единственный пункт на:

```
- pin_set: short rules that must stay in this agent's window. pin_list / pin_remove to maintain.
- memory_write scope=session: facts for this thread only.
- memory_write scope=long: facts that should survive across threads. Key them as project/module/topic so memory_list stays readable. memory_list is the aggregate view; memory_delete to prune.
- Compaction (threshold-summary) already runs when the thread window fills: a CompactionEntry lands in this chat and its summary becomes the new window prefix. Before a cut, land durable facts in pin, long memory, and the project files below. After a cut, recall_search plus those files recover the thread.
```

Секция `## Session ritual` — заменить три пункта:

```
- Thread start: use project files already in the window.
- Every substantial turn: update todo.md checkboxes; if goal/active/blocked/next moved — rewrite context.md in the same turn.
- About every 15–20 tool steps, or before a long wait / expected compaction: rewrite context.md.
```

на:

```
- Thread start: use project files already in the window; pin_list; if a gap remains — recall_search.
- Every substantial turn: update todo.md checkboxes; memory_write any nontrivial fact (session or long by reach); if goal/active/blocked/next moved — rewrite context.md in the same turn.
- About every 15–20 tool steps, or before a long wait / expected compaction: rewrite context.md, flush long memory for facts that must outlive this thread.
```

Финальную строку шаблона:

```
These files cover task tracking, ADRs, retrospectives, and session continuity. Personality and extra rules from the agent field follow this block.
```

заменить на:

```
These files plus pin/semantic/episodic/knowledge cover task tracking, ADRs, retrospectives, and session continuity. Personality and extra rules from the agent field follow this block.
```

Текст статичный: у агента с выключенной памятью этих тулов нет, ссылки ни на что не указывают.

- [ ] **Step 2: Проверка**

Run: `bunx biome check apps/studio/shared`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/studio/shared/default-agent-instructions.ts
git commit -m "feat(studio): agent instructions for memory/knowledge tools"
```

---

### Task 6: Финальная проверка

**Files:** нет новых.

- [ ] **Step 1: Линт монорепо**

Run: `bun run lint`
Expected: no errors.

- [ ] **Step 2: Рестарт сервера и ручной сценарий**

Серверные правки (Tasks 3–5) требуют рестарт API — попросить хозяина в чате. Стенд: порты `3000`/`5173`.

Сценарий для хозяина:

1. Открыть агента, включить в категории Memory pin + semantic (+ knowledge при настроенных корнях), сохранить.
2. Открыть тред агента: в каталоге тулов у треда видны `pin_set`/`memory_write` и остальные включённые.
3. Попросить агента: «запомни факт: <факт>» — проверить, что запись появилась в панели Memory треда (semantic) и в pins при `pin_set`.
4. Выключить память у агента, сохранить, новый тред — memory-тулов нет.
5. `knowledge_search` находит проиндексированный корпус (если knowledge-roots добавлены и индекс собран).

Критерий готовности: шаги 2–5 воспроизводятся, ошибок в консоли API нет.
