# Agent Budget + Runtime Notes — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Бюджет агента с политиками `ask`/`error` (HITL-interrupt при превышении), счётчик остатка модели через механизм runtime notes, фиксы находок GRAPH_REVIEW.md, протяжка лимитов в UI студии.

**Architecture:** Библиотека `harnesys` владеет бюджетом (`AgentBudget` + `budgetOver` + interrupt через существующий HITL-механизм) и конвейером runtime notes (`llm-notes.ts` → хвостовое system-сообщение в `llm.ts`). Studio ставит бюджет в definition (`workspace-harnesys.registry`), валидирует при сохранении через `validateStructural`, хранит в `agents.budget_json`, отдаёт форму «Limits» и карточку BudgetCard.

**Tech Stack:** TypeScript, bun, drizzle-orm/sqlite, Hono, react-hook-form + zod, biome.

**Spec:** `docs/superpowers/specs/2026-09-06-agent-budget-design.md`

## Global Constraints

- Тесты запрещены (мораторий AGENTS.md). Верификация каждого таска: `bunx biome check .` из корня монорепо + typecheck (см. шаги). Поведенческая проверка — ручной сценарий хозяина в конце.
- Typecheck: библиотека — `bunx tsc -p packages/harnesys/tsconfig.json --noEmit`; студия — `bun run typecheck` в `apps/studio` (сервер + клиент).
- Файлы ~300 строк, резать по ответственности. Слайс FSD наружу только через `index.ts`.
- Библиотека — источник правды; студия адаптируется. Новые публичные типы библиотеки — только те, что в спеке.
- Коммиты по шаблону репо: `feat(harnesys): …`, `feat(studio): …`.
- Все правки `graph.ts` сохраняют существующий стиль: `commit()` + `yield` + `break`/`throw`, без рефакторинга вне задач плана.

---

### Task 1: Библиотека — типы бюджета и валидация

**Files:**
- Modify: `packages/harnesys/src/domain/agent-definition.ts`
- Modify: `packages/harnesys/src/domain/snapshot.ts`
- Modify: `packages/harnesys/src/application/validate.ts`

**Interfaces:**
- Consumes: —
- Produces: `BudgetPolicy = 'ask' | 'error'`; `AgentBudget = { maxSteps?: number; maxTokens?: number; deadlineMs?: number; policy?: BudgetPolicy }`; `AgentDefinition.budget?: AgentBudget`; `Cursor.interrupt.source?: string`; `Cursor.interrupt.output?: unknown`; `Cursor.budget.startedAt: number`; diagnostics `budget_policy`, `budget_value`.

- [ ] **Step 1: Типы в agent-definition.ts**

Заменить inline-тип `budget` (строки 72-76) на именованный:

```ts
export type BudgetPolicy = 'ask' | 'error';

export type AgentBudget = {
  maxSteps?: number;
  maxTokens?: number;
  deadlineMs?: number;
  policy?: BudgetPolicy;
};
```

В `AgentDefinition`: `budget?: AgentBudget;`.

- [ ] **Step 2: Cursor в snapshot.ts**

```ts
interrupt?: {
  interruptId: string;
  reason: string;
  resumeSchema: JsonSchema;
  nodeId: string;
  source?: string;
  output?: unknown;
};
budget?: { steps: number; tokens: number; startedAt: number };
```

- [ ] **Step 3: Валидация в validate.ts**

После блока `cycle_budget` (строки 414-420):

```ts
if (def.budget !== undefined) {
  const b = def.budget;
  if (b.policy !== undefined && b.policy !== 'ask' && b.policy !== 'error') {
    add('budget_policy', 'error', `budget.policy "${String(b.policy)}" must be "ask" or "error"`, 'budget.policy');
  }
  const positive: [string, number | undefined][] = [
    ['maxSteps', b.maxSteps],
    ['maxTokens', b.maxTokens],
    ['deadlineMs', b.deadlineMs],
  ];
  for (const [name, value] of positive) {
    if (value !== undefined && (!Number.isFinite(value) || value <= 0)) {
      add('budget_value', 'error', `budget.${name} must be a positive number`, `budget.${name}`);
    }
  }
}
```

- [ ] **Step 4: Верификация**

Run: `bunx biome check .` и `bunx tsc -p packages/harnesys/tsconfig.json --noEmit` — оба без ошибок.

- [ ] **Step 5: Commit**

```bash
git add packages/harnesys/src/domain/agent-definition.ts packages/harnesys/src/domain/snapshot.ts packages/harnesys/src/application/validate.ts
git commit -m "feat(harnesys): AgentBudget type with policy and cursor interrupt/budget extensions"
```

---

### Task 2: Библиотека — llm-notes.ts и сборка запроса

**Files:**
- Create: `packages/harnesys/src/application/llm-notes.ts`
- Modify: `packages/harnesys/src/application/llm.ts`
- Modify: `packages/harnesys/src/application/graph-helpers.ts`
- Modify: `packages/harnesys/src/application/tool-call.ts`

**Interfaces:**
- Consumes: —
- Produces: `BudgetLeft`, `LlmNote = { tag: string; text: string }`, `LlmNoteContext`, `LlmNoteProvider = (ctx: LlmNoteContext) => LlmNote[] | Promise<LlmNote[]>`, `assembleNotes(notes: LlmNote[]): string` (пустой массив → `''`), `budgetNote(left: BudgetLeft): LlmNote` (tag `budget`), `stateKeyOf(expr: string): string | undefined`, `LlmContext.notes?: LlmNote[]`.

- [ ] **Step 1: llm-notes.ts (новый файл)**

