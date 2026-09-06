# Capability Packs — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Пачка возможностей (инструменты + фрагмент системного промпта + notes + скиллы) как атом переносимости: запись агента и включённые пачки дают то же поведение на любом хосте с той же библиотекой.

**Architecture:** Библиотека `harnesys` получает `CapabilityPack`/`defineCapability`, реестр регистраций хоста, сборку системного промпта (identity → фрагменты включённых пачек → текст агента) и переносит к себе plan/scheduler/webhook/threads-инструменты за новые порты по образцу памяти. Studio оставляет за собой только реализации портов, запись `capabilities` в БД и UI-панель включения; вся композиция промпта из студии удаляется.

**Tech Stack:** TypeScript, bun, Hono, drizzle-orm/sqlite, react-hook-form + zod, biome.

**Spec:** `docs/superpowers/specs/2026-09-06-capability-packs-design.md`

## Global Constraints

- Тесты запрещены (мораторий AGENTS.md). Верификация каждого таска: `bunx biome check .` из корня + typecheck (ниже) + ручной сценарий на живом стенде (bun :3000, vite :5173 — не перезапускать, он хозяйский).
- Typecheck: библиотека — `bunx tsc -p packages/harnesys/tsconfig.json --noEmit`; студия — `bun run typecheck` в `apps/studio`.
- Файлы ~300 строк, резать по ответственности. Слайс FSD наружу только через `index.ts`.
- Библиотека — источник правды; студия адаптируется. Публичные типы — строго из спеки.
- Описания и JsonSchema переезжающих инструментов — дословно, ни одного изменения формулировок.
- Фрагменты промпта самодостаточны, порядок сборки — sort by pack name (prefix-cache).
- Коммиты: `feat(harnesys): …`, `feat(studio): …`, `docs: …`.
- До переключения (таск 11) студия работает по-старому (host-tools + composeAgentSystem): переключение — один атомарный таск, промежуточных состояний с двойной регистрацией не делать.
- Порядок исполнения: 1–10, **12, 11**, 13–16. Таск 12 идёт до 11: смоук-тест 11 (PATCH `capabilities`) требует колонку `capabilities_json` и прокинутого поля.

---

### Task 1: Библиотека — модель пачки

**Files:**
- Create: `packages/harnesys/src/domain/capability.ts`
- Modify: `packages/harnesys/src/domain/agent-definition.ts`
- Modify: `packages/harnesys/index.ts`

**Interfaces:**
- Consumes: `ToolDefinition` (`ports/tools.ts`), `LlmNoteProvider` (`application/llm-notes.ts`), `PortRef`/`AgentDefinition` (`domain/agent-definition.ts`)
- Produces: `CapabilityScope`, `CapabilityConfig`, `CapabilityPackContext<Ports>`, `CapabilityPack<Ports>`, `CapabilityRegistration`, `defineCapability`, `registerCapability`, `AgentDefinition.capabilities?: Record<string, CapabilityConfig | null>`

- [ ] **Step 1: Создать `domain/capability.ts`**

```ts
import type { LlmNoteProvider } from '../application/llm-notes.ts';
import type { ToolDefinition } from '../ports/tools.ts';
import type { AgentDefinition, PortRef } from './agent-definition.ts';

export type CapabilityScope = {
  workspaceId: string;
  agentId: string;
  threadId: string;
};

export type CapabilityConfig = { spec?: Record<string, unknown> };

export type CapabilityPackContext<Ports> = {
  ports: Ports;
  resolveScope: () => CapabilityScope;
  config: CapabilityConfig;
};

export type CapabilityPack<Ports = Record<string, unknown>> = {
  name: string;
  version: string;
  description: string;
  requires?: string[];
  dependsOn?: string[];
  /** Источник включения/конфига; по умолчанию def.capabilities[name]. Память мостится от def.memory. */
  configFrom?: (def: AgentDefinition) => CapabilityConfig | PortRef | null | undefined;
  tools: (ctx: CapabilityPackContext<Ports>) => ToolDefinition[];
  prompt?: (ctx: CapabilityPackContext<Ports>) => string;
  notes?: (ctx: CapabilityPackContext<Ports>) => LlmNoteProvider;
};

export type CapabilityRegistration = {
  pack: CapabilityPack<Record<string, unknown>>;
  ports: Record<string, unknown>;
  resolveScope: () => CapabilityScope;
};

export function defineCapability<Ports extends Record<string, unknown>>(
  pack: CapabilityPack<Ports>,
): CapabilityPack<Ports> {
  if (!pack.name || !pack.version || !pack.description) {
    throw new Error('capability pack requires name, version, description');
  }
  return pack;
}

export function registerCapability<Ports extends Record<string, unknown>>(
  pack: CapabilityPack<Ports>,
  ports: Ports,
  resolveScope: () => CapabilityScope,
): CapabilityRegistration {
  return {
    pack: pack as unknown as CapabilityPack<Record<string, unknown>>,
    ports: ports as unknown as Record<string, unknown>,
    resolveScope,
  };
}
```

- [ ] **Step 2: Поле в `AgentDefinition`**

В `domain/agent-definition.ts` после `budget?: AgentBudget;` добавить `capabilities?: Record<string, CapabilityConfig | null>;` и импорт типа из `./capability.ts`.

- [ ] **Step 3: Экспорты**

В `packages/harnesys/index.ts` добавить блок:

```ts
export type {
  CapabilityConfig,
  CapabilityPack,
  CapabilityPackContext,
  CapabilityRegistration,
  CapabilityScope,
} from './src/domain/capability.ts';
export { defineCapability, registerCapability } from './src/domain/capability.ts';
```

- [ ] **Step 4: Верификация**

`bunx tsc -p packages/harnesys/tsconfig.json --noEmit && bunx biome check packages/harnesys` — ожидание: чисто.

- [ ] **Step 5: Commit**

`git add packages/harnesys && git commit -m "feat(harnesys): capability pack model"`

---

### Task 2: Библиотека — реестр, identity, сборка промпта

**Files:**
- Create: `packages/harnesys/src/application/capabilities/registry.ts`
- Create: `packages/harnesys/src/application/capabilities/prompt.ts`
- Create: `packages/harnesys/src/application/capabilities/tool-names.ts`
- Modify: `packages/harnesys/index.ts`

**Interfaces:**
- Consumes: типы Task 1
- Produces: `ResolvedCapability`, `CapabilityDiagnostic`, `resolveCapabilities(def, registrations): { enabled; diagnostics }`, `CAPABILITY_IDENTITY: string`, `composeSystemPrompt(agentText: string, enabled: ResolvedCapability[]): string`, `capabilityToolNames(def, registrations): string[]`, `allCapabilityToolNames(registrations): string[]`, `CapabilityCatalogEntry`, `capabilityCatalog(registrations): CapabilityCatalogEntry[]`

