# Progressive Tools — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** MCP-тулы уходят из постоянного набора в deferred-режим: модель видит каталог в notes и подгружает схемы через мета-тул `load_tools`; плюс гигиена контекста из ревью (лимиты notes, метрики, дубли заголовков, семантика пустого `tools`, per-agent MCP-фильтр).

**Architecture:** `ToolDefinition` получает `exposure`/`revealsTools`; `llm.ts` на шаге «все тула реестра» вырезает незагруженные deferred и оставляет `load_tools`; вызов `load_tools` через хук в `runSingleToolCall` пишет `state.loadedTools`; следующий шаг включает загруженные схемы. Каталог deferred уходит notes-каналом. MCP-гейтинг по `agent.mcpServers` фильтрует реестр на входах в граф.

**Tech Stack:** TypeScript, bun, AI SDK v7, biome.

**Spec:** `docs/superpowers/specs/2026-09-06-progressive-tools-design.md`

## Global Constraints

- Тесты запрещены (мораторий AGENTS.md). Верификация каждого таска: `bunx biome check <файлы>` + typecheck + live-стенд (bun :3000, vite :5173 — не перезапускать).
- Typecheck: библиотека — `bunx tsc -p packages/harnesys/tsconfig.json --noEmit`; студия — `cd apps/studio && bun run typecheck` (ошибка `git-file-decorations.ts` в клиенте прекоммитная — игнорировать, критерий: серверный tsc чист).
- Файлы ~300 строк, резать по ответственности. Публичные типы библиотеки — строго из спеки.
- Коммиты: `feat(harnesys): …`, `fix(harnesys): …`, `fix(studio): …`.
- Прекоммитная база: фикс react-preset (`think.tools` условный спред) и skills-проводка уже в рабочем дереве или закоммичены до старта.

---

### Task 1: Флаги ToolDefinition, deferred MCP

**Files:**
- Modify: `packages/harnesys/src/ports/tools.ts`
- Modify: `packages/harnesys/src/application/mcp/create-mcp-tool.ts`

**Interfaces:**
- Produces: `ToolDefinition.exposure?: 'always' | 'deferred'`, `ToolDefinition.revealsTools?: boolean`; MCP-тулы создаются с `exposure: 'deferred'`.

- [ ] **Step 1: Флаги в типе и фабрике**

В `ToolDefinition` (`ports/tools.ts:23-31`) и в spec-объекте `tool()` (`:43-53`) добавить:

```ts
exposure?: 'always' | 'deferred';
revealsTools?: boolean;
```

В `tool()` возвращающий объект добавить `exposure: spec.exposure, revealsTools: spec.revealsTools`.

- [ ] **Step 2: MCP-тулы deferred**

В `createMcpTool` (`create-mcp-tool.ts:14-29`) в spec добавить `exposure: 'deferred'`. Поле `exposure` в результате `tool()` — опциональное, `undefined` = `'always'`.

- [ ] **Step 3: Верификация + commit**

`bunx biome check packages/harnesys/src/ports/tools.ts packages/harnesys/src/application/mcp/create-mcp-tool.ts && bunx tsc -p packages/harnesys/tsconfig.json --noEmit` — чисто.

`git add packages/harnesys && git commit -m "feat(harnesys): tool exposure flags, deferred mcp tools"`

---

### Task 2: Мета-тул load_tools

**Files:**
- Create: `packages/harnesys/src/application/tools/create-load-tools-tool.ts`
- Modify: `packages/harnesys/src/application/create-runtime.ts` (регистрация в реестре)

**Interfaces:**
- Consumes: `ToolDefinition.revealsTools` (Task 1).
- Produces: `createLoadToolsTool(registry: Map<string, ToolDefinition>): ToolDefinition` — имя `load_tools`, результат `{ loaded: string[]; unknown: string[]; tools: [{ name: string; description: string; input: JsonSchema }] }`.

- [ ] **Step 1: Фабрика**

```ts
import type { ToolDefinition } from '../../ports/tools.ts';
import { tool } from '../../ports/tools.ts';

const MAX_BATCH = 16;

export function createLoadToolsTool(registry: Map<string, ToolDefinition>): ToolDefinition {
  return tool('load_tools', {
    description:
      'Load tool schemas by exact name. Deferred tools (e.g. browser, web search) are not listed in this session until loaded: call load_tools with their names, then call them normally.',
    sideEffect: 'read',
    revealsTools: true,
    input: {
      type: 'object',
      properties: {
        names: { type: 'array', items: { type: 'string' }, maxItems: MAX_BATCH },
      },
      required: ['names'],
    },
    execute(input) {
      const parsed = input as { names: string[] };
      const loaded: string[] = [];
      const unknown: string[] = [];
      const tools: { name: string; description: string; input: unknown }[] = [];
      for (const name of parsed.names ?? []) {
        const def = registry.get(name);
        if (!def) {
          unknown.push(name);
          continue;
        }
        loaded.push(name);
        tools.push({ name: def.name, description: def.description, input: def.input });
      }
      return { loaded, unknown, tools };
    },
  });
}
```