```ts
export type BudgetLeft = {
  stepsLeft?: number;
  stepsTotal?: number;
  tokensLeft?: number;
  tokensTotal?: number;
  msLeft?: number;
};

export type LlmNote = { tag: string; text: string };

export type LlmNoteContext = {
  agentId: string;
  runId: string;
  sessionId: string;
  nodeId: string;
  steps: number;
  state: Readonly<Record<string, unknown>>;
};

export type LlmNoteProvider = (ctx: LlmNoteContext) => LlmNote[] | Promise<LlmNote[]>;

export function assembleNotes(notes: LlmNote[]): string {
  if (notes.length === 0) {
    return '';
  }
  const blocks = notes.map((n) => `<${n.tag}>\n${n.text}\n</${n.tag}>`).join('\n');
  return `Runtime notes (refreshed before this step):\n${blocks}`;
}

export function budgetNote(left: BudgetLeft): LlmNote {
  const parts: string[] = [];
  if (left.stepsLeft !== undefined) {
    parts.push(`steps remaining: ${left.stepsLeft}${left.stepsTotal !== undefined ? `/${left.stepsTotal}` : ''}`);
  }
  if (left.tokensLeft !== undefined) {
    parts.push(`tokens remaining: ~${left.tokensLeft}`);
  }
  if (left.msLeft !== undefined) {
    parts.push(`time remaining: ~${Math.max(1, Math.ceil(left.msLeft / 60_000))} min`);
  }
  return {
    tag: 'budget',
    text: `${parts.join(' · ')}. Wrap up the task within the remaining budget.`,
  };
}
```

- [ ] **Step 2: stateKeyOf в graph-helpers.ts**

```ts
export function stateKeyOf(expr: string): string | undefined {
  const key = expr.trim().replace(/^\$state\./, '').split(/[.[]/)[0];
  return key || undefined;
}
```

- [ ] **Step 3: llm.ts — notes, таблица чанков, stateKeyOf**

В `LlmContext` добавить `notes?: LlmNote[]` (import из `./llm-notes.ts`).

`ensureMessages` (строки 38-54): парсинг ключа заменить на `const key = stateKeyOf(node.messages); if (!key) return;`.

Заменить цепочку for-await (строки 101-128) на таблицу:

```ts
const LLM_CHUNK_EVENTS: Record<string, string> = {
  delta: 'model.delta',
  'reasoning-delta': 'model.reasoning',
  'reasoning-start': 'model.reasoning-start',
  'reasoning-end': 'model.reasoning-end',
  'tool-input-start': 'model.tool-input-start',
  'tool-input-delta': 'model.tool-input-delta',
  'tool-input-end': 'model.tool-input-end',
  'tool-call': 'model.tool-call',
  source: 'model.source',
  file: 'model.file',
  chunk: 'model.chunk',
};
```

```ts
for await (const chunk of stream) {
  const type = LLM_CHUNK_EVENTS[chunk.type];
  if (type) {
    yield { type, data: chunk };
  } else if (chunk.type === 'completed') {
    lastChunk = chunk;
  }
}
```

Перед `callModel` (строка 91) собрать сообщения с notes:

```ts
const requestMessages = ctx.notes?.length
  ? [...messages, { role: 'system', content: assembleNotes(ctx.notes) }]
  : messages;
```

и передать `requestMessages` в `callModel` вместо `messages`. Сообщение живёт только в payload: `state` не меняется.

- [ ] **Step 4: tool-call.ts — stateKeyOf**

`getStateMessages` (строки 78-89): `const key = path ? stateKeyOf(path) : 'messages'` (import из `./graph-helpers.ts`), дальше без изменений.

- [ ] **Step 5: Верификация**

Run: `bunx biome check .` и `bunx tsc -p packages/harnesys/tsconfig.json --noEmit`.

- [ ] **Step 6: Commit**

```bash
git add packages/harnesys/src/application/llm-notes.ts packages/harnesys/src/application/llm.ts packages/harnesys/src/application/graph-helpers.ts packages/harnesys/src/application/tool-call.ts
git commit -m "feat(harnesys): runtime notes pipeline with trailing system message and shared stateKeyOf"
```

---

### Task 3: Библиотека — движок: бюджет, interrupt, окно, чистка graph.ts

**Files:**
- Modify: `packages/harnesys/src/application/graph.ts`
- Modify: `packages/harnesys/src/application/graph-edges.ts`
- Modify: `packages/harnesys/src/application/graph-snap.ts`

**Interfaces:**
- Consumes: `AgentBudget`, `LlmNote`, `LlmNoteProvider`, `assembleNotes`, `budgetNote`, `BudgetLeft`, `stateKeyOf` (Task 1-2).
- Produces: `GraphOpts.notes?: LlmNoteProvider[]`; `GraphOpts.outputHint?: unknown`; `isSkippedEntry(nodeType: string, rejected: boolean | undefined, interruptSource?: string): boolean`; `SnapCtx.startedAt: number`; `cursor.interrupt.output` заполняется во всех трёх interrupt-точках; статус `budget_exceeded` несёт metadata `{ code: 'budget_exceeded', kind, limit, used }`; throw с `code: 'node_unsupported'`.

- [ ] **Step 1: graph-edges.ts — третий параметр**

```ts
export function isSkippedEntry(
  nodeType: string,
  rejected: boolean | undefined,
  interruptSource?: string,
): boolean {
  if (nodeType === 'control:interrupt' || interruptSource === 'budget') {
    return true;
  }
  return nodeType === 'tool:call' && rejected === true;
}
```

- [ ] **Step 2: graph-snap.ts — startedAt**

`SnapCtx` += `startedAt: number`. В `mkSnap`: `budget: { steps: ctx.steps, tokens: ctx.tokens, startedAt: ctx.startedAt }`.

- [ ] **Step 3: graph.ts — GraphOpts**

`outputHint?: ReActOutput | null` → `outputHint?: unknown`; добавить `notes?: LlmNoteProvider[]` (импорты из `./llm-notes.ts`); убрать `ReActOutput` из импортов graph-helpers.