- [ ] **Step 1: `registry.ts`**

```ts
import type {
  AgentDefinition,
} from '../../domain/agent-definition.ts';
import type { CapabilityConfig, CapabilityRegistration } from '../../domain/capability.ts';

export type ResolvedCapability = {
  reg: CapabilityRegistration;
  config: CapabilityConfig;
};

export type CapabilityDiagnostic = {
  severity: 'error' | 'warning';
  code: 'unknown_capability' | 'capability_port_missing' | 'capability_dep_missing';
  message: string;
};

function enabledConfig(
  reg: CapabilityRegistration,
  def: AgentDefinition,
): CapabilityConfig | null {
  const source = reg.pack.configFrom
    ? reg.pack.configFrom(def)
    : def.capabilities?.[reg.pack.name];
  if (source == null) {
    return null;
  }
  return 'spec' in source ? (source as CapabilityConfig) : {};
}

export function resolveCapabilities(
  def: AgentDefinition,
  registrations: CapabilityRegistration[],
): { enabled: ResolvedCapability[]; diagnostics: CapabilityDiagnostic[] } {
  const diagnostics: CapabilityDiagnostic[] = [];
  const byName = new Map(registrations.map((r) => [r.pack.name, r]));
  const enabled: ResolvedCapability[] = [];
  for (const reg of [...registrations].sort((a, b) => a.pack.name.localeCompare(b.pack.name))) {
    const config = enabledConfig(reg, def);
    if (config === null) {
      continue;
    }
    const missingPort = (reg.pack.requires ?? []).find((p) => !(p in reg.ports));
    if (missingPort) {
      diagnostics.push({
        severity: 'error',
        code: 'capability_port_missing',
        message: `${reg.pack.name}: port "${missingPort}" not provided by host`,
      });
      continue;
    }
    const missingDep = (reg.pack.dependsOn ?? []).find(
      (d) => !byName.has(d) || enabledConfig(byName.get(d) as CapabilityRegistration, def) === null,
    );
    if (missingDep) {
      diagnostics.push({
        severity: 'error',
        code: 'capability_dep_missing',
        message: `${reg.pack.name}: depends on "${missingDep}"`,
      });
      continue;
    }
    enabled.push({ reg, config });
  }
  for (const name of Object.keys(def.capabilities ?? {})) {
    if (!byName.has(name) && def.capabilities?.[name] != null) {
      diagnostics.push({
        severity: 'warning',
        code: 'unknown_capability',
        message: `capability "${name}" is not registered by the host`,
      });
    }
  }
  return { enabled, diagnostics };
}
```

- [ ] **Step 2: `prompt.ts`**

Identity-блок — постоянная библиотеки; конкретные инструменты не упоминаются:

```ts
import type { ResolvedCapability } from './registry.ts';

export const CAPABILITY_IDENTITY = `You are an agent working in a workspace. Use only the tools listed in this session; never output <tool_call> XML tags, and if a tool you want is missing, describe your intent in plain text. Project conventions live in AGENTS.md at the workspace root; a nested AGENTS.md applies in its subtree — read it before editing there. Your role and extra rules follow at the end of this prompt.`;

export function composeSystemPrompt(
  agentText: string,
  enabled: ResolvedCapability[],
): string {
  const fragments = enabled
    .map((c) => c.reg.pack.prompt?.({ ports: c.reg.ports, resolveScope: c.reg.resolveScope, config: c.config }) ?? '')
    .filter((t) => t.trim().length > 0);
  const extra = agentText.trim();
  const parts = [CAPABILITY_IDENTITY, ...fragments];
  if (extra) {
    parts.push(`## Agent\n${extra}`);
  }
  return parts.join('\n\n');
}
```

- [ ] **Step 3: `tool-names.ts`**

```ts
import type { AgentDefinition } from '../../domain/agent-definition.ts';
import type { CapabilityRegistration } from '../../domain/capability.ts';
import { resolveCapabilities } from './registry.ts';

export type CapabilityCatalogEntry = {
  name: string;
  version: string;
  description: string;
  toolNames: string[];
  requires: string[];
};

export function capabilityToolNames(
  def: AgentDefinition,
  registrations: CapabilityRegistration[],
): string[] {
  const { enabled } = resolveCapabilities(def, registrations);
  return enabled.flatMap((c) =>
    c.reg.pack
      .tools({ ports: c.reg.ports, resolveScope: c.reg.resolveScope, config: c.config })
      .map((t) => t.name),
  );
}

export function allCapabilityToolNames(registrations: CapabilityRegistration[]): string[] {
  // фикстура-скоуп нужен только для вызова tools(); имена от него не зависят
  const stub = { workspaceId: '_', agentId: '_', threadId: '_' };
  return registrations.flatMap((r) =>
    r.pack
      .tools({ ports: r.ports, resolveScope: () => stub, config: {} })
      .map((t) => t.name),
  );
}

