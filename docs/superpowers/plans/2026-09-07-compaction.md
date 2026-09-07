# Compaction (threshold-summary) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Компакция окна `st.messages` перед генерацией: саммари — штатное стримящееся сообщение агента с меткой `kind: 'compaction'`, проекция поднимает его как system-ход, текст дополнительно пишется файлом в workspace.

**Architecture:** Всё вычисление — в библиотеке `packages/harnesys`: оценка токенов, план среза, проход саммари (вторая генерация в ветке `llm:generate` графа), проекция окна. Хост (`apps/studio`) зовёт `compactForced` из `CompactThreadUseCase` и индексирует episodic по событию `compaction.completed` (авто — через `SqliteRuntimeState.commit`, ручной — напрямую).

**Tech Stack:** Bun, TypeScript, AI SDK (`callModel`), SQLite (drizzle), Hono.

**Spec:** `COMPACTION.md` (корень монорепо) — план аргументирует от него; исполнители читают оба документа.

## Global Constraints

- Тесты запрещены (мораторий в `AGENTS.md`): не создавать `*.test.ts`, не ставить vitest/RTL/playwright. Верификация каждого таска — `bunx tsc` + `bunx biome check`.
- Бары: `cd packages/harnesys && bunx tsc --noEmit` без ошибок; `cd apps/studio && bun run typecheck` — единственная допустимая ошибка `git-file-decorations.ts(44,21)` (WIP хозяина); `bunx biome check .` без новых замечаний.
- Размер файла ~300 строк; новый модуль — по ответственности (`estimate`, `plan-cut`, `summarize`, `file-log`, `run`).
- Библиотека — источник правды; хост адаптируется. Публичный экспорт библиотеки — только из списка в `COMPACTION.md` (раздел «Граница библиотеки и хоста»).
- Слайс студии снаружи только через `index.ts`; типы ответов сервера — в `shared/`.
- Рабочее дерево содержит WIP хозяина (`git status`). Коммитить только файлы из «Files:» своего таска. Файл `apps/studio/shared/thread.ts` уже правлен хозяином — правка допустима, но в коммит его не брать (см. Task 9, шаг коммита).
- Стиль коммитов: `feat(harnesys): …` / `feat(studio): …` / `docs: …`.
- Стенд: bun :3000, vite :5173 — уже запущены хозяином; не перезапускать, не убивать. Живой smoke — только если порты отвечают.
- Инвариант компакции: `st.messages` только append-only; переписывать или сплайсить покрытый префикс запрещено.
- Свод правил сообщений: user `{role:'user',content,attachments?,origin?}`, assistant `{role:'assistant',content,reasoning?,toolCalls?,finishReason?,sources?,files?,usage?}`, tool `{role:'tool',toolCallId,name,content}`; якорь — `CompactionMessage` из Task 1.

---

### Task 1: Домен — типы компакции и парсер спеки

**Files:**
- Modify: `packages/harnesys/src/domain/compaction.ts` (полная замена)
- Modify: `packages/harnesys/domain.ts`

**Interfaces:**
- Produces: `THRESHOLD_SUMMARY_NAME` (уже есть), `CompactionSpec`, `ParsedCompactionSpec`, `parseThresholdSpec(spec?: Record<string, unknown>): ParsedCompactionSpec`, `CompactionMessage`, `isCompactionMessage(m: unknown): m is CompactionMessage`. Всё дальнейшее импортирует отсюда.

- [ ] **Step 1: Заменить содержимое `packages/harnesys/src/domain/compaction.ts`**

```ts
import type { AgentModelRef } from './agent-definition.ts';

export const THRESHOLD_SUMMARY_NAME = 'threshold-summary';

export type CompactionSpec = {
  thresholdRatio?: number;
  protectRecentRatio?: number;
  outputReserveTokens?: number;
  auto?: boolean;
  summaryModel?: AgentModelRef;
};

export type ParsedCompactionSpec = {
  thresholdRatio: number;
  protectRecentRatio: number;
  outputReserveTokens: number;
  auto: boolean;
  summaryModel?: AgentModelRef;
};

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, n));
}

function isModelRef(value: unknown): value is AgentModelRef {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as { provider?: unknown }).provider === 'string' &&
      typeof (value as { model?: unknown }).model === 'string',
  );
}

export function parseThresholdSpec(spec?: Record<string, unknown>): ParsedCompactionSpec {
  const raw = spec ?? {};
  const reserve =
    typeof raw.outputReserveTokens === 'number' && Number.isFinite(raw.outputReserveTokens)
      ? Math.max(0, Math.floor(raw.outputReserveTokens))
      : 0;
  return {
    thresholdRatio: clamp(raw.thresholdRatio, 0.1, 1, 0.8),
    protectRecentRatio: clamp(raw.protectRecentRatio, 0, 0.9, 0.1),
    outputReserveTokens: reserve,
    auto: raw.auto !== false,
    summaryModel: isModelRef(raw.summaryModel) ? raw.summaryModel : undefined,
  };
}

export type CompactionMessage = {
  role: 'assistant';
  kind: 'compaction';
  id: string;
  content: string;
  coveredFrom: number;
  coveredUntil: number;
  reason: 'threshold' | 'manual';
  stats: { tokensBefore: number; tokensAfter: number; coveredCount: number; usage?: unknown };
  model?: { provider: string; model: string };
  createdAt: string;
};

export function isCompactionMessage(value: unknown): value is CompactionMessage {
  return Boolean(
    value && typeof value === 'object' && (value as { kind?: unknown }).kind === 'compaction',
  );
}
```

- [ ] **Step 2: Добавить в `packages/harnesys/domain.ts` (после строки с `THRESHOLD_SUMMARY_NAME`)**

```ts
export type { CompactionMessage, CompactionSpec, ParsedCompactionSpec } from './src/domain/compaction.ts';
export { isCompactionMessage, parseThresholdSpec } from './src/domain/compaction.ts';
```

- [ ] **Step 3: Верификация**

Run: `cd packages/harnesys && bunx tsc --noEmit`
Expected: 0 ошибок.
Run: `bunx biome check packages/harnesys/src/domain/compaction.ts packages/harnesys/domain.ts`
Expected: чисто.

- [ ] **Step 4: Commit**

```bash
git add packages/harnesys/src/domain/compaction.ts packages/harnesys/domain.ts
git commit -m "feat(harnesys): compaction spec parser and message types"
```

---

### Task 2: Оценка токенов

**Files:**
- Create: `packages/harnesys/src/application/compaction/estimate.ts`