- [ ] **Step 4: graph.ts — восстановление счётчиков**

Строки 199-201 заменить:

```ts
let steps = loaded?.cursor?.budget?.steps ?? 0;
let tokens = loaded?.cursor?.budget?.tokens ?? 0;
let t0 = loaded?.cursor?.budget?.startedAt ?? Date.now();
```

`const agentJson` и далее без изменений; в `ctx()` добавить `startedAt: t0`.

- [ ] **Step 5: graph.ts — interruptSource и resume бюджета**

После строки 197 (`entryPending`-блок) вычислить `const interruptSource = loaded?.cursor?.interrupt?.source;`.

Внутри `if (entryPending && cur === opts.startNodeId)` (строка 250), до `isSkippedEntry`:

```ts
if (interruptSource === 'budget' && opts.rejected === true) {
  const e = await commit('cancelled', 'run.cancelled', 'recorded', { reason: 'budget_exceeded' });
  yield e;
  break;
}
if (interruptSource === 'budget') {
  steps = 0;
  tokens = 0;
  t0 = Date.now();
}
```

Вызов `isSkippedEntry(node.type, opts.rejected)` дополнить третьим аргументом `interruptSource`.

Обе внутренние копии budget-чеков (строки 272-284 в skip-ветке и 771-783 в `control:goto`) заменить на `const over = budgetOver(); if (over) { yield await budgetStop(over); break; }`.

- [ ] **Step 6: graph.ts — budgetOver и budgetStop**

Локальные замыкания внутри `startGraph` (после `commit`):

```ts
type BudgetOver = { kind: 'steps' | 'tokens' | 'deadline'; limit: number; used: number };

function budgetOver(): BudgetOver | null {
  const b = opts.agent.budget;
  if (!b) return null;
  if (b.maxSteps !== undefined && steps >= b.maxSteps) {
    return { kind: 'steps', limit: b.maxSteps, used: steps };
  }
  if (b.maxTokens !== undefined && tokens >= b.maxTokens) {
    return { kind: 'tokens', limit: b.maxTokens, used: tokens };
  }
  if (b.deadlineMs !== undefined && Date.now() - t0 > b.deadlineMs) {
    return { kind: 'deadline', limit: b.deadlineMs, used: Date.now() - t0 };
  }
  return null;
}

function budgetReason(over: BudgetOver): string {
  if (over.kind === 'steps') return `Step budget of ${over.limit} reached`;
  if (over.kind === 'tokens') return `Token budget of ${over.limit} reached`;
  return `Deadline of ${over.limit}ms exceeded`;
}

async function budgetStop(over: BudgetOver): Promise<Event> {
  if ((opts.agent.budget?.policy ?? 'error') === 'ask') {
    const interruptId = `budget/${runId}/${cur}/${steps}`;
    delete (st as Record<string, unknown>).$resume;
    const resumeSchema = {
      type: 'object',
      properties: { approved: { type: 'boolean' }, reason: { type: 'string' } },
    } as JsonSchema;
    const snap = mkSnap(ctx(), 'needs_input');
    (snap.cursor as Record<string, unknown>).interrupt = {
      interruptId,
      reason: budgetReason(over),
      resumeSchema,
      nodeId: cur,
      source: 'budget',
      output,
    };
    seq += 1;
    const ev: Event = { ...mkEv(ctx(), 'interrupt.triggered'), agentId: opts.agent.id };
    ev.metadata = { interruptId, reason: budgetReason(over), resumeSchema, source: 'budget' };
    await opts.state.commit(snap, [ev], { kind: 'recorded', sequence: seq });
    return ev;
  }
  return commit('budget_exceeded', 'run.failed', 'recorded', {
    code: 'budget_exceeded',
    kind: over.kind,
    limit: over.limit,
    used: over.used,
  });
}
```

Хвост цикла (строки 814-828) заменить на:

```ts
nodeSteps.set(cur, (nodeSteps.get(cur) ?? 0) + 1);
steps += 1;
const over = budgetOver();
if (over) {
  const e = await budgetStop(over);
  yield e;
  break;
}
```

- [ ] **Step 7: graph.ts — output во всех interrupt-точках**

Catch `AskUserInterrupt` (строки 658-688): в `snap.cursor.interrupt` добавить `source: e.source ?? 'ask_user'` и `output`.

Нода `control:interrupt` (строки 785-809): в `snap.cursor.interrupt` добавить `source: 'interrupt'` и `output`.

- [ ] **Step 8: graph.ts — ноды без интерпретатора**

Ветку `else` (строки 810-813) заменить:

```ts
} else {
  const e = await commit('failed', 'run.failed', 'recorded', {
    code: 'node_unsupported',
    nodeType: node.type,
  });
  yield e;
  throw Object.assign(new Error(`unsupported node type: ${node.type}`), {
    code: 'node_unsupported',
  });
}
```

- [ ] **Step 9: graph.ts — токены и notes в llm-ветке**

Учёт токенов (строки 573-581):

```ts
if (res.usage && typeof res.usage === 'object') {
  const u = res.usage as Record<string, unknown>;
  const total =
    typeof u.totalTokens === 'number' && Number.isFinite(u.totalTokens)
      ? u.totalTokens
      : (typeof u.inputTokens === 'number' ? u.inputTokens : 0) +
        (typeof u.outputTokens === 'number' ? u.outputTokens : 0);
  tokens += total;
}
```

Перед `runLlmGenerate` собрать notes:

```ts
const notes: LlmNote[] = [];
const left = budgetLeftForPrompt();
if (left) {
  notes.push(budgetNote(left));
}
if (opts.notes?.length) {
  const noteCtx: LlmNoteContext = {
    agentId: opts.agent.id,
    runId,
    sessionId: opts.state.sessionId,
    nodeId: cur,
    steps,
    state: st,
  };
  for (const provider of opts.notes) {
    try {
      notes.push(...(await provider(noteCtx)));
    } catch {}
  }
}
```