export function capabilityCatalog(
  registrations: CapabilityRegistration[],
): CapabilityCatalogEntry[] {
  const stub = { workspaceId: '_', agentId: '_', threadId: '_' };
  return [...registrations]
    .sort((a, b) => a.pack.name.localeCompare(b.pack.name))
    .map((r) => ({
      name: r.pack.name,
      version: r.pack.version,
      description: r.pack.description,
      requires: r.pack.requires ?? [],
      toolNames: r.pack
        .tools({ ports: r.ports, resolveScope: () => stub, config: {} })
        .map((t) => t.name),
    }));
}
```

- [ ] **Step 4: Экспорты в `index.ts`**

```ts
export type {
  CapabilityCatalogEntry,
  CapabilityDiagnostic,
  ResolvedCapability,
} from './src/application/capabilities/registry.ts';
export { resolveCapabilities } from './src/application/capabilities/registry.ts';
export { CAPABILITY_IDENTITY, composeSystemPrompt } from './src/application/capabilities/prompt.ts';
export {
  allCapabilityToolNames,
  capabilityCatalog,
  capabilityToolNames,
} from './src/application/capabilities/tool-names.ts';
```

(`CapabilityDiagnostic` экспортируется из `registry.ts`; `tool-names.ts` реэкспорт не дублирует.)

- [ ] **Step 5: Верификация**

`bunx tsc -p packages/harnesys/tsconfig.json --noEmit && bunx biome check packages/harnesys` — чисто.

- [ ] **Step 6: Commit**

`git add packages/harnesys && git commit -m "feat(harnesys): capability registry, identity block, prompt assembly"`

---

### Task 3: Библиотека — проводка пачек в рантайм

**Files:**
- Modify: `packages/harnesys/src/ports/create-runtime.ts`
- Modify: `packages/harnesys/src/application/create-runtime.ts`
- Modify: `packages/harnesys/src/application/session.ts`
- Modify: `packages/harnesys/src/application/run-engine.ts`
- Modify: `packages/harnesys/src/application/graph.ts`
- Modify: `packages/harnesys/src/application/llm.ts`

**Interfaces:**
- Consumes: Task 2
- Produces: `CreateRuntimeOptions.capabilities?: CapabilityRegistration[]`; `RuntimeHandle.capabilities.list(): CapabilityCatalogEntry[]`; `GraphOpts.capabilityRegistrations`; `LlmContext.capabilities: ResolvedCapability[]`; `RunTarget.capabilities?`

- [ ] **Step 1: Опция и handle**

В `ports/create-runtime.ts`: `import type { CapabilityRegistration } from '../domain/capability.ts';`, в `CreateRuntimeOptions` поле `capabilities?: CapabilityRegistration[];`, в `RuntimeHandle` — `capabilities: { list(): CapabilityCatalogEntry[] };` (тип из `application/capabilities/tool-names.ts`).

В `application/create-runtime.ts`: в `runtimeCtx` добавить `capabilityRegistrations: options.capabilities ?? []`; в `run`/`start` передать `capabilityRegistrations: options.capabilities ?? []` в `runGraph`/`startGraph`; в возвращаемый handle добавить `capabilities: { list: () => capabilityCatalog(options.capabilities ?? []) }`.

- [ ] **Step 2: RuntimeContext / RunTarget**

`session.ts`: в `RuntimeContext` — `capabilityRegistrations: CapabilityRegistration[];` (обязательное, create-runtime всегда кладёт массив). В `ports/run-targets.ts` — `capabilities?: CapabilityRegistration[]` на `RunTarget` (хост может отдать свой набор; иначе ctx).

- [ ] **Step 3: graph.ts — резолв и notes**

В `GraphOpts`: `capabilityRegistrations?: CapabilityRegistration[];`. В начале `startGraph` (после инициализации `opts`):

```ts
const caps = resolveCapabilities(opts.agent, opts.capabilityRegistrations ?? []);
```

В блок сбора notes (строки ~555–574, где `budgetNote` и `opts.notes`): после цикла провайдеров добавить провайдеры пачек:

```ts
for (const c of caps.enabled) {
  const provider = c.reg.pack.notes?.({
    ports: c.reg.ports,
    resolveScope: c.reg.resolveScope,
    config: c.config,
  });
  if (provider) {
    try {
      notes.push(...(await provider(noteCtx)));
    } catch {}
  }
}
```

В вызов `runLlmGenerate` в `LlmContext` передать `capabilities: caps.enabled`.

- [ ] **Step 4: llm.ts — сборка system**

В `LlmContext`: `capabilities?: ResolvedCapability[];`. Заменить строки 93–101 на:

```ts
const promptDef = ctx.agent.prompts[node.prompt];
const agentText = promptDef ? promptDef.instructions : '';
const slots = { input: ctx.input, state: ctx.state, output: ctx.output ?? null, resume: null };
const prompt = substitutePrompt(
  composeSystemPrompt(agentText, ctx.capabilities ?? []),
  slots,
);
```

`composeSystemPrompt`/типы — импорт из `./capabilities/prompt.ts`/`./capabilities/registry.ts`. При пустом `capabilities` результат — identity + `## Agent <текст>`; это осознанное изменение формата для всех хостов (спека, решение 2).

- [ ] **Step 5: run-engine.ts — прокидывание**

Там, где `graphOpts` собирается (строки ~113–143), добавить `capabilityRegistrations: opts.capabilities ?? deps.capabilityRegistrations` (`deps` — RuntimeContext из create-runtime; поле `capabilities` уже есть на RunTarget).

- [ ] **Step 6: Верификация**

`bunx tsc -p packages/harnesys/tsconfig.json --noEmit && bunx biome check packages/harnesys` — чисто. Поведение пока не меняется: пачек ещё нет, `composeSystemPrompt` с пустым списком добавляет identity-блок к существующему тексту агента.

- [ ] **Step 7: Commit**

`git add packages/harnesys && git commit -m "feat(harnesys): wire capability packs into runtime"`

---

### Task 4: Пачка plan

**Files:**
- Create: `packages/harnesys/src/ports/plan.ts`
- Create: `packages/harnesys/src/domain/plan.ts`
- Create: `packages/harnesys/src/capabilities/plan/create-plan-tools.ts`
- Create: `packages/harnesys/src/capabilities/plan/prompt.ts`
- Create: `packages/harnesys/src/capabilities/plan/index.ts`
- Modify: `packages/harnesys/index.ts`

**Interfaces:**
- Consumes: `tool()` (`ports/tools.ts`), `CapabilityScope`, `registerCapability`, `LlmNoteProvider`
- Produces: `PlanPort`, `PlanSnapshot`, `PlanItem`, `planFollowPrompt`, `planCapability: CapabilityPack<PlanCapabilityPorts>`, `PlanCapabilityPorts = { plan: PlanPort }`

- [ ] **Step 1: Доменные типы плана**

`domain/plan.ts` — перенести из `apps/studio/shared/plan-types.ts` дословно: `PLAN_ITEM_STATUSES`/`PlanItemStatus`, `PLAN_STATUSES`/`PlanStatus`, `SUBAGENT_ROLES`/`SubagentRole`. Студийный файл заменить реэкспортом из `harnesys` (имена типов не менять — их читают plan use cases и клиент через `@studio/shared`).

- [ ] **Step 2: `ports/plan.ts`**

```ts
import type { CapabilityScope } from '../domain/capability.ts';
import type { PlanItemStatus, SubagentRole } from '../domain/plan.ts';

export type PlanItem = {
  id: string;
  order: number;
  title: string;
  description: string;
  status: PlanItemStatus;
  subagentRole?: SubagentRole | null;
  resultNote?: string | null;
};

export type PlanSnapshot = {
  id: string;
  status: PlanStatus;
  overview: string;
  items: PlanItem[];
};

export type PlanSaveItemInput = {
  title: string;
  description: string;
  subagentRole?: SubagentRole | null;
};

export type PlanPort = {
  save(scope: CapabilityScope, input: { overview: string; items: PlanSaveItemInput[] }): Promise<PlanSnapshot>;
  updateItem(
    scope: CapabilityScope,
    input: { planId: string; itemId: string; status: PlanItemStatus; resultNote?: string | null },
  ): Promise<PlanSnapshot>;
  get(scope: CapabilityScope): Promise<PlanSnapshot | null>;
};
```

(`PlanStatus` — импорт из `domain/plan.ts`.)

- [ ] **Step 3: Перенос инструментов**