**Interfaces:**
- Produces: `estimateMessageTokens(message: unknown): number`, `estimateTokens(messages: readonly unknown[], toolsJson?: string): TokenEstimate`, `type TokenEstimate = { messages: number; tools: number; total: number }`. Потребители: Task 3 (protect-recent), Task 7 (threshold, tokensAfter).

- [ ] **Step 1: Создать файл (каталог `compaction/` создаётся этим же шагом)**

```ts
export type TokenEstimate = { messages: number; tools: number; total: number };

function textLen(value: unknown): number {
  return typeof value === 'string' ? value.length : 0;
}

function jsonLen(value: unknown): number {
  if (value === undefined || value === null) {
    return 0;
  }
  try {
    return JSON.stringify(value).length;
  } catch {
    return 0;
  }
}

/** chars/4 по текстовым полям хода; структура роли не играет. */
export function estimateMessageTokens(message: unknown): number {
  if (!message || typeof message !== 'object') {
    return 0;
  }
  const m = message as Record<string, unknown>;
  const chars =
    textLen(m.content) +
    textLen(m.reasoning) +
    jsonLen(m.toolCalls) +
    jsonLen(m.attachments) +
    jsonLen(m.sources) +
    jsonLen(m.files);
  return Math.ceil(chars / 4);
}

export function estimateTokens(messages: readonly unknown[], toolsJson?: string): TokenEstimate {
  const msgs = messages.reduce((sum, m) => sum + estimateMessageTokens(m), 0);
  const tools = toolsJson ? Math.ceil(toolsJson.length / 4) : 0;
  return { messages: msgs, tools, total: msgs + tools };
}
```

- [ ] **Step 2: Верификация**

Run: `cd packages/harnesys && bunx tsc --noEmit && bunx biome check src/application/compaction/estimate.ts`
Expected: 0 ошибок.

- [ ] **Step 3: Commit**

```bash
git add packages/harnesys/src/application/compaction/estimate.ts
git commit -m "feat(harnesys): token estimate for compaction"
```

---

### Task 3: План среза

**Files:**
- Create: `packages/harnesys/src/application/compaction/plan-cut.ts`

**Interfaces:**
- Consumes: `estimateMessageTokens` (Task 2).
- Produces: `isClosedBoundary(messages: readonly unknown[], index: number): boolean`, `planCut(messages: readonly unknown[], opts: { protectTokens: number; afterIndex: number }): CutPlan | null`, `type CutPlan = { coveredFrom: number; coveredUntil: number }`. Потребитель: Task 7.

- [ ] **Step 1: Создать файл**

```ts
import { estimateMessageTokens } from './estimate.ts';

export type CutPlan = { coveredFrom: number; coveredUntil: number };

/**
 * Граница i закрыта, если ход i не assistant с незакрытыми toolCalls:
 * каждый вызов должен иметь последующий role:'tool' ход до следующего assistant.
 */
export function isClosedBoundary(messages: readonly unknown[], index: number): boolean {
  const m = messages[index] as Record<string, unknown> | null | undefined;
  if (!m || typeof m !== 'object') {
    return false;
  }
  if (m.role !== 'assistant') {
    return true;
  }
  const calls = Array.isArray(m.toolCalls) ? m.toolCalls : [];
  if (calls.length === 0) {
    return true;
  }
  const ids = new Set(
    calls.map((c) => String((c as { id?: unknown }).id ?? '')).filter((id) => id !== ''),
  );
  if (ids.size === 0) {
    return true;
  }
  for (let j = index + 1; j < messages.length; j++) {
    const n = messages[j] as Record<string, unknown> | null | undefined;
    if (!n || typeof n !== 'object') {
      continue;
    }
    if (n.role === 'assistant') {
      break;
    }
    if (n.role === 'tool') {
      ids.delete(String(n.toolCallId ?? ''));
    }
  }
  return ids.size === 0;
}

/**
 * Ищет наибольший закрытый cutIndex в (afterIndex, limit]:
 * limit — последний индекс перед защищённым хвостом
 * (суффикс с суммой оценок >= protectTokens не покрывается).
 * coveredFrom = afterIndex + 1; кандидатов нет — null.
 */
export function planCut(
  messages: readonly unknown[],
  opts: { protectTokens: number; afterIndex: number },
): CutPlan | null {
  let limit = messages.length - 1;
  if (opts.protectTokens > 0) {
    let acc = 0;
    for (let i = messages.length - 1; i >= 0; i--) {
      acc += estimateMessageTokens(messages[i]);
      if (acc >= opts.protectTokens) {
        limit = i - 1;
        break;
      }
    }
  }
  for (let i = Math.min(limit, messages.length - 1); i > opts.afterIndex; i--) {
    if (isClosedBoundary(messages, i)) {
      return { coveredFrom: opts.afterIndex + 1, coveredUntil: i };
    }
  }
  return null;
}
```

- [ ] **Step 2: Верификация**

Run: `cd packages/harnesys && bunx tsc --noEmit && bunx biome check src/application/compaction/plan-cut.ts`
Expected: 0 ошибок.

- [ ] **Step 3: Commit**

```bash
git add packages/harnesys/src/application/compaction/plan-cut.ts
git commit -m "feat(harnesys): closed-boundary cut planner for compaction"
```

---

### Task 4: Проекция окна в llm.ts

**Files:**
- Modify: `packages/harnesys/src/application/llm.ts:107` (вызов) и конец файла (функция)

**Interfaces:**
- Produces: `projectCompacted(messages: readonly unknown[]): unknown[]` — экспорт из llm.ts; потребители: `runLlmGenerate` (здесь же), Task 7 (tokensAfter).

- [ ] **Step 1: Добавить функцию в конец `llm.ts`**

```ts
/**
 * Последний якорь (kind:'compaction') поднимается как system-ход,
 * ходы до coveredUntil и сам слот якоря выпадают, хвост остаётся.
 * Без якорей массив возвращается как есть.
 */
export function projectCompacted(messages: readonly unknown[]): unknown[] {
  let anchorIndex = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i] as Record<string, unknown> | null | undefined;
    if (m && typeof m === 'object' && m.kind === 'compaction') {
      anchorIndex = i;
      break;
    }
  }
  if (anchorIndex === -1) {
    return [...messages];
  }
  const anchor = messages[anchorIndex] as Record<string, unknown>;
  const until = typeof anchor.coveredUntil === 'number' ? anchor.coveredUntil : -1;
  const out: unknown[] = [{ role: 'system', content: String(anchor.content ?? '') }];
  for (let i = 0; i < messages.length; i++) {
    if (i === anchorIndex || i <= until) {
      continue;
    }
    out.push(messages[i]);
  }
  return out;
}
```

- [ ] **Step 2: Подключить в `runLlmGenerate`**

Строка 107 `const messages = resolveMessages(node, ctx);` заменяется на:

```ts
const messages = projectCompacted(resolveMessages(node, ctx));
```

- [ ] **Step 3: Верификация**

Run: `cd packages/harnesys && bunx tsc --noEmit && bunx biome check src/application/llm.ts`
Expected: 0 ошибок.

- [ ] **Step 4: Commit**

```bash
git add packages/harnesys/src/application/llm.ts
git commit -m "feat(harnesys): project compaction anchor as system head"
```

---

### Task 5: Промпт саммари и стрим

**Files:**
- Create: `packages/harnesys/src/application/compaction/summarize.ts`

**Interfaces:**
- Consumes: `callModel`, `type StreamChunk` из `../../adapters/ai-llm-adapter.ts`; `type ModelBinding` из `../../ports/models.ts`.
- Produces: `SUMMARY_SYSTEM_PROMPT: string`, `priorSummaryBlock(text: string): string`, `streamSummary(opts: { binding: ModelBinding; system: string; head: unknown[]; signal: AbortSignal }): AsyncGenerator<SummaryStreamEvent>`, `type SummaryStreamEvent = { type: string; data?: unknown; result?: StreamChunk }` (терминальный — `{ type: 'summary.completed', result }`). Потребитель: Task 7.

- [ ] **Step 1: Создать файл**

```ts
import { callModel, type StreamChunk } from '../../adapters/ai-llm-adapter.ts';
import type { ModelBinding } from '../../ports/models.ts';

export const SUMMARY_SYSTEM_PROMPT = `Output exactly the Markdown structure shown inside <template> and keep the section order unchanged. Do not include the <template> tags in your response.
<template>
## Objective
- [one or two brief sentences describing what the user is trying to accomplish]

## Important Details
- [constraints/preferences, decisions and why, important facts/assumptions, exact context needed to continue, or "(none)"]

## Work State
### Completed
- [finished work, verified facts, or changes made; otherwise "(none)"]

### Active
- [current work, partial changes, or investigation state; otherwise "(none)"]

### Blocked
- [blockers, failing commands, or unknowns; otherwise "(none)"]

## Next Move
1. [immediate concrete action, or "(none)"]
2. [next action if known, or "(none)"]

## Relevant Files
- [file or directory path: why it matters, or "(none)"]
</template>

Rules:
- Keep every section, even when empty.
- Use terse bullets, not prose paragraphs.
- Preserve exact file paths, symbols, commands, error strings, URLs, and identifiers when known.
- Do not mention the summary process or that context was compacted.
- Use only facts from the source.`;

export function priorSummaryBlock(text: string): string {
  return `

<prior-summary>
${text}
</prior-summary>

Merge rules: the conversation that follows is newer and wins conflicts; carry forward goals, constraints, and decisions; move finished work into Completed; anything not carried forward is lost.`;
}

export type SummaryStreamEvent = { type: string; data?: unknown; result?: StreamChunk };

/** Проход саммари: без инструментов, события стрима наружу, финал — summary.completed. */
export async function* streamSummary(opts: {
  binding: ModelBinding;
  system: string;
  head: unknown[];
  signal: AbortSignal;
}): AsyncGenerator<SummaryStreamEvent> {
  const stream = callModel(opts.binding, opts.system, opts.head, [], new Map(), opts.signal);
  let completed: StreamChunk | undefined;
  for await (const chunk of stream) {
    if (chunk.type === 'completed') {
      completed = chunk;
      continue;
    }
    if (chunk.type === 'delta') {
      yield { type: 'model.delta', data: chunk };
    } else if (chunk.type === 'reasoning-delta') {
      yield { type: 'model.reasoning', data: chunk };
    } else if (chunk.type === 'reasoning-start') {
      yield { type: 'model.reasoning-start', data: chunk };
    } else if (chunk.type === 'reasoning-end') {
      yield { type: 'model.reasoning-end', data: chunk };
    }
  }
  if (completed) {
    yield { type: 'summary.completed', result: completed };
  }
}
```

- [ ] **Step 2: Верификация**

Run: `cd packages/harnesys && bunx tsc --noEmit && bunx biome check src/application/compaction/summarize.ts`
Expected: 0 ошибок.

- [ ] **Step 3: Commit**

```bash
git add packages/harnesys/src/application/compaction/summarize.ts
git commit -m "feat(harnesys): summary template and streaming pass"
```

---

### Task 6: Файл компакции в workspace

**Files:**
- Create: `packages/harnesys/src/application/compaction/file-log.ts`

**Interfaces:**
- Consumes: `resolveWorkdirPath` из `../../adapters/actions/path-resolve.ts`; `type PathsConfig` из `../../ports/paths.ts`; `type CompactionMessage` (Task 1).
- Produces: `writeCompactionFile(input: { paths?: PathsConfig; sessionId: string; message: CompactionMessage; modelLabel: string }): Promise<string | null>` — rel-путь или `null` без `paths.cwd`. Потребитель: Task 7.

- [ ] **Step 1: Создать файл**

```ts
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { CompactionMessage } from '../../domain/compaction.ts';
import type { PathsConfig } from '../../ports/paths.ts';
import { resolveWorkdirPath } from '../../adapters/actions/path-resolve.ts';

/** ISO-время с ':', заменённым на '-': проходит sanitizeFileName, сортируется хронологически. */
export function compactionFileName(iso: string): string {
  return `${iso.replaceAll(':', '-')}.md`;
}

export function compactionRelPath(sessionId: string, fileName: string): string {
  return `.harnesys/threads/${sessionId}/compactions/${fileName}`;
}

export function compactionFileBody(message: CompactionMessage, modelLabel: string): string {
  const header = [
    `# ${message.createdAt}`,
    `- id: ${message.id}`,
    `- reason: ${message.reason}`,
    `- covered: msgs ${message.coveredFrom}-${message.coveredUntil}`,
    `- tokens: ${message.stats.tokensBefore} → ${message.stats.tokensAfter}`,
    `- model: ${modelLabel}`,
  ].join('\n');
  return `${header}\n\n${message.content}\n`;
}