и передать `notes` в контексте `runLlmGenerate`. Локальный хелпер:

```ts
function budgetLeftForPrompt(): BudgetLeft | undefined {
  const b = opts.agent.budget;
  if (!b) return undefined;
  const out: BudgetLeft = {};
  let any = false;
  if (b.maxSteps !== undefined) {
    out.stepsLeft = Math.max(0, b.maxSteps - steps);
    out.stepsTotal = b.maxSteps;
    any = true;
  }
  if (b.maxTokens !== undefined) {
    out.tokensLeft = Math.max(0, b.maxTokens - tokens);
    out.tokensTotal = b.maxTokens;
    any = true;
  }
  if (b.deadlineMs !== undefined) {
    out.msLeft = Math.max(0, b.deadlineMs - (Date.now() - t0));
    any = true;
  }
  return any ? out : undefined;
}
```

- [ ] **Step 10: graph.ts — таблица форвардинга и fallback**

Множество на уровне модуля:

```ts
const PASSTHROUGH_MODEL_EVENTS = new Set([
  'model.delta',
  'model.reasoning',
  'model.reasoning-start',
  'model.reasoning-end',
  'model.tool-input-start',
  'model.tool-input-delta',
  'model.tool-input-end',
  'model.tool-call',
  'model.source',
  'model.file',
]);
```

Ветви 461-520 заменить:

```ts
if (PASSTHROUGH_MODEL_EVENTS.has(event.type)) {
  yield {
    ...mkEv(ctx(), event.type),
    metadata: event.data as Record<string, unknown>,
    agentId: opts.agent.id,
  };
} else if (event.type === 'model.chunk') {
  // без изменений
} else if (event.type === 'model.completed') {
  // без изменений
}
```

`resolveFallbackBindings` (строки 129-148) — единый async-путь:

```ts
async function resolveFallbackBindings(
  agent: AgentDefinition,
  models: ProviderConfig[] | ModelsPort,
): Promise<ModelBinding[]> {
  const fallbacks = agent.fallback;
  if (!fallbacks || fallbacks.length === 0) {
    return [];
  }
  const bindings: ModelBinding[] = [];
  for (const ref of fallbacks) {
    if (isPort(models)) {
      const coords = resolveModelForPort(ref, agent);
      if (!coords) continue;
      try {
        bindings.push(await (models as ModelsPort).get(coords.provider, coords.model));
      } catch {}
    } else {
      const result = findBind(models as ProviderConfig[], ref, agent);
      if (result?.binding) {
        bindings.push(result.binding);
      }
    }
  }
  return bindings;
}
```

В llm-ветке port-путь оставляет только резолв `binding` (строки 391-402), inline-цикл fallback (403-416) и вызов из array-пути (420) заменяются на `fallbackBindings = await resolveFallbackBindings(opts.agent, opts.models);`.

Парсинг ключа сообщений (строки 549-553) заменить на `stateKeyOf(lastMsg)`.

- [ ] **Step 11: Верификация**

Run: `bunx biome check .` и `bunx tsc -p packages/harnesys/tsconfig.json --noEmit`.

- [ ] **Step 12: Commit**

```bash
git add packages/harnesys/src/application/graph.ts packages/harnesys/src/application/graph-edges.ts packages/harnesys/src/application/graph-snap.ts
git commit -m "feat(harnesys): budget policies with HITL interrupt, persisted window, loud unsupported nodes"
```

---

### Task 4: Библиотека — diagnostics-гейт и проводка notes

**Files:**
- Modify: `packages/harnesys/src/application/compile.ts`
- Modify: `packages/harnesys/src/application/run-engine.ts`
- Modify: `packages/harnesys/src/application/create-runtime.ts`
- Modify: `packages/harnesys/src/application/session.ts`
- Modify: `packages/harnesys/src/application/run-engine-types.ts`
- Modify: `packages/harnesys/src/ports/run-targets.ts`
- Modify: `packages/harnesys/src/application/run-engine-events.ts`
- Modify: `packages/harnesys/src/ports/session.ts`
- Modify: `packages/harnesys/src/application/graph-run.ts`

**Interfaces:**
- Consumes: `LlmNoteProvider`, `assembleNotes` уже не нужен здесь; `compile` (Task 1-3).
- Produces: `compileOrThrow(def: AgentDefinition): Plan` (throw `codedRunError('agent_invalid', …)`); `RunTargetOpts.notes?: LlmNoteProvider[]`; `RunTarget.notes?: LlmNoteProvider[]`; `CreateRuntimeOptions.notes?: LlmNoteProvider[]`; `RuntimeContext.notes?`; SessionEvent ask source union += `'budget'`.

Отклонение от спеки (осознанное): правка `map-coded-error.ts` студии не нужна — `agent_invalid` бросается в `execute()` до `runSegment` и оседает в журнале как отказ рана, до HTTP-маппинга не доходит.

- [ ] **Step 1: compile.ts — compileOrThrow**

```ts
import { codedRunError } from '../domain/errors.ts';

export function compileOrThrow(def: AgentDefinition): Plan {
  const { plan, diagnostics } = compile(def);
  const errors = diagnostics.filter((d) => d.severity === 'error');
  if (errors.length > 0) {
    throw codedRunError('agent_invalid', errors.map((d) => `${d.code}: ${d.message}`).join('; '));
  }
  return plan;
}
```

- [ ] **Step 2: run-engine.ts**

`const { plan } = compile(opts.agent);` (строка 117) → `const plan = compileOrThrow(opts.agent);` (import заменить). `outputHint` (строка 136): `outputHint: startNodeId === undefined ? undefined : (snap?.cursor.interrupt?.output ?? null)`; import `restoreReActOutput` удалить.