`git mv apps/studio/server/application/host-tools/create-plan-tools.ts packages/harnesys/src/capabilities/plan/create-plan-tools.ts` и три точечные замены в тексте файла:
1. `import { type ToolDefinition, tool } from 'harnesys';` → `import type { ToolDefinition } from '../../ports/tools.ts'; import { tool } from '../../ports/tools.ts';`
2. `import type { PlanItemStatus, SubagentRole } from '../../../shared/types.ts';` → `import type { PlanItemStatus, SubagentRole } from '../../domain/plan.ts';`
3. `import { requireHostToolScope } from '../../adapters/host-tool-scope.ts';` и `import { runHostTool } from './run-host-tool.ts';` и импорты use-case'ов → параметры фабрики: `createPlanTools(deps: { plan: PlanPort; resolveScope: () => CapabilityScope })`; внутри `requireHostToolScope()` → `resolveScope()`, `runHostTool(fn)` → локальный `runGuard(fn)` (тот же try/catch, копия 7 строк из `run-host-tool.ts` в этот файл), вызовы `deps.savePlan.execute({ threadId, ... })` → `deps.plan.save(resolveScope(), { ... })` и аналогично updateItem/get. Описания инструментов и JsonSchema — без изменений.

- [ ] **Step 4: notes + prompt + пачка**

`capabilities/plan/prompt.ts` — перенести `planFollowPrompt` и `escapeXml` дословно из `apps/studio/server/application/threads/plan-mode-prompt.ts` (кроме `PLAN_MODE_PROMPT` — он остаётся в студии). Фрагмент пачки:

```ts
export const PLAN_PROMPT_FRAGMENT = `## Planning
- plan_save: store the execution plan for this thread (overview + ordered items). One active plan per thread; plan_save replaces it.
- plan_item_update: mark items in_progress before work and completed/failed after, using exact ids from plan_get. plan_get reads the current plan.`;
```

`capabilities/plan/index.ts`:

```ts
import { defineCapability } from '../../domain/capability.ts';
import type { PlanPort } from '../../ports/plan.ts';
import { createPlanTools } from './create-plan-tools.ts';
import { PLAN_PROMPT_FRAGMENT, planFollowPrompt } from './prompt.ts';

export type PlanCapabilityPorts = { plan: PlanPort };

export const planCapability = defineCapability<PlanCapabilityPorts>({
  name: 'plan',
  version: '1.0.0',
  description: 'Thread execution plans: plan_save / plan_item_update / plan_get',
  requires: ['plan'],
  tools: (ctx) => createPlanTools({ plan: ctx.ports.plan, resolveScope: ctx.resolveScope }),
  prompt: () => PLAN_PROMPT_FRAGMENT,
  notes: (ctx) => async (noteCtx) => {
    const plan = await ctx.ports.plan.get({
      workspaceId: noteCtx.agentId, // PlanPort scope резолвится из host-скоупа
      agentId: noteCtx.agentId,
      threadId: noteCtx.sessionId,
    });
    if (!plan || plan.status === 'completed' || plan.status === 'cancelled') {
      return [];
    }
    const next =
      plan.items.find((item) => item.status === 'in_progress') ??
      plan.items.find((item) => item.status === 'pending');
    if (!next) {
      return [];
    }
    return [{ tag: 'active-plan', text: planFollowPrompt(plan, next) }];
  },
});
```

Примечание исполнителю: `LlmNoteContext` (`application/llm-notes.ts:11`) несёт `agentId`/`sessionId`, но не `workspaceId`. Завести в `CapabilityPack.notes` контекст `(ctx: CapabilityPackContext<Ports> & { noteScope: (llmCtx: LlmNoteContext) => CapabilityScope })` нельзя без правки llm-notes — вместо этого notes-фабрика принимает `resolveScope` из регистрационных портов: вызывать `ctx.ports.plan.get(ctx.resolveScope())`, а `resolveScope` обязан работать внутри note-колбэка (host оборачивает шаг в AsyncLocalStorage — студия уже так делает в `runInHostToolScope`). Убрать конструирование скоупа из noteCtx.

- [ ] **Step 5: Экспорты**

```ts
export type { PlanPort, PlanSnapshot, PlanItem, PlanSaveItemInput } from './src/ports/plan.ts';
export type { PlanItemStatus, PlanStatus, SubagentRole } from './src/domain/plan.ts';
export { PLAN_ITEM_STATUSES, PLAN_STATUSES, SUBAGENT_ROLES } from './src/domain/plan.ts';
export { planCapability } from './src/capabilities/plan/index.ts';
export type { PlanCapabilityPorts } from './src/capabilities/plan/index.ts';
export { planFollowPrompt } from './src/capabilities/plan/prompt.ts';
```

- [ ] **Step 6: Верификация + commit**

`bunx tsc -p packages/harnesys/tsconfig.json --noEmit && bunx biome check packages/harnesys` — чисто (студия ещё ссылается на старые файлы — typecheck студии сломается на удалённом create-plan-tools; правку импорта в `wire-host-tools.ts` сделать в этом же таске: `import { createPlanTools } from 'harnesys/...'` пока не доступен, поэтому временно: оставить в студии re-export-обёртку `host-tools/create-plan-tools.ts` → `export { createPlanTools } from 'harnesys'` НЕ делать; вместо этого перенос файлов план/scheduler/webhook-тулов выполняется в таске 11 одним переключением. Здесь создаётся только библиотечная копия, студийный файл не трогать до таска 11).

`git add packages/harnesys && git commit -m "feat(harnesys): plan capability pack"`

---

### Task 5: Пачка threads

**Files:**
- Create: `packages/harnesys/src/ports/threads.ts`
- Create: `packages/harnesys/src/capabilities/threads/create-thread-tools.ts`
- Create: `packages/harnesys/src/capabilities/threads/index.ts`
- Modify: `packages/harnesys/index.ts`

**Interfaces:**
- Consumes: `tool()`, `CapabilityScope`, `defineCapability`
- Produces: `ThreadsPort { list(scope): Promise<ThreadSummary[]> }`, `ThreadSummary = { id, name, agentId?, hasSchedule? }`, `threadsCapability` (`name: 'threads'`, tool `thread_list`)

- [ ] **Step 1: Порт**

```ts
import type { CapabilityScope } from '../domain/capability.ts';

export type ThreadSummary = {
  id: string;
  name: string;
  agentId?: string;
  hasSchedule?: boolean;
};

export type ThreadsPort = {
  list(scope: CapabilityScope): Promise<ThreadSummary[]>;
};
```

- [ ] **Step 2: Инструмент**

Скопировать блок `tool('thread_list', {...})` из `apps/studio/server/application/host-tools/create-schedule-tools.ts:73-96` дословно в `create-thread-tools.ts` (импорты по образцу Task 4 step 3; deps: `{ threads: ThreadsPort; resolveScope }`; execute: `deps.threads.list(resolveScope())`, форматирование вывода — как в исходнике).

- [ ] **Step 3: Пачка**