- [ ] **Step 2: Регистрация в createRuntime**

В `create-runtime.ts` после `const toolRegistry = createToolRegistry(baseTools);` (`:70`):

```ts
toolRegistry.set('load_tools', createLoadToolsTool(toolRegistry));
```

Импорт: `import { createLoadToolsTool } from './tools/create-load-tools-tool.ts';`

- [ ] **Step 3: Верификация + commit**

biome + tsc по библиотеке — чисто. Живой стенд: `curl -s localhost:3000/api/workspaces/ac11b9fb-e87c-4f48-bf89-e053c38d13d3/tools | python3 -c "import json,sys; print(any(t['name']=='load_tools' for t in json.load(sys.stdin)['tools']))"` → `True`.

`git add packages/harnesys && git commit -m "feat(harnesys): load_tools meta tool"`

---

### Task 3: Хук раскрытия в движке

**Files:**
- Modify: `packages/harnesys/src/application/tool-approve.ts:128`

**Interfaces:**
- Consumes: `ToolDefinition.revealsTools` (Task 1), результат `load_tools` с полем `loaded: string[]` (Task 2).
- Produces: контракт `state.loadedTools: string[]` — merge после execute в `runSingleToolCall`.

- [ ] **Step 1: Merge в state**

В `runSingleToolCall` сразу после `const value = await def.execute(call.args, toolCtx);` (`:128`), до `return`:

```ts
if (def.revealsTools) {
  const loaded = (value as { loaded?: unknown } | null)?.loaded;
  if (Array.isArray(loaded)) {
    const names = loaded.filter((n): n is string => typeof n === 'string');
    const prev = Array.isArray(ctx.state.loadedTools)
      ? (ctx.state.loadedTools as string[])
      : [];
    // Кламп по реестру рана: фильтр mcpServers не должен обходиться через load_tools.
    ctx.state.loadedTools = [
      ...new Set([...prev, ...names.filter((n) => ctx.toolRegistry.has(n))]),
    ];
  }
}
```

- [ ] **Step 2: Верификация + commit**

biome + tsc — чисто.

`git add packages/harnesys && git commit -m "feat(harnesys): reveal loaded tools into run state"`

---

### Task 4: Прогрессивная резолюция набора на шаге

**Files:**
- Create: `packages/harnesys/src/application/tools/exposure.ts`
- Modify: `packages/harnesys/src/application/llm.ts:104-110`

**Interfaces:**
- Consumes: `ToolDefinition.exposure` (Task 1), `state.loadedTools` (Task 3).
- Produces:
  - `resolveProgressiveTools(resolved: string[], registry: Map<string, ToolDefinition>, loaded: string[]): { toolNames: string[]; deferredPending: string[] }`
  - `formatDeferredCatalog(deferredPending: string[], registry: Map<string, ToolDefinition>): string` (лимиты 60 записей / 4000 символов)

- [ ] **Step 1: exposure.ts**