В `graph-helpers.ts` удалить `restoreReActOutput`, типы `ReActOutput`, `ReActToolCall`, `SnapshotToolCall` и хелпер `asSnapshotToolCall` — после Task 3-4 их потребителей нет (graph.ts и run-engine отвязаны). В `graphOpts` добавить `notes: opts.notes`.

- [ ] **Step 3: run-engine-types.ts и run-targets.ts**

`RunTargetOpts` и `RunTarget` дополняются `notes?: LlmNoteProvider[]` (import из `./llm-notes.ts` / `../application/llm-notes.ts`). Claimer передаёт target в `execute` как есть (`run-claimer.ts:76`) — изменений не требует.

- [ ] **Step 4: create-runtime.ts и session.ts**

`CreateRuntimeOptions` (ports/create-runtime.ts) += `notes?: LlmNoteProvider[]`; `RuntimeContext` += `notes?: LlmNoteProvider[]`; `runtimeCtx` получает `notes: options.notes`.

В `run`/`start` (строки 99-134): `compile(def)` → `compileOrThrow(def)`, в opts добавить `notes: options.notes`.

В `session.ts` default `targets.resolve` (строки 115-131) в RunTarget добавить `notes: ctx.notes`.

- [ ] **Step 5: graph-run.ts**

В `engine.execute(runId, { … })` (строка 62) добавить `notes: opts.notes`.

- [ ] **Step 6: source 'budget'**

`ports/session.ts:62` и `run-engine-events.ts:216`: union дополнить `'budget'`.

- [ ] **Step 7: Верификация**

Run: `bunx biome check .` и `bunx tsc -p packages/harnesys/tsconfig.json --noEmit`.

- [ ] **Step 8: Commit**

```bash
git add packages/harnesys/src/application/compile.ts packages/harnesys/src/application/run-engine.ts packages/harnesys/src/application/create-runtime.ts packages/harnesys/src/application/session.ts packages/harnesys/src/application/run-engine-types.ts packages/harnesys/src/ports/run-targets.ts packages/harnesys/src/application/run-engine-events.ts packages/harnesys/src/ports/session.ts packages/harnesys/src/application/graph-run.ts packages/harnesys/src/ports/create-runtime.ts
git commit -m "feat(harnesys): compileOrThrow gate and notes wiring through runtime targets"
```

---

### Task 5: Studio — типы, БД, репозиторий

**Files:**
- Modify: `apps/studio/shared/types.ts`
- Modify: `apps/studio/server/domain/agent.port.ts`
- Modify: `apps/studio/server/adapters/store/sqlite/schema/agents.ts`
- Modify: `apps/studio/server/adapters/store/sqlite/bootstrap.ts`
- Modify: `apps/studio/server/adapters/store/sqlite/repos/sqlite-agent.repo.ts`

**Interfaces:**
- Consumes: —
- Produces: `AgentBudget` в `@studio/shared`; `AgentRecord.budget?: AgentBudget | null`; `Agent.budget: AgentBudget | null`; `AgentPatch.budget?`; колонка `budget_json`.

- [ ] **Step 1: shared/types.ts**

Рядом с `AgentGenerationSettings`:

```ts
export type BudgetPolicy = 'ask' | 'error';

export type AgentBudget = {
  maxSteps?: number;
  maxTokens?: number;
  deadlineMs?: number;
  policy?: BudgetPolicy;
};
```

В `AgentRecord`: `budget?: AgentBudget | null;`.

- [ ] **Step 2: agent.port.ts**

Импорт `AgentBudget` из `../../shared/types.ts`; в `Agent`: `budget: AgentBudget | null;`; в `AgentPatch`: `budget?: AgentBudget | null;`.

- [ ] **Step 3: схема и миграция**

`schema/agents.ts`: `budgetJson: text('budget_json'),` после `graphJson`. В `bootstrap.ts` после блока `graph_json` (строка 267):

```ts
try {
  db.run(sql.raw('ALTER TABLE agents ADD COLUMN budget_json text;'));
} catch {}
```

Backfill не делается (решение спеки).

- [ ] **Step 4: sqlite-agent.repo.ts**

`insert` и `update`: деструктурировать `budget`, писать `budgetJson: serializeJsonColumn(budget)` (insert — безусловно, update — под `budget !== undefined`). В `toAgent`: `budget: parseJsonObject(row.budgetJson),` после `graph`.

- [ ] **Step 5: Верификация**

Run: `bunx biome check .` и `cd apps/studio && bun run typecheck`.

- [ ] **Step 6: Commit**

```bash
git add apps/studio/shared/types.ts apps/studio/server/domain/agent.port.ts apps/studio/server/adapters/store/sqlite/schema/agents.ts apps/studio/server/adapters/store/sqlite/bootstrap.ts apps/studio/server/adapters/store/sqlite/repos/sqlite-agent.repo.ts
git commit -m "feat(studio): persist agent budget in budget_json column"
```

---

### Task 6: Studio — use-cases с save-валидацией, HTTP, registry

**Files:**
- Create: `apps/studio/server/application/agents/agent-definition-guard.ts`
- Modify: `apps/studio/server/application/agents/update-agent.use-case.ts`
- Modify: `apps/studio/server/application/agents/create-agent.use-case.ts`
- Modify: `apps/studio/server/adapters/http/agent/agent.body.ts`
- Modify: `apps/studio/server/adapters/http/agent/agent.controller.ts`
- Modify: `apps/studio/server/adapters/workspace-harnesys.registry.ts`

**Interfaces:**
- Consumes: `validateStructural` из `harnesys`; `AgentBudget` (Task 5); `LlmNoteProvider` (Task 4).
- Produces: `assertAgentGraphValid(input: { id: string; graph: AgentGraph; budget: AgentBudget | null }): void` (throw studio `ValidationError`); `CreateAgentRequest.budget?` / `UpdateAgentRequest.budget?`; registry-конструктор с 4-м параметром `notes: LlmNoteProvider[] = []`.