```ts
export const threadsCapability = defineCapability<ThreadsCapabilityPorts>({
  name: 'threads',
  version: '1.0.0',
  description: 'Thread discovery: thread_list',
  requires: ['threads'],
  tools: (ctx) => createThreadTools({ threads: ctx.ports.threads, resolveScope: ctx.resolveScope }),
  prompt: () => `## Threads
- thread_list — threads in this workspace with ids; use an id as threadId on schedule_set to wake another conversation.`,
});
```

- [ ] **Step 4: Экспорты, верификация, commit**

`export { threadsCapability } ...`, `export type { ThreadsPort, ThreadSummary } ...` в `index.ts`; typecheck+biome; `git commit -m "feat(harnesys): threads capability pack"`.

---

### Task 6: Пачка scheduler

**Files:**
- Create: `packages/harnesys/src/ports/scheduler.ts`
- Create: `packages/harnesys/src/capabilities/scheduler/create-schedule-tools.ts`
- Create: `packages/harnesys/src/capabilities/scheduler/index.ts`
- Modify: `packages/harnesys/index.ts`

**Interfaces:**
- Consumes: Task 5 (`threadsCapability` имя для dependsOn), `tool()`
- Produces: `SchedulerPort`, `ScheduleRecord`, `formatScheduleWake`, `schedulerCapability` (`dependsOn: ['threads']`, tools `schedule_list/set/pause/delete/peek`)

- [ ] **Step 1: Типы и порт**

`ScheduleHistory`/`SCHEDULE_HISTORIES` и `PermissionMode`/`PERMISSION_MODES` перенести из `apps/studio/shared/types.ts:175-190` в `packages/harnesys/src/domain/schedule.ts` (студийный types.ts — реэкспорт). `ports/scheduler.ts`:

```ts
export type ScheduleStatus = 'active' | 'paused' | 'failed';

export type ScheduleRecord = {
  id: string;
  workspaceId: string;
  name: string;
  status: ScheduleStatus;
  targetAgentId: string;
  detail: string;
  cron: string;
  mode: PermissionMode;
  history: ScheduleHistory;
  historyLast: number;
  threadId: string;
  nextRunAt: string | null;
  lastFiredAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SchedulerPort = {
  list(scope: CapabilityScope): Promise<ScheduleRecord[]>;
  peek(scope: CapabilityScope, id: string): Promise<{ fires: { at: string; detail: string }[] }>;
  create(scope: CapabilityScope, input: ScheduleCreateInput): Promise<ScheduleRecord>;
  update(scope: CapabilityScope, id: string, patch: ScheduleUpdateInput): Promise<ScheduleRecord>;
  remove(scope: CapabilityScope, id: string): Promise<void>;
};
```

`ScheduleCreateInput`/`ScheduleUpdateInput` — вывести из фактических полей, которые читает `create-schedule-tools.ts` при вызовах use case'ов (name, cron, detail, threadId, targetAgentId, mode, history); исполнитель заполняет точным списком после чтения use-case'ов, типы живут в `ports/scheduler.ts`.

- [ ] **Step 2: Инструменты**

Перенести блоки `schedule_list`/`schedule_peek`/`schedule_set`/`schedule_pause`/`schedule_delete` из `create-schedule-tools.ts` (кроме `thread_list` — он в threads) в `capabilities/scheduler/create-schedule-tools.ts`, deps: `{ scheduler: SchedulerPort; resolveScope }`, замены по образцу Task 4 step 3. Описания — дословно.

- [ ] **Step 3: Конверт wake и пачка**

```ts
export function formatScheduleWake(name: string, detail: string): string {
  return `<schedule name="${name}">\n${detail}\n</schedule>`;
}
```

Пачка: `name: 'scheduler'`, `requires: ['scheduler']`, `dependsOn: ['threads']`, tools — фабрика, prompt —Wake-секция из `DEFAULT_AGENT_SYSTEM:17-22` дословно, кроме строки про `.studio/todo.md` (заменить на `Write detail as a checklist of concrete work for the waking agent; do one quantum, update project files per your instructions, stop.`) и строки `thread_list` (переехала в threads-фрагмент).

- [ ] **Step 4: Экспорты, верификация, commit**

`git commit -m "feat(harnesys): scheduler capability pack"`

---

### Task 7: Пачка webhook

**Files:**
- Create: `packages/harnesys/src/ports/webhook.ts`
- Create: `packages/harnesys/src/capabilities/webhook/create-webhook-tools.ts`
- Create: `packages/harnesys/src/capabilities/webhook/index.ts`
- Modify: `packages/harnesys/index.ts`

**Interfaces:**
- Consumes: `tool()`
- Produces: `WebhookPort { list, create, update, remove }` над `WebhookRecord`, `webhookCapability`

- [ ] **Step 1: Типы и порт**

`WebhookRecord` — поля из `apps/studio/server/domain/webhook.port.ts:3-16` дословно. `WebhookPort` — четыре метода по образцу `SchedulerPort` (scope-first, без `peek`).

- [ ] **Step 2: Инструменты**

Перенести `webhook_list`/`webhook_set`/`webhook_delete` из `create-webhook-tools.ts` дословно, deps `{ webhook: WebhookPort; resolveScope }`, замены по образцу Task 4 step 3.

- [ ] **Step 3: Пачка**

`name: 'webhook'`, `requires: ['webhook']`, prompt — строки `DEFAULT_AGENT_SYSTEM:19,20` про webhook (`- webhook_list / webhook_set / webhook_delete — inbound HTTP that wakes an agent with detail.` + `Webhooks deliver their own detail text as the wake message.`).

- [ ] **Step 4: Экспорты, верификация, commit**

`git commit -m "feat(harnesys): webhook capability pack"`

---

### Task 8: Memory-пачки и мост к AgentMemoryConfig

**Files:**
- Create: `packages/harnesys/src/capabilities/memory/pin.ts`
- Create: `packages/harnesys/src/capabilities/memory/semantic.ts`
- Create: `packages/harnesys/src/capabilities/memory/episodic.ts`
- Create: `packages/harnesys/src/capabilities/memory/knowledge.ts`
- Create: `packages/harnesys/src/capabilities/memory/index.ts`
- Modify: `packages/harnesys/index.ts`

**Interfaces:**
- Consumes: существующие `createPinTools`/`createSemanticTools`/`createEpisodicTools`/`createKnowledgeTools` (`application/memory/*`), порты `ports/memory.ts`
- Produces: `pinMemoryCapability`, `semanticMemoryCapability`, `episodicMemoryCapability`, `knowledgeMemoryCapability` — каждая с `configFrom: (def) => def.memory?.pin` (и т.д.), tools — существующие фабрики, prompt — фрагменты из `DEFAULT_AGENT_SYSTEM`

- [ ] **Step 1: Четыре пачки**

Образец (pin), остальные по той же форме:

```ts
import { defineCapability } from '../../domain/capability.ts';
import type { PinPort } from '../../ports/memory.ts';
import { createPinTools } from '../../application/memory/create-pin-tools.ts';

export type PinMemoryPorts = { pin: PinPort };

export const pinMemoryCapability = defineCapability<PinMemoryPorts>({
  name: 'pin-memory',
  version: '1.0.0',
  description: 'Pinned rules visible to the agent: pin_set / pin_list / pin_remove',
  requires: ['pin'],
  configFrom: (def) => def.memory?.pin,
  tools: (ctx) =>
    createPinTools({ port: ctx.ports.pin, resolveScope: ctx.resolveScope }),
  prompt: () => `## Durable state
- pin_set: short rules that must stay in this agent's window. pin_list / pin_remove to maintain.`,
});
```

Фрагменты: semantic — строки `DEFAULT_AGENT_SYSTEM:12-13` (memory_write session/long, memory_list, memory_delete); episodic — строка 8 (`recall_search`) под заголовком `## Recall`; knowledge — строка 6 (`knowledge_search/read`) под `## Knowledge`. `sessionTtl`/`topK` читать из `ctx.config.spec` (PortRef.spec приходит через configFrom как `{ spec }` — мост `PortRef → CapabilityConfig` в `enabledConfig` Task 2 уже сохраняет `spec`).

- [ ] **Step 2: `capabilities/memory/index.ts`**

`export const memoryCapabilities = { pin: pinMemoryCapability, semantic: ..., episodic: ..., knowledge: ... } as const;` — массив `memoryCapabilityList` для хостов.

- [ ] **Step 3: Экспорты, верификация, commit**

`git commit -m "feat(harnesys): memory capability packs"`

---

### Task 9: Базовые пачки files/shell/fetch и skills-пачка

**Files:**
- Create: `packages/harnesys/src/capabilities/base.ts`
- Create: `packages/harnesys/src/capabilities/skills.ts`
- Modify: `packages/harnesys/src/application/create-runtime.ts`
- Modify: `packages/harnesys/index.ts`

**Interfaces:**
- Consumes: `files()/shell()/fetch()/askUser()` (`adapters/actions`), `SkillRegistry`, `formatSkillsCatalog`, `filterSkills`
- Produces: `filesCapability`, `shellCapability`, `fetchCapability`, `skillsCapability`; `createRuntime` регистрирует skills-пачку автоматически при `options.skills`

- [ ] **Step 1: `capabilities/base.ts`**

Пачки без портов (`requires: []`), tools — существующие фабрики действий, prompt — фрагменты: files — строка 5 (`read_file, grep, glob, list_dir`) под `## Retrieval`; shell — строка 40 (git status/diff/log) под `## Workspace`; fetch — строка 7. `configFrom: (def) => def.capabilities?.['files']` (дефолтный механизм, без моста).

- [ ] **Step 2: `capabilities/skills.ts`**

```ts
export type SkillsCapabilityPorts = { skills: SkillRegistry };

export const skillsCapability = defineCapability<SkillsCapabilityPorts>({
  name: 'skills',
  version: '1.0.0',
  description: 'Skill catalog and load_skill',
  requires: ['skills'],
  tools: (ctx) => [createLoadSkillTool(filterSkills(ctx.ports.skills, ctx.config.spec?.allow as string[] | undefined))],
  notes: (ctx) => async () => {
    const catalog = formatSkillsCatalog(await ctx.ports.skills.list());
    return catalog ? [{ tag: 'skills', text: catalog }] : [];
  },
});
```

`configFrom: (def) => def.capabilities?.skills ?? (def.skills?.length ? { spec: { allow: def.skills } } : {})` — пачка включена по умолчанию (сохраняет текущее поведение: `load_skill` есть у всех), allowlist `agent.skills` применяется через `filterSkills` только когда список непустой (задел из спеки), `capabilities.skills: null` — выключить.

- [ ] **Step 3: create-runtime**

При `options.skills` не строить `createLoadSkillTool` напрямую (строки 35–36 удалить), а дописывать в `options.capabilities` регистрацию `registerCapability(skillsCapability, { skills: options.skills }, stubScope)`; stub-скоуп для skills не нужен (tools/notes его не вызывают).

- [ ] **Step 4: Верификация, commit**

`git commit -m "feat(harnesys): base and skills capability packs, skill catalog injection"`

---

### Task 10: Studio — реализации портов

**Files:**
- Create: `apps/studio/server/adapters/capabilities/sqlite-plan.port.ts`
- Create: `apps/studio/server/adapters/capabilities/sqlite-threads.port.ts`
- Create: `apps/studio/server/adapters/capabilities/sqlite-scheduler.port.ts`
- Create: `apps/studio/server/adapters/capabilities/sqlite-webhook.port.ts`

**Interfaces:**
- Consumes: use cases `SavePlanUseCase`/`UpdatePlanItemUseCase`/`GetThreadPlanUseCase`, `ListSchedulesUseCase`/`CreateScheduleUseCase`/`UpdateScheduleUseCase`/`DeleteScheduleUseCase`/`PeekScheduleUseCase`, webhook use cases, `ListThreadsUseCase`; типы `PlanPort`/`SchedulerPort`/`WebhookPort`/`ThreadsPort` из `harnesys`
- Produces: четыре класса портов; маппинги `ThreadPlanRecord → PlanSnapshot`, `Schedule → ScheduleRecord`, `Webhook → WebhookRecord`, `Thread → ThreadSummary`

- [ ] **Step 1: Четыре порта-обёртки**

Каждый: конструктор принимает существующий use case (deps те же, что сейчас у `wire-host-tools.ts:56-133`), метод порта = `execute({ threadId: scope.threadId, ... })` + маппинг ответа в библиотечный тип. Маппинг плана: `items: r.items.map(({ id, order, title, description, status, subagentRole, resultNote }) => ...)` — поля `PlanItem`. Orchestration (UoW, deskEvents, cron-калькулятор, очередь fires) не трогать — она внутри use case'ов.

- [ ] **Step 2: Верификация, commit**

`bun run typecheck` в `apps/studio` — чисто (порты ещё никем не вызываются). `git commit -m "feat(studio): capability port implementations"`

---

### Task 11: Studio — переключение на пачки (атомарно)

**Files:**
- Modify: `apps/studio/server/composition/studio.ts`
- Modify: `apps/studio/server/composition/wire-host-tools.ts` (удалить)
- Modify: `apps/studio/server/adapters/workspace-harnesys.registry.ts`
- Modify: `apps/studio/server/adapters/studio-run-targets.adapter.ts`
- Modify: `apps/studio/server/adapters/http/workspace/workspace-file-routes.ts` (tools-каталог, см. step 5)
- Delete: `apps/studio/server/application/host-tools/create-plan-tools.ts`, `create-schedule-tools.ts`, `create-webhook-tools.ts`, `run-host-tool.ts`
- Delete: `apps/studio/server/application/threads/plan-notes.ts`, `agent-document-from-row.ts`
- Delete: `apps/studio/shared/default-agent-instructions.ts`
- Modify: `apps/studio/shared/plan-types.ts`, `apps/studio/shared/types.ts` (реэкспорты)