```ts
import type { ToolDefinition } from '../../ports/tools.ts';

const MAX_CATALOG_ENTRIES = 60;
const MAX_CATALOG_CHARS = 4000;
export const LOAD_TOOLS_NAME = 'load_tools';

export function loadedToolsOf(state: Record<string, unknown>): string[] {
  const v = state.loadedTools;
  return Array.isArray(v) ? v.filter((n): n is string => typeof n === 'string') : [];
}

export function resolveProgressiveTools(
  resolved: string[],
  registry: Map<string, ToolDefinition>,
  loaded: string[],
): { toolNames: string[]; deferredPending: string[] } {
  const canLoad = registry.has(LOAD_TOOLS_NAME);
  const deferredPending = canLoad
    ? resolved.filter(
        (n) => registry.get(n)?.exposure === 'deferred' && !loaded.includes(n),
      )
    : [];
  if (deferredPending.length === 0) {
    return { toolNames: resolved, deferredPending };
  }
  const toolNames = resolved.filter((n) => !deferredPending.includes(n));
  if (!toolNames.includes(LOAD_TOOLS_NAME)) {
    toolNames.push(LOAD_TOOLS_NAME);
  }
  for (const n of loaded) {
    if (registry.has(n) && !toolNames.includes(n)) {
      toolNames.push(n);
    }
  }
  return { toolNames, deferredPending };
}

export function formatDeferredCatalog(
  deferredPending: string[],
  registry: Map<string, ToolDefinition>,
): string {
  const shown = deferredPending.slice(0, MAX_CATALOG_ENTRIES);
  const lines = shown.map((n) => {
    const def = registry.get(n);
    return `- ${n}: ${def?.description ?? ''}`;
  });
  if (deferredPending.length > shown.length) {
    lines.push(`+${deferredPending.length - shown.length} more`);
  }
  let text = `Deferred tools (schemas via load_tools):\n${lines.join('\n')}`;
  if (text.length > MAX_CATALOG_CHARS) {
    text = `${text.slice(0, MAX_CATALOG_CHARS)}\n…(catalog truncated)`;
  }
  return text;
}
```

- [ ] **Step 2: Проводка в llm.ts**

В `runLlmGenerate` заменить строку `:106` и блок `:108-110`:

```ts
const resolved = node.tools === undefined ? [...ctx.toolRegistry.keys()] : (node.tools ?? []);
// Прогрессивный набор применяется только к «всем тулам реестра»; явный
// node.tools кастомного графа — контракт автора, без инъекций.
const progressive =
  node.tools === undefined
    ? resolveProgressiveTools(resolved, ctx.toolRegistry, loadedToolsOf(ctx.state))
    : { toolNames: resolved, deferredPending: [] as string[] };
const toolNames = progressive.toolNames;

const allNotes = ctx.notes ? [...ctx.notes] : [];
if (progressive.deferredPending.length > 0) {
  allNotes.push({
    tag: 'tools',
    text: formatDeferredCatalog(progressive.deferredPending, ctx.toolRegistry),
  });
}
const requestMessages = allNotes.length
  ? [...messages, { role: 'system', content: assembleNotes(allNotes) }]
  : messages;
```

В `LlmContext` поле `state` уже существует (`graph.ts:606` передаёт `st`, `llm.ts` читает его в `slots`); тип должен позволять чтение `ctx.state.loadedTools` (`Record<string, unknown>` — сузить при необходимости). Импорт: `import { formatDeferredCatalog, loadedToolsOf, resolveProgressiveTools } from './tools/exposure.ts';`

- [ ] **Step 3: Верификация + commit**

biome + tsc — чисто. Живой стенд: чат Jarvis → в дебаг-печати system-промпта в конце появился блок `Runtime notes … <tools>`; в `model.requested`… (метрики — Task 5; здесь достаточно notes).

`git add packages/harnesys && git commit -m "feat(harnesys): progressive tool resolution per llm step"`

---

### Task 5: Метрики model.stats и ошибки notes-провайдеров

**Files:**
- Modify: `packages/harnesys/src/application/llm.ts`
- Modify: `packages/harnesys/src/application/graph.ts:563-614` (notes-сборка и ctx) и PASSTHROUGH-набор

**Interfaces:**
- Consumes: Task 4 (`toolNames`, `allNotes`, `progressive.deferredPending`).
- Produces: событие фида `model.stats` с metadata `{ tools, deferredPending, systemChars, notesChars, notesErrors }`; `LlmContext.notesErrors?: string[]`.

- [ ] **Step 1: llm.ts — yield статистики**

После сборки `requestMessages`, до `const stream = callModel(...)` (`:112`):

```ts
yield {
  type: 'model.stats',
  data: {
    tools: toolNames.length,
    deferredPending: progressive.deferredPending.length,
    systemChars: prompt.length,
    notesChars: allNotes.reduce((sum, n) => sum + n.text.length, 0),
    notesErrors: ctx.notesErrors ?? [],
  },
};
```

- [ ] **Step 2: graph.ts — сбор ошибок и passthrough**

В notes-сборке (`:577-593`) оба цикла (`opts.notes` и `caps.enabled`) получают общий аккумулятор:

```ts
const notesErrors: string[] = [];
// в каждом catch {}:
catch (e) { notesErrors.push(`${cur}: ${e instanceof Error ? e.message : String(e)}`); }
```

В ctx для `runLlmGenerate` (`:604-614`) добавить `notesErrors`. В `PASSTHROUGH_MODEL_EVENTS` добавить `'model.stats'`.