- [ ] **Step 1: agent-definition-guard.ts (новый файл)**

```ts
import { validateStructural } from 'harnesys';
import type { AgentBudget } from '../../../shared/types.ts';
import { ValidationError } from '../../domain/studio.error.ts';
import type { AgentGraph } from '../../domain/agent.port.ts';

export type AgentGraphInput = {
  id: string;
  graph: AgentGraph;
  budget: AgentBudget | null;
};

/** Save-time gate: shape-agnostic, presets and hand-built graphs go through one validator. */
export function assertAgentGraphValid(input: AgentGraphInput): void {
  const diagnostics = validateStructural({
    id: input.id,
    prompts: { main: { instructions: '' } },
    graph: input.graph,
    budget: input.budget ?? undefined,
  });
  const errors = diagnostics.filter((d) => d.severity === 'error');
  if (errors.length > 0) {
    throw new ValidationError(errors.map((d) => `${d.code}: ${d.message}`).join('; '));
  }
}
```

- [ ] **Step 2: update-agent.use-case.ts**

`UpdateAgentRequest` += `budget?: AgentBudget | null` (импорт типа). После блока `request.tools` (строка 106):

```ts
if (request.budget !== undefined) {
  patch.budget = request.budget;
}
```

Перед `return` (строка 114) — гейт на эффективных значениях:

```ts
assertAgentGraphValid({
  id: agent.id,
  graph: patch.graph ?? agent.graph,
  budget: patch.budget !== undefined ? patch.budget : agent.budget,
});
```

- [ ] **Step 3: create-agent.use-case.ts**

`CreateAgentRequest` += `budget?: AgentBudget | null`. В execute рядом с `const toolOutput = request.toolOutput ?? null;` добавить `const budget = request.budget ?? null;`. Рядом со сборкой графа `buildReactGraph(...)` (переменная уходит в insert-запись) перед `this.agents.insert(...)`:

```ts
assertAgentGraphValid({ id, graph, budget });
```

где `id`/`graph` — уже вычисленные значения insert-записи. В сам insert добавить поле `budget`.

- [ ] **Step 4: HTTP**

`agent.body.ts`:

```ts
const budgetBody = z
  .object({
    maxSteps: z.number().int().positive().optional(),
    maxTokens: z.number().int().positive().optional(),
    deadlineMs: z.number().int().positive().optional(),
    policy: z.enum(['ask', 'error']).optional(),
  })
  .nullable()
  .optional();
```

Добавить `budget: budgetBody` в `createAgentBody` и `updateAgentBody`. В `agent.controller.ts` пробросить `budget: body.budget ?? undefined` (create) и `budget: body.budget === undefined ? undefined : body.budget` (update) — по образцу `toolOutput`.

- [ ] **Step 5: registry**

`WorkspaceHarnesysRegistry`: четвёртый параметр конструктора `private readonly notes: LlmNoteProvider[] = []` (import `LlmNoteProvider` из `harnesys`); в `create()` в `createRuntime({ … })` добавить `notes: this.notes`. В `resolveAgent` добавить `budget: agent.budget ?? undefined,`.

- [ ] **Step 6: Верификация**

Run: `bunx biome check .` и `cd apps/studio && bun run typecheck`.

- [ ] **Step 7: Commit**

```bash
git add apps/studio/server/application/agents/ apps/studio/server/adapters/http/agent/ apps/studio/server/adapters/workspace-harnesys.registry.ts
git commit -m "feat(studio): save-time graph validation, budget patch and registry passthrough"
```

---

### Task 7: Studio — провайдер notes плана и съём префикса

**Files:**
- Create: `apps/studio/server/application/threads/plan-notes.ts`
- Modify: `apps/studio/server/application/threads/send-thread-run.use-case.ts`
- Modify: `apps/studio/server/composition/studio.ts`

**Interfaces:**
- Consumes: `LlmNoteProvider` (Task 4); `planFollowPrompt` (существующий); `GetThreadPlanInput` (существующий).
- Produces: `createPlanNotesProvider(deps: { getThreadPlan: GetThreadPlanInput }): LlmNoteProvider`.

- [ ] **Step 1: plan-notes.ts (новый файл)**

```ts
import type { LlmNoteProvider } from 'harnesys';
import type { GetThreadPlanInput } from '../plans/get-thread-plan.use-case.ts';
import { planFollowPrompt } from './plan-mode-prompt.ts';

export function createPlanNotesProvider(deps: {
  getThreadPlan: GetThreadPlanInput;
}): LlmNoteProvider {
  return async (ctx) => {
    if (!deps.getThreadPlan) {
      return [];
    }
    let plan: Awaited<ReturnType<GetThreadPlanInput['execute']>> = null;
    try {
      plan = await deps.getThreadPlan.execute({ threadId: ctx.sessionId });
    } catch {
      return [];
    }
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
  };
}
```

- [ ] **Step 2: send-thread-run.use-case.ts**

`decorateText` (строки 129-161) упростить до plan-mode:

```ts
/** Injects the plan-mode contract into the outgoing text. Active-plan status rides runtime notes. */
private decorateText(runMode: RunMode, text: string | undefined): string | undefined {
  if (runMode === 'plan') {
    return text ? `${PLAN_MODE_PROMPT}\n\n${text}` : PLAN_MODE_PROMPT;
  }
  return text;
}
```

Обновить вызов (threadId больше не нужен аргументом). Из класса удалить `getThreadPlan` из deps и поле; убрать импорт `planFollowPrompt` и `GetThreadPlanInput` (остаётся `PLAN_MODE_PROMPT`). Вызовы `this.getThreadPlan.execute` в классе больше не делаются.