**Interfaces:**
- Consumes: Tasks 3–10
- Produces: рантайм студии на пачках; `prompts.main.instructions = agent.instructions` как есть

- [ ] **Step 1: Регистрации**

В `studio.ts` (где создаётся `WorkspaceHarnesysRegistry`, строки ~144–156) собрать `capabilityRegistrations: CapabilityRegistration[]`:

```ts
const resolveScope = () => requireHostToolScope();
const capabilityRegistrations = [
  registerCapability(planCapability, { plan: new SqlitePlanPort({...}) }, resolveScope),
  registerCapability(threadsCapability, { threads: new SqliteThreadsPort({...}) }, resolveScope),
  registerCapability(schedulerCapability, { scheduler: new SqliteSchedulerPort({...}) }, resolveScope),
  registerCapability(webhookCapability, { webhook: new SqliteWebhookPort({...}) }, resolveScope),
  registerCapability(pinMemoryCapability, { pin: memory.pin }, resolveScope),
  registerCapability(semanticMemoryCapability, { semantic: memory.semantic }, resolveScope),
  registerCapability(episodicMemoryCapability, { episodic: memory.episodic }, resolveScope),
  registerCapability(knowledgeMemoryCapability, { knowledge: memory.knowledge }, resolveScope),
];
```

Порядок аргументов конструкторов use case'ов — из текущего `wire-host-tools.ts`. `WorkspaceHarnesysRegistry` принимает `capabilityRegistrations` вместо `notes`-массива; `createRuntime` вызывается с `capabilities: [...registrations]` (skills-пачку добавляет create-runtime сам).

- [ ] **Step 2: Registry без композиции**

`workspace-harnesys.registry.ts`: удалить импорт/вызов `composeAgentSystem` (строки 19, 130), `prompts: { main: { instructions: agent.instructions } }`. Удалить `apps/studio/shared/default-agent-instructions.ts`.

- [ ] **Step 3: Run targets**

`studio-run-targets.adapter.ts:57-63`: заменить `memoryToolNames`-фильтр на:

```ts
const enabled = new Set(capabilityToolNames(agent, registrations));
for (const name of allCapabilityToolNames(registrations)) {
  if (!enabled.has(name)) {
    registry.delete(name);
  }
}
```

`registrations` — тот же массив из шага 1 (передать в конструктор `StudioRunTargets`). `notes` из RunTarget убрать: провайдеры пачек даёт graph.

- [ ] **Step 4: Удаление старого**

Удалить файлы из шапки таска. `plan-types.ts`: `PLAN_*`/`SUBAGENT_ROLES`-блоки заменить на `export { ... } from 'harnesys';` (имена сохранить — их импортируют серверные use cases и клиент). `types.ts`: `PermissionMode`/`ScheduleHistory` — реэкспорт из `harnesys`. `wire-host-tools.ts` и его вызов в `studio.ts` удалить; `createMemoryTools` из `host-tools/` тоже (его функции выполняют memory-пачки) — файл `application/host-tools/create-memory-tools.ts` удалить, `host-tool-scope.ts` оставить (его использует `resolveScope`).

- [ ] **Step 5: Tools-каталог воркспейса**

`GET /api/workspaces/:id/tools` должен отдавать `runtime.tools.list()` без изменений — пачечные тулы там окажутся сами (реестр createRuntime пополняется регистрациями). Проверить curl на стенде.

- [ ] **Step 6: Верификация на стенде**

`bun run typecheck` (studio) + `bunx biome check .`. Curl-смоук на :3000: создать тред Jarvis'а (у него `capabilities` ещё пустые — ожидаем identity + `## Agent` без plan/schedule-тулов), отправить сообщение, убедиться что run завершается. Затем временно через PATCH `{"capabilities":{"plan":{},"threads":{},"scheduler":{}}}` — повторить, в дебаг-логе промпта должны появиться фрагменты `## Planning`, `## Threads`, `## Wake`.

- [ ] **Step 7: Commit**

`git add -A apps/studio && git commit -m "feat(studio): run agents on harnesys capability packs"`

---

### Task 12: Studio — поле capabilities в записи агента

**Files:**
- Modify: `apps/studio/server/adapters/store/sqlite/bootstrap.ts`
- Modify: `apps/studio/server/adapters/store/sqlite/schema/agents.ts`
- Modify: `apps/studio/server/adapters/store/sqlite/repos/sqlite-agent.repo.ts`
- Modify: `apps/studio/server/domain/agent.port.ts`
- Modify: `apps/studio/server/adapters/http/agent/agent.body.ts`
- Modify: `apps/studio/server/adapters/http/agent/agent.controller.ts`
- Modify: `apps/studio/server/application/agents/create-agent.use-case.ts`
- Modify: `apps/studio/server/application/agents/update-agent.use-case.ts`
- Modify: `apps/studio/shared/types.ts`

**Interfaces:**
- Consumes: `CapabilityConfig` из `harnesys`
- Produces: `Agent.capabilities: Record<string, CapabilityConfig | null>` через весь стек

- [ ] **Step 1: Схема и миграция**

В `schema/agents.ts`: `capabilitiesJson: text('capabilities_json').notNull().default('{}')`. В `bootstrap.ts` по образцу `budget_json`: `ALTER TABLE agents ADD COLUMN capabilities_json TEXT NOT NULL DEFAULT '{}';` заguarded проверкой колонки (там же, где `budget`).

- [ ] **Step 2: Repo/port/body/use cases**

`agent.port.ts`: `capabilities: Record<string, CapabilityConfig | null>` + опциональный в insert/patch. `sqlite-agent.repo.ts`: `parseJsonColumn`/`JSON.stringify` по образцу `budget` (строки ~143–147). `agent.body.ts`: `capabilities: z.record(z.string(), z.object({ spec: z.record(z.string(), z.unknown()).nullish() }).nullish()).optional()`. Create/update use cases: прокинуть как `budget`. `shared/types.ts`: поле в `AgentRecord`/create/update-типах.

- [ ] **Step 3: Дефолт Jarvis**

PATCH на стенде: `{"capabilities":{"plan":{},"threads":{},"scheduler":{},"webhook":{},"files":{},"shell":{},"fetch":{}}}` — вернуть Jarvis'у поведение до миграции (его instructions уже содержат файловые конвенции).

- [ ] **Step 4: Верификация, commit**

typecheck + curl GET агента (поле есть), повторный смоук Task 11 step 6. `git commit -m "feat(studio): agent capabilities record field"`

---

### Task 13: Studio — каталог пачек для UI