- [ ] **Step 3: Верификация + commit**

biome + tsc — чисто. Живой стенд: отправить сообщение, в `run_events` появилось событие `model.stats` с `tools` заметно меньше прежнего (≈30 вместо 60+).

`git add packages/harnesys && git commit -m "feat(harnesys): model.stats event and notes error collection"`

---

### Task 6: mcpServers — per-agent фильтр MCP

**Files:**
- Modify: `packages/harnesys/src/application/tool-registry.ts`
- Modify: `packages/harnesys/src/application/create-runtime.ts` (`run`/`start`, `:119-158`)
- Modify: `packages/harnesys/src/application/run-engine.ts:131`

**Interfaces:**
- Consumes: `AgentDefinition.mcpServers?: string[]` (существует, `agent-definition.ts:72`); маркер MCP `operations: ['mcp']` + `group: serverId` (`create-mcp-tool.ts:15,17`).
- Produces: `filterToolsForAgent(registry: Map<string, ToolDefinition>, agent: { mcpServers?: string[] }): Map<string, ToolDefinition>`.

- [ ] **Step 1: Хелпер**

```ts
export function filterToolsForAgent(
  registry: Map<string, ToolDefinition>,
  agent: { mcpServers?: string[] },
): Map<string, ToolDefinition> {
  if (agent.mcpServers === undefined) {
    return registry;
  }
  const allowed = new Set(agent.mcpServers);
  const out = new Map<string, ToolDefinition>();
  for (const [name, def] of registry) {
    const isMcp = def.operations?.includes('mcp') ?? false;
    if (isMcp && def.group !== undefined && !allowed.has(def.group)) {
      continue;
    }
    out.set(name, def);
  }
  return out;
}
```

- [ ] **Step 2: Три точки входа**

`create-runtime.ts` `run`/`start`: `toolRegistry,` → `toolRegistry: filterToolsForAgent(toolRegistry, def),`. `run-engine.ts:131`: `toolRegistry: filterToolsForAgent(opts.toolRegistry ?? deps.toolRegistry, opts.agent),`.

- [ ] **Step 3: Верификация + commit**

biome + tsc — чисто. Живой стенд: у Jarvis `mcpServers: []` в записи → после PATCH `{"mcpServers":["playwright"]}` в `model.stats.tools` playwright-тулы исчезли/появились соответственно.

`git add packages/harnesys && git commit -m "feat(harnesys): per-agent mcp filtering via agent.mcpServers"`

---

### Task 7: tools_empty — структурная ошибка валидации

**Files:**
- Modify: `packages/harnesys/src/application/validate.ts` (секция llm:generate-нод, рядом с `tool_call_shape`, `:275`)

**Interfaces:**
- Produces: диагностик `severity: 'error'`, `code: 'tools_empty'` — llm-нода с явным `tools: []` не компилируется (`compileOrThrow` бросает `agent_invalid`).

- [ ] **Step 1: Диагностик**

В валидации llm:generate-нод, тем же помощником, что `tool_call_shape`:

```ts
if (Array.isArray(node.tools) && node.tools.length === 0) {
  // 'tools: []' exposes nothing (regression f48b03b); omit the key for all registry tools.
  push({ severity: 'error', code: 'tools_empty', message: 'llm node tools:[] exposes no tools; omit the key for all registry tools' });
}
```

- [ ] **Step 2: Верификация + commit**

biome + tsc — чисто. Смоук: граф с `think.tools: []` → `check()`/`compileOrThrow` возвращает `tools_empty`.

`git add packages/harnesys && git commit -m "fix(harnesys): reject explicit empty tools list on llm nodes"`

---

### Task 8: Уникальные заголовки фрагментов

**Files:**
- Modify: `packages/harnesys/src/capabilities/base.ts:33-34` (fetch)
- Modify: `packages/harnesys/src/capabilities/memory/semantic.ts:25` (semantic)

**Interfaces:** без изменений типов; меняются только тексты `prompt()`.

- [ ] **Step 1: Заголовки**

fetch (`base.ts:33-34`): `## Retrieval\n- Network: fetch.` → `## Network\n- fetch: HTTP requests.`

semantic (`semantic.ts:25`): `## Durable state` → `## Memory` (строки memory_write/list/delete без изменений). files и pin сохраняют `## Retrieval` и `## Durable state` без изменений.

- [ ] **Step 2: Верификация + commit**

biome + tsc — чисто. Живой стенд: дебаг-печать system — каждый заголовок встречается один раз.