- [ ] **Step 3: composition/studio.ts**

Перенести блок `planUow`/`getThreadPlan` (строки 165-166) выше создания `workspaceHarnesys` (строка 140). В конструктор реестра добавить четвёртый аргумент:

```ts
notes: [createPlanNotesProvider({ getThreadPlan })],
```

(import из `../application/threads/plan-notes.ts`). Из deps `SendThreadRunUseCase` убрать `getThreadPlan`. В `wireControllers` передача `getThreadPlan` остаётся (HTTP-панели планов её используют).

- [ ] **Step 4: Верификация**

Run: `bunx biome check .` и `cd apps/studio && bun run typecheck`.

- [ ] **Step 5: Commit**

```bash
git add apps/studio/server/application/threads/plan-notes.ts apps/studio/server/application/threads/send-thread-run.use-case.ts apps/studio/server/composition/studio.ts
git commit -m "feat(studio): active-plan status via runtime notes provider"
```

---

### Task 8: Studio-клиент — форма «Limits»

**Files:**
- Modify: `apps/studio/client/src/entities/agent/model/agent.ts`
- Modify: `apps/studio/client/src/entities/agent/model/agent-record.ts`
- Create: `apps/studio/client/src/features/manage-agent/ui/agent-budget-fields.tsx`
- Modify: `apps/studio/client/src/features/manage-agent/model/agent-fields.ts`
- Modify: `apps/studio/client/src/features/manage-agent/ui/agent-config-panes.tsx`
- Modify: `apps/studio/client/src/features/manage-agent/ui/agent-config-dialog.tsx`
- Modify: `apps/studio/client/src/features/manage-agent/model/update-agent.ts`
- Modify: `apps/studio/client/src/features/manage-agent/model/create-agent.ts`
- Modify: `apps/studio/client/src/shared/api/agents.ts`

**Interfaces:**
- Consumes: `AgentBudget` из `@studio/shared` (Task 5).
- Produces: `Agent.budget: AgentBudget | null`; `AgentDraft.budget?: AgentBudget | null`; поля формы `budgetMaxSteps` / `budgetMaxTokens` / `budgetDeadlineSec` / `budgetPolicy`; `AgentLimitsPane`; категория `limits` в диалоге.

- [ ] **Step 1: entities/agent**

`agent.ts`: в `Agent` — `budget: AgentBudget | null;` (после `toolOutput`), в `AgentDraft` — `budget?: AgentBudget | null;`, в `AgentPatch`-union — `'budget'` (import типа из `@studio/shared`). `agent-record.ts`: `budget: record.budget ?? null,` после `toolOutput`.

- [ ] **Step 2: agent-fields.ts**

Схема (после `toolOutputTailChars`):

```ts
budgetMaxSteps: optionalPositiveInt,
budgetMaxTokens: optionalPositiveInt,
budgetDeadlineSec: optionalPositiveInt,
budgetPolicy: z.enum(['ask', 'error']),
```

`emptyAgentFields`: `budgetMaxSteps: ''`, `budgetMaxTokens: ''`, `budgetDeadlineSec: ''`, `budgetPolicy: 'ask'`. Параметр `agentFieldsFrom` расширяется полем `budget?: AgentBudget | null` (диалог передаёт клиента `Agent` целиком — после Step 1 поле там есть):

```ts
budgetMaxSteps: stringify(agent.budget?.maxSteps),
budgetMaxTokens: stringify(agent.budget?.maxTokens),
budgetDeadlineSec: agent.budget?.deadlineMs !== undefined
  ? stringify(agent.budget.deadlineMs / 1000)
  : '',
budgetPolicy: agent.budget?.policy ?? 'ask',
```

`toAgentDraft` — возвращаемый тип дополняется `budget: AgentBudget | null`:

```ts
const limits = {
  maxSteps: values.budgetMaxSteps,
  maxTokens: values.budgetMaxTokens,
  deadlineMs: values.budgetDeadlineSec !== undefined
    ? values.budgetDeadlineSec * 1000
    : undefined,
};
const hasLimit = limits.maxSteps !== undefined || limits.maxTokens !== undefined || limits.deadlineMs !== undefined;
const budget = hasLimit
  ? {
      ...(limits.maxSteps !== undefined ? { maxSteps: limits.maxSteps } : {}),
      ...(limits.maxTokens !== undefined ? { maxTokens: limits.maxTokens } : {}),
      ...(limits.deadlineMs !== undefined ? { deadlineMs: limits.deadlineMs } : {}),
      policy: values.budgetPolicy,
    }
  : null;
```

`agentFieldsFrom`/`toAgentDraft` в places вызова (`agent-config-dialog.tsx` — `agentFieldsFrom(agent)` уже получает agent целиком; проверить сигнатуру: параметр расширяется полем `budget`).

- [ ] **Step 3: agent-budget-fields.tsx (новый файл)**

По образцу `agent-tool-output-fields.tsx`: `FieldSet` + `FieldLegend` «Limits», hint-строка «Hard stop for looping graphs. On limit the run pauses for confirmation (ask) or fails (error).», сетка `grid-cols-3` с полями `budgetMaxSteps` («Max steps»), `budgetMaxTokens` («Max tokens»), `budgetDeadlineSec` («Deadline, sec») — точная копия маппинга полей из тул-аутпут полей, включая `onCommit`/Enter-blur.

Ниже policy (паттерн `semantic-fields.tsx:25-35`, base-ui ToggleGroup):

```tsx
<Controller
  control={control}
  name="budgetPolicy"
  render={({ field }) => (
    <Field>
      <FieldLabel>On limit</FieldLabel>
      <ToggleGroup
        variant="outline"
        spacing={0}
        value={[field.value]}
        onValueChange={(value) => {
          const next = value[0];
          if (next === 'ask' || next === 'error') {
            field.onChange(next);
          }
        }}
      >
        <ToggleGroupItem value="ask">Ask</ToggleGroupItem>
        <ToggleGroupItem value="error">Error</ToggleGroupItem>
      </ToggleGroup>
    </Field>
  )}
/>
```