/** Один файл на компакцию; коллизия секунды разрешается суффиксом. Без cwd — null. */
export async function writeCompactionFile(input: {
  paths?: PathsConfig;
  sessionId: string;
  message: CompactionMessage;
  modelLabel: string;
}): Promise<string | null> {
  const cwd = input.paths?.cwd;
  if (!cwd) {
    return null;
  }
  const rel = compactionRelPath(input.sessionId, compactionFileName(input.message.createdAt));
  const absolute = resolveWorkdirPath(cwd, rel);
  let target = absolute;
  if (await Bun.file(target).exists()) {
    target = absolute.replace(/\.md$/, `-${crypto.randomUUID().slice(0, 4)}.md`);
  }
  await mkdir(path.dirname(target), { recursive: true });
  await Bun.write(target, compactionFileBody(input.message, input.modelLabel));
  return rel;
}
```

- [ ] **Step 2: Верификация**

Run: `cd packages/harnesys && bunx tsc --noEmit && bunx biome check src/application/compaction/file-log.ts`
Expected: 0 ошибок.

- [ ] **Step 3: Commit**

```bash
git add packages/harnesys/src/application/compaction/file-log.ts
git commit -m "feat(harnesys): workspace file log for compaction summaries"
```

---

### Task 7: Проход саммари — run.ts

**Files:**
- Create: `packages/harnesys/src/application/compaction/run.ts`

**Interfaces:**
- Consumes: Task 1 (`parseThresholdSpec`, `isCompactionMessage`, `CompactionMessage`, `THRESHOLD_SUMMARY_NAME`), Task 2 (`estimateTokens`), Task 3 (`planCut`), Task 4 (`projectCompacted`), Task 5 (`SUMMARY_SYSTEM_PROMPT`, `priorSummaryBlock`, `streamSummary`), Task 6 (`writeCompactionFile`); `findBind`, `isPort`, `resolveModelForPort` из `../graph-helpers.ts`; `type AgentDefinition`, `type AgentModelRef`, `type PortRef` из `../../domain/agent-definition.ts`; `type StreamChunk` из адаптера.
- Produces:
  - `type CompactionPassContext = { agent: AgentDefinition; state: Record<string, unknown>; sessionId: string; binding: ModelBinding; models: ProviderConfig[] | ModelsPort; toolRegistry: Map<string, ToolDefinition>; paths?: PathsConfig; signal: AbortSignal }`
  - `type CompactionPassEvent = { type: 'completed'; message: CompactionMessage } | { type: 'failed'; error: string } | { type: 'model.delta' | 'model.reasoning' | 'model.reasoning-start' | 'model.reasoning-end'; data: unknown }`
  - `runSummaryPassIfDue(ctx): AsyncGenerator<CompactionPassEvent>` — авто-путь (граф, Task 8)
  - `compactForced(ctx): AsyncGenerator<CompactionPassEvent>` — ручной путь (Task 9); бросает coded-ошибку `compaction_not_configured`.

- [ ] **Step 1: Создать файл**

```ts
import type { AgentDefinition, AgentModelRef, PortRef } from '../../domain/agent-definition.ts';
import {
  type CompactionMessage,
  isCompactionMessage,
  parseThresholdSpec,
  type ParsedCompactionSpec,
  THRESHOLD_SUMMARY_NAME,
} from '../../domain/compaction.ts';
import { callModel, type StreamChunk } from '../../adapters/ai-llm-adapter.ts';
import type { ModelBinding, ModelsPort, ProviderConfig } from '../../ports/models.ts';
import type { PathsConfig } from '../../ports/paths.ts';
import type { ToolDefinition } from '../../ports/tools.ts';
import { writeCompactionFile } from './file-log.ts';
import { estimateTokens } from './estimate.ts';
import { findBind, isPort, resolveModelForPort } from '../graph-helpers.ts';
import { planCut } from './plan-cut.ts';
import { projectCompacted } from '../llm.ts';
import { priorSummaryBlock, streamSummary, SUMMARY_SYSTEM_PROMPT } from './summarize.ts';

export type CompactionPassContext = {
  agent: AgentDefinition;
  state: Record<string, unknown>;
  sessionId: string;
  binding: ModelBinding;
  models: ProviderConfig[] | ModelsPort;
  toolRegistry: Map<string, ToolDefinition>;
  paths?: PathsConfig;
  signal: AbortSignal;
};

export type CompactionPassEvent =
  | { type: 'completed'; message: CompactionMessage }
  | { type: 'failed'; error: string }
  | {
      type: 'model.delta' | 'model.reasoning' | 'model.reasoning-start' | 'model.reasoning-end';
      data: unknown;
    };

function findAnchorIndex(messages: readonly unknown[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (isCompactionMessage(messages[i])) {
      return i;
    }
  }
  return -1;
}

function toolsJsonOf(registry: Map<string, ToolDefinition>): string {
  return JSON.stringify(
    [...registry.values()].map((t) => ({ name: t.name, description: t.description })),
  );
}

async function resolveSummaryBinding(
  ctx: CompactionPassContext,
  ref: AgentModelRef,
): Promise<ModelBinding> {
  if (isPort(ctx.models)) {
    const coords = resolveModelForPort(ref, ctx.agent);
    if (coords) {
      return (ctx.models as ModelsPort).get(coords.provider, coords.model);
    }
  } else {
    const result = findBind(ctx.models as ProviderConfig[], ref, ctx.agent);
    if (result?.binding) {
      return result.binding;
    }
  }
  throw new Error(`summary model not found: ${ref.provider}/${ref.model}`);
}

async function* passIfDue(
  ctx: CompactionPassContext,
  spec: ParsedCompactionSpec,
  reason: 'threshold' | 'manual',
): AsyncGenerator<CompactionPassEvent> {
  const messages = Array.isArray(ctx.state.messages) ? (ctx.state.messages as unknown[]) : null;
  if (!messages || messages.length === 0) {
    return;
  }
  if (ctx.state.$resume !== undefined) {
    return;
  }
  const toolsJson = toolsJsonOf(ctx.toolRegistry);
  const before = estimateTokens(projectCompacted(messages), toolsJson);
  const contextLength =
    ctx.binding.model.context_length ?? ctx.binding.model.top_provider?.context_length;
  if (!contextLength) {
    return;
  }
  if (reason === 'threshold') {
    const available = contextLength - spec.outputReserveTokens;
    if (available > 0 && before.total < available * spec.thresholdRatio) {
      return;
    }
  }
  const anchorIndex = findAnchorIndex(messages);
  const anchor = anchorIndex >= 0 ? (messages[anchorIndex] as CompactionMessage) : undefined;
  const afterIndex = anchor ? anchor.coveredUntil : -1;
  if (afterIndex >= messages.length - 1) {
    return;
  }
  const protectTokens =
    reason === 'manual' ? 0 : Math.floor(contextLength * spec.protectRecentRatio);
  const plan = planCut(messages, { protectTokens, afterIndex });
  if (!plan) {
    return;
  }
  yield* writeCompactionMessage(ctx, {
    spec,
    reason,
    plan,
    anchorIndex,
    anchor,
    toolsJson,
    before,
  });
}