`git add packages/harnesys && git commit -m "fix(harnesys): dedupe pack prompt headers"`

---

### Task 9: Лимиты каталога скиллов

**Files:**
- Modify: `packages/harnesys/src/application/skills/skills-catalog.ts:30-44`

**Interfaces:**
- Produces: `formatSkillsCatalog` обрезается: 40 записей / 4000 символов; хвост `+N more (raise the limit or trim skills)`.

- [ ] **Step 1: Обрезка**

```ts
const MAX_ENTRIES = 40;
const MAX_CHARS = 4000;

export function formatSkillsCatalog(skills: SkillSummary[]): string {
  if (skills.length === 0) {
    return '';
  }
  const shown = skills.slice(0, MAX_ENTRIES);
  const lines = [
    '## Available skills',
    'Catalog (full text via load_skill):',
    ...shown.map((s) =>
      s.whenToUse
        ? `- ${s.name}: ${s.description} (when: ${s.whenToUse})`
        : `- ${s.name}: ${s.description}`,
    ),
  ];
  if (skills.length > shown.length) {
    lines.push(`+${skills.length - shown.length} more (raise the limit or trim skills)`);
  }
  let text = lines.join('\n');
  if (text.length > MAX_CHARS) {
    text = `${text.slice(0, MAX_CHARS)}\n…(catalog truncated)`;
  }
  return text;
}
```

- [ ] **Step 2: Верификация + commit**

biome + tsc — чисто.

`git add packages/harnesys && git commit -m "fix(harnesys): cap skills catalog note"`

---

### Task 10: updatedAt на PATCH агента

**Files:**
- Modify: `apps/studio/server/application/agents/update-agent.use-case.ts` (финальный `return`, ~`:139`)

**Interfaces:** патч `Agent` получает `updatedAt`; тип `AgentPatch` уже несёт поле (запись агента хранит `updated_at`).

- [ ] **Step 1: Бамп**

Перед `return await Promise.resolve(this.agents.update(request.id, patch));`:

```ts
patch.updatedAt = new Date().toISOString();
```

Если `AgentPatch` не содержит `updatedAt` — добавить опциональное поле в `apps/studio/server/domain/agent.port.ts` и маппинг в `sqlite-agent.repo.ts` (`update` уже пишет `rest` скукой в `.set()`).

- [ ] **Step 2: Верификация + commit**

`cd apps/studio && bun run typecheck` (серверная часть чиста) + biome. Живой стенд: PATCH агента → `updated_at` меняется.

`git add apps/studio && git commit -m "fix(studio): bump updatedAt on agent patch"`

---

### Task 11: Живой смоук всего флоу

**Files:** без правок кода.

- [ ] **Step 1: Стенд**

Сервер подхватил правки (bun watch). Последовательность в чате Jarvis:
1. «вызови любой mcp тул» — ожидание: агент зовёт `load_tools({names:[…]})` из каталога `<tools>`, получает схемы, затем нативно вызывает mcp-тул; HITL-permission на `mcp` операцию срабатывает как раньше.
2. `run_events`: есть `model.stats`, `tools` < 60; `unknown_capability` отсутствует.
3. PATCH `{"mcpServers":[]}` → новый ран: MCP-тулы недоступны (`load_tools` отдаёт `unknown`), вернуть `["playwright","duckduckgo-mcp-server"]` обратно.

- [ ] **Step 2: Финальные проверки**

`bunx biome check .` из корня; `bunx tsc -p packages/harnesys/tsconfig.json --noEmit`; `cd apps/studio && bun run typecheck` (только прекоммитная клиентская ошибка допустима).

- [ ] **Step 3: Коммит доков**

Спека и план уже в дереве: `git add docs/superpowers && git commit -m "docs: progressive tools spec and plan"` (если ещё не закоммичены).

---

## Self-review

- Покрытие спеки: D1 (Tasks 2-4), D2 (Task 1), D3 (без конфиг-веток — Task 4), D4 (Task 6); гигиена: tools_empty (7), заголовки (8), лимиты (9 + 4), метрики и notesErrors (5), updatedAt (10). Спека дополнена клампом `loaded` по реестру рана (Task 3, шаг 1).
- Типы: `exposure`/`revealsTools`, `loadedToolsOf`, `resolveProgressiveTools`, `formatDeferredCatalog`, `filterToolsForAgent`, `LOAD_TOOLS_NAME` — согласованы между тасками.
- Порядок исполнения: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11; таски 6-10 независимы между собой и могут идти после 4 в любом порядке.