**Files:**
- Create: `apps/studio/server/adapters/http/workspace/capability-routes.ts`
- Modify: `apps/studio/server/adapters/http/workspace/workspace.controller.ts`

**Interfaces:**
- Consumes: `runtime.capabilities.list()` (Task 3)
- Produces: `GET /api/workspaces/:id/capabilities` → `{ capabilities: CapabilityCatalogEntry[] }`

- [ ] **Step 1: Роут**

По образцу существующего `GET /api/workspaces/:id/tools` в `workspace-file-routes.ts`: резолв runtime через `WorkspaceHarnesysRegistry.get(workspace)`, ответ `{ capabilities: runtime.capabilities.list() }`.

- [ ] **Step 2: Верификация, commit**

`curl -s localhost:3000/api/workspaces/ac11b9fb-e87c-4f48-bf89-e053c38d13d3/capabilities` — массив из 12+ пачек с toolNames. `git commit -m "feat(studio): capability catalog endpoint"`

---

### Task 14: Клиент — тип, запрос, схема формы

**Files:**
- Modify: `apps/studio/client/src/entities/agent/model/agent.ts`
- Modify: `apps/studio/client/src/entities/agent/model/agent-record.ts`
- Modify: `apps/studio/client/src/shared/api/workspaces.ts`
- Modify: `apps/studio/client/src/shared/api/agents.ts`
- Modify: `apps/studio/client/src/features/manage-agent/model/agent-fields.ts`
- Modify: `apps/studio/client/src/features/manage-agent/model/create-agent.ts`, `update-agent.ts`

**Interfaces:**
- Consumes: `CapabilityConfig`, `CapabilityCatalogEntry` из `@studio/shared` (реэкспорт harnesys)
- Produces: `Agent.capabilities`, `workspaceCapabilitiesQuery(workspaceId)`, capabilities в патчах create/update

- [ ] **Step 1: Типы и api**

`shared/types.ts` уже получит поле в Task 12. `entities/agent/model/agent.ts`: `capabilities` в `Agent` и в `AgentPatch` union. `agent-record.ts`: маппинг из записи. `shared/api/workspaces.ts`: `export type WorkspaceCapabilitiesResponse = { capabilities: WorkspaceCapability[] }` (`CapabilityCatalogEntry as WorkspaceCapability`), query-key и fetcher по образцу `workspaceToolsQuery` (строки 110–114). `shared/api/agents.ts`: `capabilities?` в create/update-запросах.

- [ ] **Step 2: Формы**

`agent-fields.ts`: в output — `capabilities: Record<string, CapabilityConfig | null>` (пока passthrough из агента, редактор — Task 15); `create-agent.ts`/`update-agent.ts` прокидывают в запрос.

- [ ] **Step 3: Верификация, commit**

`bun run typecheck` в apps/studio. `git commit -m "feat(studio): client agent capabilities plumbing"`

---

### Task 15: Клиент — панель Capabilities

**Files:**
- Create: `apps/studio/client/src/features/manage-agent/ui/draft-capability-packs.tsx`
- Modify: `apps/studio/client/src/features/manage-agent/ui/agent-config-dialog.tsx`
- Modify: `apps/studio/client/src/features/manage-agent/ui/draft-capabilities.tsx`
- Modify: `apps/studio/client/src/features/manage-agent/model/agent-config.ts`

**Interfaces:**
- Consumes: `workspaceCapabilitiesQuery`, `AgentCapabilitiesDraft`
- Produces: категория `capabilities` в диалоге; `draft.capabilities` уходит в PATCH

- [ ] **Step 1: Панель**

`DraftCapabilityPacks({ workspaceId, value, onChange })`: query каталога, на строку — `Switch` (вкл = `{}`, выкл = `null`), подпись `name vX — description`, список toolNames мелким шрифтом. Порядок — из каталога (он отсортирован). Memory-пачки (`*-memory`) в списке скрыть: их включает панель Memory (источник — `agent.memory`).

- [ ] **Step 2: Диалог**

`AgentConfigCategory` += `'capabilities'` (иконка `LayersIcon`), категория после `instructions`; `AgentCapabilitiesDraft` += `capabilities`; `initialCapabilities` читает `agent?.capabilities ?? {}`; результат submit уходит в `updateAgent`/`createAgent`.

- [ ] **Step 3: Чистка draft-capabilities.tsx**

Убрать `MEMORY_TOOL_SLOT`/`memoryToolEnabled` и фильтр `group.id !== 'memory'` (строки 13–31, 64–66): tools-панель показывает весь каталог, видимость memory решает пачка.

- [ ] **Step 4: Верификация, commit**

`bun run typecheck`; ручная проверка на :5173 (хозяин или по согласованию скрин): включить/выключить `plan` у Jarvis, сохранить, открыть тред — фрагмент `## Planning` появляется/исчезает (видно в дебаг-логе промпта на сервере). `git commit -m "feat(studio): agent capabilities pane"`

---

### Task 16: Документ-контракт расширения

**Files:**
- Create: `docs/capability-packs.md`

**Interfaces:**
- Consumes: всё выше
- Produces: контракт для будущих пачек и хостов

- [ ] **Step 1: Написать контракт**

Разделы: модель пачки (тип + `defineCapability`/`registerCapability`); два уровня расширения — data (SKILL.md с frontmatter `name/description/when_to_use`, `.mcp.json`; поля манифеста совместимы с Claude plugin.json `name/version/description/author`) и code (npm-пакет с `CapabilityPack`); правила фрагментов (самодостаточность, `dependsOn` вместо ссылок, sort-by-name, bump версии при правке текста); критерий минимальности порта (execute() ≤ 2–3 методов порта, иначе двигать границу); чеклист добавления пачки: порт → фабрика тулов → фрагмент → `defineCapability` → регистрация у хостов → каталог → панель UI.

- [ ] **Step 2: Commit**

`git commit -m "docs: capability pack extension contract"`

---

## Self-review (заполняется после написания)

1. Покрытие спеки: решения 1–5 → таски 1–3 (модель/сборка), 4–9 (пачки), 10–13 (сервер), 14–15 (клиент), 16 (контракт). Compaction — вне (решение 6). Мёртвые заделы: `filterSkills`/`formatSkillsCatalog` — Task 9; `agent-document-from-row` — Task 11; `projectForWindow` — вне скоупа (отдельная спека).
2. Замечание исполнителю в Task 4 step 4 (notes-скоуп) — обязательная правка контракта `CapabilityPack.notes`: сигнатура `notes: (ctx) => LlmNoteProvider`, где `resolveScope` вызывается внутри колбэка; проверить, что graph.ts дёргает notes внутри host-обёртки скоупа (студия делает это в run-engine segment — уточнить на стенде Task 11 step 6).
3. Типы сверены: `CapabilityRegistration`, `ResolvedCapability`, `PlanPort.save`, `capabilityToolNames` — единые во всех тасках.