type WriteArgs = {
  spec: ParsedCompactionSpec;
  reason: 'threshold' | 'manual';
  plan: { coveredFrom: number; coveredUntil: number };
  anchorIndex: number;
  anchor?: CompactionMessage;
  toolsJson: string;
  before: { messages: number; tools: number; total: number };
};

async function* writeCompactionMessage(
  ctx: CompactionPassContext,
  args: WriteArgs,
): AsyncGenerator<CompactionPassEvent> {
  const messages = ctx.state.messages as unknown[];
  let binding = ctx.binding;
  if (args.spec.summaryModel) {
    try {
      binding = await resolveSummaryBinding(ctx, args.spec.summaryModel);
    } catch (e) {
      yield { type: 'failed', error: e instanceof Error ? e.message : String(e) };
      return;
    }
  }
  const from = args.anchor ? args.anchor.coveredUntil + 1 : 0;
  const head: unknown[] = [];
  for (let i = from; i <= args.plan.coveredUntil; i++) {
    if (i === args.anchorIndex) {
      continue;
    }
    head.push(messages[i]);
  }
  if (head.length === 0) {
    return;
  }
  const system = args.anchor
    ? `${SUMMARY_SYSTEM_PROMPT}${priorSummaryBlock(args.anchor.content)}`
    : SUMMARY_SYSTEM_PROMPT;

  let completed: StreamChunk | undefined;
  for await (const ev of streamSummary({ binding, system, head, signal: ctx.signal })) {
    if (ev.type === 'summary.completed' && ev.result) {
      completed = ev.result;
    } else {
      yield { type: ev.type, data: ev.data } as CompactionPassEvent;
    }
  }
  const text = completed && typeof completed.text === 'string' ? completed.text : '';
  if (!completed || completed.finishReason !== 'stop' || !text.trim()) {
    yield {
      type: 'failed',
      error: `summary pass rejected: finishReason=${completed?.finishReason ?? 'none'}${
        text.trim() ? '' : ', empty text'
      }`,
    };
    return;
  }

  const message: CompactionMessage = {
    role: 'assistant',
    kind: 'compaction',
    id: crypto.randomUUID(),
    content: text,
    coveredFrom: args.plan.coveredFrom,
    coveredUntil: args.plan.coveredUntil,
    reason: args.reason,
    stats: {
      tokensBefore: args.before.total,
      tokensAfter: 0,
      coveredCount: args.plan.coveredUntil - args.plan.coveredFrom + 1,
      usage: completed.usage,
    },
    model: { provider: binding.driver, model: binding.name },
    createdAt: new Date().toISOString(),
  };
  message.stats.tokensAfter = estimateTokens(
    projectCompacted([...messages, message]),
    args.toolsJson,
  ).total;
  messages.push(message);

  try {
    await writeCompactionFile({
      paths: ctx.paths,
      sessionId: ctx.sessionId,
      message,
      modelLabel: binding.name,
    });
  } catch (e) {
    // biome-ignore lint/suspicious/noConsole: file log is best-effort; failure must not fail the run
    console.warn(`[compaction] file log failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  yield { type: 'completed', message };
}

/** Авто-путь графа: порог, protect-recent, одна попытка обеспечивается вызывающим. */
export async function* runSummaryPassIfDue(
  ctx: CompactionPassContext,
): AsyncGenerator<CompactionPassEvent> {
  const ref: PortRef | undefined = ctx.agent.compaction;
  if (!ref) {
    return;
  }
  if (ref.name !== THRESHOLD_SUMMARY_NAME) {
    // biome-ignore lint/suspicious/noConsole: no logger in library; diagnostics must reach run logs
    console.warn(`[compaction] unknown compaction port: ${ref.name}`);
    return;
  }
  const spec = parseThresholdSpec(ref.spec);
  if (!spec.auto) {
    return;
  }
  yield* passIfDue(ctx, spec, 'threshold');
}

/** Ручной /compact: без порога и protect-recent; компакция обязана быть настроена. */
export async function* compactForced(
  ctx: CompactionPassContext,
): AsyncGenerator<CompactionPassEvent> {
  const ref: PortRef | undefined = ctx.agent.compaction;
  if (!ref || ref.name !== THRESHOLD_SUMMARY_NAME) {
    throw Object.assign(new Error('compaction is not configured'), {
      code: 'compaction_not_configured',
    });
  }
  yield* passIfDue(ctx, parseThresholdSpec(ref.spec), 'manual');
}
```

Замечание: `callModel` импортирован для типа `StreamChunk`-потока в `streamSummary` (Task 5); здесь он не нужен — если biome пометит импорт как неиспользуемый, убрать строку `import { callModel, type StreamChunk } ...` и оставить `import type { StreamChunk } from '../../adapters/ai-llm-adapter.ts';`.

- [ ] **Step 2: Верификация**

Run: `cd packages/harnesys && bunx tsc --noEmit && bunx biome check src/application/compaction/run.ts`
Expected: 0 ошибок. Если `run.ts` превышает ~300 строк несильно — оставить; резать только при явном перегрузе.

- [ ] **Step 3: Commit**

```bash
git add packages/harnesys/src/application/compaction/run.ts
git commit -m "feat(harnesys): compaction summary pass"
```

---

### Task 8: Врезка в граф и экспорт библиотеки

**Files:**
- Modify: `packages/harnesys/src/application/graph.ts`
- Modify: `packages/harnesys/index.ts`

**Interfaces:**
- Consumes: `runSummaryPassIfDue`, `type CompactionPassEvent` (Task 7).
- Produces: события `compaction.completed` / `compaction.failed` в журнале снапшота (метаданные `{ id, coveredFrom, coveredUntil, reason, tokensBefore, tokensAfter }`); экспорты из корня пакета: `compactForced`, `estimateTokens`, `projectCompacted`, типы `CompactionMessage`/`CompactionSpec`/`ParsedCompactionSpec`.

- [ ] **Step 1: Импорт в `graph.ts` (рядом с импортом `runLlmGenerate`, строка 31)**

```ts
import { runSummaryPassIfDue } from './compaction/run.ts';
```

- [ ] **Step 2: Флаг попытки — объявить рядом с `let entryPending = false;` (строка 233)**

```ts
let compactionAttempted = false;
```

- [ ] **Step 3: Проход перед циклом фолбэков — вставить между guard'ом `if (!binding) {…}` (строки 545-549) и `const bindingsToTry = …` (строка 550)**

```ts
      if (!compactionAttempted) {
        compactionAttempted = true;
        for await (const ev of runSummaryPassIfDue({
          agent: opts.agent,
          state: st,
          sessionId: opts.state.sessionId,
          binding,
          models: opts.models,
          toolRegistry: opts.toolRegistry,
          paths: opts.paths,
          signal: opts.signal ?? new AbortController().signal,
        })) {
          if (ev.type === 'completed') {
            const m = ev.message;
            const u = m.stats.usage as Record<string, unknown> | undefined;
            tokens +=
              typeof u?.totalTokens === 'number' && Number.isFinite(u.totalTokens)
                ? u.totalTokens
                : (typeof u?.inputTokens === 'number' ? u.inputTokens : 0) +
                  (typeof u?.outputTokens === 'number' ? u.outputTokens : 0);
            const e = await commit('running', 'compaction.completed', 'recorded', {
              id: m.id,
              coveredFrom: m.coveredFrom,
              coveredUntil: m.coveredUntil,
              reason: m.reason,
              tokensBefore: m.stats.tokensBefore,
              tokensAfter: m.stats.tokensAfter,
            });
            yield e;
          } else if (ev.type === 'failed') {
            const e = await commit('running', 'compaction.failed', 'recorded', { error: ev.error });
            yield e;
          } else if (PASSTHROUGH_MODEL_EVENTS.has(ev.type)) {
            yield {
              ...mkEv(ctx(), ev.type),
              metadata: ev.data as Record<string, unknown>,
              agentId: opts.agent.id,
            };
          }
        }
      }
```

Дельты прохода идут в ленту как обычные `model.*` — клиент рендерит саммари как стримящееся сообщение агента; `eventToSessionEvent` возвращает для `compaction.*` `null`, журнал рана остаётся без них.

- [ ] **Step 4: Экспорты в `packages/harnesys/index.ts`**

Существующий блок (строка 3) дополнить типами:

```ts
export { THRESHOLD_SUMMARY_NAME } from './src/domain/compaction.ts';
export type {
  CompactionMessage,
  CompactionSpec,
  ParsedCompactionSpec,
} from './src/domain/compaction.ts';
```

В конец файла добавить:

```ts
export { compactForced } from './src/application/compaction/run.ts';
export { estimateTokens } from './src/application/compaction/estimate.ts';
export { projectCompacted } from './src/application/llm.ts';
```

- [ ] **Step 5: Верификация**

Run: `cd packages/harnesys && bunx tsc --noEmit && bunx biome check src/application/graph.ts index.ts`
Expected: 0 ошибок.

- [ ] **Step 6: Commit**

```bash
git add packages/harnesys/src/application/graph.ts packages/harnesys/index.ts
git commit -m "feat(harnesys): compaction pass in generate branch and public exports"
```

---

### Task 9: Хост — ручной /compact

**Files:**
- Modify: `apps/studio/shared/thread.ts:50-53` (тип ответа)
- Modify: `apps/studio/server/application/threads/compact-thread.use-case.ts` (полная замена)
- Modify: `apps/studio/server/composition/wire-controllers.ts:247` и его deps-тип
- Modify: `apps/studio/server/composition/studio.ts` (передача `modelsPort` в `wireControllers`)

**Interfaces:**
- Consumes: `compactForced`, `type CompactionMessage`, `THRESHOLD_SUMMARY_NAME` из `harnesys` (Task 8); `createEpisodicOnCompacted` из `../memory/episodic-on-compacted.ts`; `publishDeskThread`; `ThreadRuntimeRegistry`; `RuntimeStateRepository` из `../../domain/runtime-state.port.ts`; `EpisodicPort`, `ModelBinding`, `ModelsPort`, `ToolDefinition`, `Event`, `Snapshot`, `AgentDefinition` из `harnesys`.
- Produces: `CompactThreadResponse` — union `{ compacted: true; id; coveredFrom; coveredUntil; tokensBefore; tokensAfter } | { compacted: false }`; 409 `RunConflictError` при активном ране; 400 `ValidationError` без настроенной компакции или модели.

- [ ] **Step 1: Тип ответа в `shared/thread.ts`**

```ts
export type CompactThreadResponse =
  | {
      compacted: true;
      id: string;
      coveredFrom: number;
      coveredUntil: number;
      tokensBefore: number;
      tokensAfter: number;
    }
  | { compacted: false };
```

- [ ] **Step 2: Заменить `compact-thread.use-case.ts`**

```ts
import type {
  AgentDefinition,
  CompactionMessage,
  EpisodicPort,
  Event,
  ModelBinding,
  ModelsPort,
  Snapshot,
  THRESHOLD_SUMMARY_NAME,
  ToolDefinition,
} from 'harnesys';
import { compactForced } from 'harnesys';
import type { ThreadRuntimeRegistry } from '../../adapters/thread-runtime.registry.ts';
import type { WorkspaceHarnesysRegistry } from '../../adapters/workspace-harnesys.registry.ts';
import type { RuntimeStateRepository } from '../../domain/runtime-state.port.ts';
import type { AgentRepository } from '../../domain/agent.port.ts';
import type { DeskEventsPort } from '../../domain/desk-events.port.ts';
import { NotFoundError, RunConflictError, ValidationError } from '../../domain/studio.error.ts';
import type { ThreadRepository } from '../../domain/thread.port.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';
import { createEpisodicOnCompacted } from '../memory/episodic-on-compacted.ts';
import type { GetThreadInput } from './get-thread.use-case.ts';
import { publishDeskThread } from './publish-desk-thread.ts';
import type { CompactThreadResponse } from '../../../shared/thread.ts';

export type CompactThreadRequest = {
  threadId: string;
};

export type CompactThreadInput = {
  execute(request: CompactThreadRequest): Promise<CompactThreadResponse>;
};

export type CompactThreadDeps = {
  threads: ThreadRepository;
  agents: AgentRepository;
  workspaces: WorkspaceRepository;
  workspaceHarnesys: WorkspaceHarnesysRegistry;
  registry: ThreadRuntimeRegistry;
  runtimeStates: RuntimeStateRepository;
  models: ModelsPort;
  episodic: EpisodicPort;
  deskEvents: DeskEventsPort;
  getThread: GetThreadInput;
};

export class CompactThreadUseCase implements CompactThreadInput {
  constructor(private readonly deps: CompactThreadDeps) {}

  async execute(request: CompactThreadRequest): Promise<CompactThreadResponse> {
    const thread = this.deps.threads.findById(request.threadId);
    if (!thread) {
      throw new NotFoundError('thread not found');
    }
    const agentRow = this.deps.agents.findById(thread.agentId);
    if (!agentRow) {
      throw new NotFoundError('agent not found');
    }
    const workspace = this.deps.workspaces.findById(thread.workspaceId);
    if (!workspace) {
      throw new NotFoundError('workspace not found');
    }
    const def = this.deps.workspaceHarnesys.resolveAgentDefinition(agentRow.id);
    if (!def?.compaction || def.compaction.name !== THRESHOLD_SUMMARY_NAME) {
      throw new ValidationError('compaction is not configured for this agent');
    }
    const hx = await this.deps.workspaceHarnesys.get(workspace);
    const handle = await this.deps.registry.threadOf(thread.id, hx, agentRow.id, workspace.path);
    const active = await handle.activeRun(thread.id);
    if (active) {
      throw new RunConflictError({ runId: active.runId });
    }

    const state = this.deps.runtimeStates.forState(thread.id);
    const snap = await state.load();
    if (!snap) {
      return { compacted: false };
    }
    const st: Record<string, unknown> = { ...(snap.state as Record<string, unknown>) };
    const binding = await resolveDefaultBinding(this.deps.models, def);

    let message: CompactionMessage | undefined;
    for await (const ev of compactForced({
      agent: def,
      state: st,
      sessionId: state.sessionId,
      binding,
      models: this.deps.models,
      toolRegistry: hx.tools.registry() as Map<string, ToolDefinition>,
      paths: { allow: [workspace.path], cwd: workspace.path },
      signal: new AbortController().signal,
    })) {
      if (ev.type === 'completed') {
        message = ev.message;
      }
    }
    if (!message) {
      return { compacted: false };
    }

    const sequence = snap.sequence + 1;
    const event: Event = {
      eventId: crypto.randomUUID(),
      type: 'compaction.completed',
      timestamp: Date.now(),
      sessionId: state.sessionId,
      runId: snap.runId,
      agentId: def.id,
      sequence,
      metadata: {
        id: message.id,
        coveredFrom: message.coveredFrom,
        coveredUntil: message.coveredUntil,
        reason: message.reason,
        tokensBefore: message.stats.tokensBefore,
        tokensAfter: message.stats.tokensAfter,
      },
    };
    await state.commit({ ...snap, sequence, state: st }, [event], {
      kind: 'recorded',
      sequence,
    });

    try {
      await createEpisodicOnCompacted({
        episodic: this.deps.episodic,
        workspaceId: thread.workspaceId,
        threadId: thread.id,
        episodicRef: agentRow.memory?.episodic ?? undefined,
      })({
        fromSeq: message.coveredFrom,
        toSeq: message.coveredUntil,
        compactionEntryId: message.id,
      });
    } catch (e) {
      // biome-ignore lint/suspicious/noConsole: indexing is best-effort for manual compaction
      console.warn(`[compaction] episodic index failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    publishDeskThread(this.deps.getThread, this.deps.deskEvents, thread.id);

    return {
      compacted: true,
      id: message.id,
      coveredFrom: message.coveredFrom,
      coveredUntil: message.coveredUntil,
      tokensBefore: message.stats.tokensBefore,
      tokensAfter: message.stats.tokensAfter,
    };
  }
}

async function resolveDefaultBinding(
  models: ModelsPort,
  def: AgentDefinition,
): Promise<ModelBinding> {
  const ref = def.model;
  if (!ref) {
    throw new ValidationError('agent has no model');
  }
  return models.get(ref.provider, ref.model);
}
```

- [ ] **Step 3: Сборка в `wire-controllers.ts`**

В deps-тип `WireControllersDeps` (или эквивалентный тип параметров `wireControllers`) добавить `modelsPort: ModelsPort;` (импорт типа из `harnesys`). Строку 247 заменить:

```ts
compactThread: new CompactThreadUseCase({
  threads: threadRepo,
  agents: agentRepo,
  workspaces: workspaceRepo,
  workspaceHarnesys,
  registry: threadRegistry,
  runtimeStates: runtimeStateRepo,
  models: modelsPort,
  episodic: memory.episodic,
  deskEvents,
  getThread,
}),
```

Имена локальных переменных сверить с фактическими в файле (репозитории приходят в deps `wireControllers`). Если `threadRepo`/`agentRepo`/`workspaceRepo` там недоступны — взять из того же объекта deps, что и соседние use case'ы потоков.

- [ ] **Step 4: `studio.ts` — передать `modelsPort`**

В вызове `wireControllers({ … })` (строка 201) добавить `modelsPort,` (переменная объявлена на строке 86).

- [ ] **Step 5: Верификация**

Run: `cd apps/studio && bun run typecheck`
Expected: только известная ошибка `git-file-decorations.ts(44,21)`.
Run: `bunx biome check apps/studio/server/application/threads/compact-thread.use-case.ts apps/studio/server/composition/wire-controllers.ts apps/studio/server/composition/studio.ts apps/studio/shared/thread.ts`
Expected: чисто.

- [ ] **Step 6: Commit — только файлы без WIP хозяина**

`apps/studio/shared/thread.ts` содержит несвязанные правки хозяина — в коммит не брать, правка остаётся в рабочем дереве до его решения.

```bash
git add apps/studio/server/application/threads/compact-thread.use-case.ts apps/studio/server/composition/wire-controllers.ts apps/studio/server/composition/studio.ts
git commit -m "feat(studio): manual /compact via library compactForced"
```

---

### Task 10: Хост — episodic на авто-компакцию и .gitignore workspace

**Files:**
- Modify: `apps/studio/server/adapters/store/sqlite/repos/sqlite-runtime-state.repo.ts`
- Modify: `apps/studio/server/adapters/store/sqlite/repos/sqlite-runtime-state-repo.adapter.ts`
- Modify: `apps/studio/server/composition/studio.ts:87`
- Modify: `apps/studio/server/application/workspaces/create-workspace.use-case.ts`

**Interfaces:**
- Consumes: событие `compaction.completed` (Task 8) — метаданные `{ id, coveredFrom, coveredUntil }`; `createEpisodicOnCompacted`.
- Produces: `SqliteRuntimeState(db, threadId, sessionId?, onEvents?)`; `SqliteRuntimeStateRepo(db, onEvents?)`; workspace создаётся с `.harnesys/` в `.gitignore`.

- [ ] **Step 1: `sqlite-runtime-state.repo.ts` — callback в commit**

Конструктор:

```ts
constructor(
  private readonly db: StudioDb,
  private readonly threadId: string,
  sessionId?: string,
  private readonly onEvents?: (threadId: string, events: readonly Event[]) => void,
) {
  this.sessionId = sessionId ?? crypto.randomUUID();
}
```

`commit(snapshot, _events, meta)` → `commit(snapshot, events, meta)`; после записи в БД:

```ts
if (this.onEvents) {
  this.onEvents(this.threadId, events);
}
```

- [ ] **Step 2: `sqlite-runtime-state-repo.adapter.ts` — проброс**

```ts
export class SqliteRuntimeStateRepo implements RuntimeStateRepository {
  constructor(
    private readonly db: StudioDb,
    private readonly onEvents?: (threadId: string, events: readonly Event[]) => void,
  ) {}

  forState(threadId: string): SqliteRuntimeState {
    return new SqliteRuntimeState(this.db, threadId, threadId, this.onEvents);
  }
  // deleteByThread без изменений
}
```

Импорт типа: `import type { Event } from 'harnesys';`

- [ ] **Step 3: `studio.ts:87` — связывание**

```ts
const runtimeStateRepo = new SqliteRuntimeStateRepo(db, (threadId, events) => {
  const compaction = events.find((e) => e.type === 'compaction.completed');
  if (!compaction) {
    return;
  }
  void (async () => {
    const thread = threadRepo.findById(threadId);
    if (!thread) {
      return;
    }
    const agentRow = agentRepo.findById(thread.agentId);
    if (!agentRow) {
      return;
    }
    const meta = (compaction.metadata ?? {}) as Record<string, unknown>;
    await createEpisodicOnCompacted({
      episodic: memory.episodic,
      workspaceId: thread.workspaceId,
      threadId,
      episodicRef: agentRow.memory?.episodic ?? undefined,
    })({
      fromSeq: typeof meta.coveredFrom === 'number' ? meta.coveredFrom : 0,
      toSeq: typeof meta.coveredUntil === 'number' ? meta.coveredUntil : 0,
      compactionEntryId: typeof meta.id === 'string' ? meta.id : undefined,
    });
  })().catch((e: unknown) => {
    // biome-ignore lint/suspicious/noConsole: indexing is best-effort for auto compaction
    console.warn(`[compaction] episodic index failed: ${e instanceof Error ? e.message : String(e)}`);
  });
});
```

`threadRepo` (строка 77) и `agentRepo` (72) объявлены до, `memory` (135) после — callback выполняется в рантайме, TDZ не срабатывает. Импорт `createEpisodicOnCompacted` из `../application/memory/episodic-on-compacted.ts` добавить в шапку.

- [ ] **Step 4: `.gitignore` при создании workspace — `create-workspace.use-case.ts`**

Импорт: `import { readFile, appendFile } from 'node:fs/promises';` и `import { join } from 'node:path';` (проверить, чего не хватает). После `writeWorkspaceMcpJson(targetPath, {});` добавить вызов и helper:

```ts
await ensureHarnesysIgnored(targetPath);
```

```ts
/** Журнал компакций не должен уезжать в git пользователя. Идемпотентно. */
async function ensureHarnesysIgnored(workspacePath: string): Promise<void> {
  const gitignore = join(workspacePath, '.gitignore');
  let lines: string[] = [];
  try {
    lines = (await readFile(gitignore, 'utf8')).split(/\r?\n/);
  } catch {
    lines = [];
  }
  if (lines.includes('.harnesys/')) {
    return;
  }
  const needsNewline = lines.length > 0 && lines[lines.length - 1] !== '';
  await appendFile(gitignore, `${needsNewline ? '\n' : ''}.harnesys/\n`, 'utf8');
}
```

- [ ] **Step 5: Верификация**

Run: `cd apps/studio && bun run typecheck`
Expected: только `git-file-decorations.ts(44,21)`.
Run: `bunx biome check apps/studio/server/adapters/store/sqlite/repos/sqlite-runtime-state.repo.ts apps/studio/server/adapters/store/sqlite/repos/sqlite-runtime-state-repo.adapter.ts apps/studio/server/composition/studio.ts apps/studio/server/application/workspaces/create-workspace.use-case.ts`
Expected: чисто.

- [ ] **Step 6: Commit**

```bash
git add apps/studio/server/adapters/store/sqlite/repos/sqlite-runtime-state.repo.ts apps/studio/server/adapters/store/sqlite/repos/sqlite-runtime-state-repo.adapter.ts apps/studio/server/composition/studio.ts apps/studio/server/application/workspaces/create-workspace.use-case.ts
git commit -m "feat(studio): episodic indexing on auto compaction and workspace gitignore"
```

Если `studio.ts` к этому моменту уже содержит правки из Task 9 в индексе — коммитить одним из двух коммитов по файлам строго из списка выше (пересечений по файлам между 9 и 10 нет, кроме `studio.ts`: он коммитится в Task 9; здесь его правки попадут в следующий коммит — тогда включить `studio.ts` в коммит Task 10 и сказать об этом в отчёте).

---

### Task 11: Финальная верификация и доки

**Files:**
- Commit: `COMPACTION.md`, `docs/superpowers/plans/2026-09-07-compaction.md`

- [ ] **Step 1: Полные бары**

```bash
cd packages/harnesys && bunx tsc --noEmit
cd apps/studio && bun run typecheck
bunx biome check .
```

Expected: как в Global Constraints. Отчёт — с выводом команд.

- [ ] **Step 2: Живой smoke (только если стенд отвечает)**

Проверить порты: `lsof -iTCP:3000 -sTCP:LISTEN` и `lsof -iTCP:5173 -sTCP:LISTEN`. Если :3000 слушается — на любом треде агента с включённой компакцией:

```bash
curl -s -X POST http://localhost:3000/api/threads/<threadId>/compact | jq
```

Ожидания: `{compacted: true, …}` на длинном треде / `{compacted: false}` на коротком; файл в `<workspace>/.harnesys/threads/<threadId>/compactions/`; после следующего сообщения тред продолжает отвечать (проекция не ломает генерацию). Порты свободны — шаг пропустить и сказать об этом, стенд не поднимать.

- [ ] **Step 3: Commit доков**

```bash
git add COMPACTION.md docs/superpowers/plans/2026-09-07-compaction.md
git commit -m "docs: compaction spec and implementation plan"
```

---

## Самопроверка плана (выполнена при написании)

- Покрытие спеки: триггер и порог — Task 7; срез и protect-recent — Task 3; проход (шаблон, native turns, prior-summary, guard'ы, стрим) — Task 5, 7; запись сообщения и tokensAfter — Task 7; проекция — Task 4; врезка в граф и события — Task 8; файл в workspace — Task 6; ручной /compact — Task 9; episodic (авто и ручной) — Task 9, 10; .gitignore — Task 10. UI-badge — вне скоупа (спека: опционально).
- Типы согласованы: `CompactionPassContext`/`CompactionPassEvent` (Task 7) используются в Task 8 и 9 дословно; `CutPlan.coveredFrom/coveredUntil` — Task 3 → 7; `SummaryStreamEvent` с `summary.completed` — Task 5 → 7.
- Известное упрощение против спеки: ручной /compact берёт merged-реестр инструментов (`hx.tools.registry()`), а не agent-filtered run-реестр; влияет только на оценку `toolsJson`. В спеке не зафиксировано — при ревью решить: принять или доработать.