- [ ] **Step 4: панель и диалог**

`agent-config-panes.tsx`:

```tsx
export function AgentLimitsPane({ form }: { form: AgentFieldsForm }) {
  return (
    <FieldGroup className="gap-3">
      <AgentBudgetFields control={form.control} idPrefix="agent" />
    </FieldGroup>
  );
}
```

`agent-config-dialog.tsx`: в `AgentConfigCategory` добавить `'limits'`; в `AGENT_CONFIG_CATEGORIES` — `{ id: 'limits', label: 'Limits', icon: GaugeIcon }` (lucide `GaugeIcon`); рендер панели по образцу соседних `<div className={cn(category !== 'limits' && 'hidden')}>`.

- [ ] **Step 5: мутации и API**

`update-agent.ts`: в `updateAgent` — `const budget = draft.budget !== undefined ? draft.budget : current.budget;`, в `updateAgentRecord` — `budget,`. `create-agent.ts`: `budget: draft.budget ?? null,` в `createAgentRecord`. `api/agents.ts`: в `CreateAgentInput`/`UpdateAgentInput` — `budget?: AgentBudget | null;` (import из `@studio/shared`).

- [ ] **Step 6: Верификация**

Run: `bunx biome check .` и `cd apps/studio && bun run typecheck`.

- [ ] **Step 7: Commit**

```bash
git add apps/studio/client/src/entities/agent/ apps/studio/client/src/features/manage-agent/ apps/studio/client/src/shared/api/agents.ts
git commit -m "feat(studio): agent limits pane with budget fields and policy toggle"
```

---

### Task 9: Studio-клиент — BudgetCard

**Files:**
- Modify: `apps/studio/client/src/features/send-message/ui/hitl-prompt.tsx`

**Interfaces:**
- Consumes: `respondToAsk`, `rejectAsk` из `../model/hitl-actions` (существующие); `pending.source === 'budget'` (Task 4 — union в library).
- Produces: карточка бюджета в HITL-стеке.

- [ ] **Step 1: BudgetCard**

В `HitlPrompt` до `isConfirm`:

```tsx
if (pending.source === 'budget') {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-2" data-testid="hitl-prompt">
      <BudgetCard pending={pending} threadId={thread?.id ?? ''} />
    </div>
  );
}
```

Компонент в том же файле, по образцу `ConfirmCard` (busy-state, `HitlShell`, `InputGroupAddon` с кнопками):

```tsx
function BudgetCard({ pending, threadId }: { pending: PendingHitl; threadId: string }) {
  const [busy, setBusy] = useState(false);
  const decide = async (continueRun: boolean) => {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      if (continueRun) {
        await respondToAsk(threadId, pending.askId, { approved: true });
      } else {
        await rejectAsk(threadId, pending.askId);
      }
    } catch (error) {
      toast.add({
        title: continueRun ? 'Could not continue' : 'Could not stop',
        description: error instanceof Error ? error.message : 'Budget confirm failed',
      });
    } finally {
      setBusy(false);
    }
  };
  return (
    <HitlShell>
      <div className="flex flex-col gap-1 px-3 pt-2.5">
        <p className="font-medium text-sm">Budget limit reached</p>
        {pending.prompt ? (
          <Markdown text={pending.prompt} className="px-0 text-[11px] text-muted-foreground" />
        ) : null}
      </div>
      <InputGroupAddon align="block-end" className="justify-end gap-1 px-2 pb-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={busy}
          className="h-7 text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={() => void decide(false)}
        >
          Stop
        </Button>
        <Button type="button" size="sm" disabled={busy} className="h-7" onClick={() => void decide(true)}>
          Continue
        </Button>
      </InputGroupAddon>
    </HitlShell>
  );
}
```

Импортировать `rejectAsk` из `../model/hitl-actions` (рядом с `respondToAsk`).

- [ ] **Step 2: Верификация**

Run: `bunx biome check .` и `cd apps/studio && bun run typecheck`.

- [ ] **Step 3: Commit**

```bash
git add apps/studio/client/src/features/send-message/ui/hitl-prompt.tsx
git commit -m "feat(studio): budget confirmation card for HITL stack"
```

---

### Task 10: Финальная верификация

**Files:** — (проверка)

- [ ] **Step 1: Полный линт и typecheck**

Run из корня: `bunx biome check .`; затем `bunx tsc -p packages/harnesys/tsconfig.json --noEmit` и `cd apps/studio && bun run typecheck`. Все три — чисто.

- [ ] **Step 2: Ручной сценарий хозяина (живой стенд, порты уже слушаются)**

1. У агента в панели Limits задать Max steps = 3, policy = Ask, сохранить (циклический граф без лимита при сохранении даёт `cycle_budget` через ValidationError).
2. Отправить сообщение, замешанное на тулах: на 3-м шаге — карточка «Budget limit reached / Step budget of 3 reached».
3. Continue — ран идёт дальше, окно новое; Stop — ран `cancelled`, в журнале `run.cancelled` c `reason: budget_exceeded`.
4. policy = Error — ран падает, код ошибки `budget_exceeded` (не `run_failed`).
5. В логах модели видно хвостовое system-сообщение с `<budget> steps remaining: …`; при активном плане — `<active-plan>` со свежими статусами, user-сообщение в истории без XML.
6. Существующий агент Jarvis (без бюджета) — ран падает с `agent_invalid`; после задания лимитов в панели — запускается.

- [ ] **Step 3: Отчёт**

Свести результаты в чат: что проверено, какие расхождения со спекой обнаружены.
