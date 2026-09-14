# Closed-world foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Закрытый мир возможностей агента: единый резолвер идентичности, миграция-материализация неявного «всё» в явные списки, флип семантики пустых списков/ключей, довершённый claude-compat конвертер.

**Architecture:** `resolveAgentIdentity` (library) становится единственной сборкой «definition → реестр+паки+diagnostics»; из неё же считают stored/effective discovery-тулы следующего плана. Миграция на живой семантике превращает неявные допущения в явные списки в БД, затем чисткой коммитится закрытие мира. Порядок задач необратим: T2 обязана один раз выполниться на сервере до выката T4.

**Tech Stack:** TypeScript 5, Bun workspaces, hono/drizzle/sqlite (studio server), React (studio client), biome, AI SDK адаптеры.

**Spec:** `docs/superpowers/specs/2026-09-14-agent-stress-hardening-design.md` (решения R1–R4, R9, R11; разделы §1–4). Планы 2–3 (runtime identity spawn/handoff + discovery/UI/lifecycle-тулы) — отдельные документы после этого.

## Global Constraints

- Тесты запрещены всем репо (`AGENTS.md`): не создавать `*.test.ts`, не ставить vitest. Верификация каждого шага: `bun run typecheck` и `bun run lint` в корне + ручные прогоны ниже.
- Дев-стенд хозяина (`3000` API, `5173` Vite) скорее всего слушает и перезапускается по `bun --watch` на каждый коммит в рабочей копии: перед первым шагом проверить `lsof -nPi -sTCP:LISTEN | grep -E ':(3000|5173)'`; не убивать и не поднимать чужие процессы; каждый коммит обязан проходить typecheck/lint (watch перезапускает живой сервер на нём).
- Перед T2 (миграция по БД) — остановить watch силами хозяина, `cp ~/.harnesys/studio.db ~/.harnesys/studio.db.bak-cw`, дать серверу подняться один раз, проверить миграцию, только потом коммитить T4. Шаги T2 это повторяют.
- Изменения публичной поверхности библиотеки — с обновлением `apps/studio/assets/skills/agent-creator/SKILL.md` в том же коммите.
- Файлы ~300 строк; именованные типы вместо `T['field']`; клиентский слайс FSD — экспорт только через `index.ts`.
- Коммиты в стиле репо: `refactor: ...`, `feat: ...`, `fix: ...`, `docs: ...` (англ. message, по одному на задачу).
- UI-проверки — через agent-browser (перед первым вызовом `agent-browser skills get core`).

---

### Task 1: `resolveAgentIdentity` — extract старой сборки (без смены поведения)

**Files:**
- Create: `packages/harnesys/src/application/agent-identity.ts`
- Modify: `packages/harnesys/src/application/packs/pack-run.ts` (экспорт `registerPackSkillTool`)
- Modify: `packages/harnesys/src/application/run-engine-prepare.ts:105-145` (fresh-ветка идёт через резолвер)
- Modify: `packages/harnesys/index.ts` (реэкспорт)

**Interfaces:**
- Consumes: `filterToolsForAgent` (`tool-registry.ts:38-70`), `buildPackRun`/`attachPackTools` (`pack-run.ts:59-190`), `createLoadToolsTool`/`LOAD_TOOLS_NAME` (`tools/create-load-tools-tool.ts`).
- Produces: `resolveAgentIdentity(def, ctx): AgentIdentity` c `AgentIdentity = { toolRegistry: Map<string, ToolDefinition>; packOutputs: PackRunMap; diagnostics: PackDiagnostic[] }`, `ResolveAgentIdentityCtx = { baseRegistry, registrations, fsSkills?, deferredPacks?, logger? }`. Порядок сборки в этой версии — старый (filter до attach, пустой `tools` = без allowlist): поведение не меняется. T3 перевернёт порядок и семантику внутри этой же функции; T2 (миграция) и план 2 (spawn/handoff/get) вызывают её как есть.

- [ ] **Step 1: Экспортировать `registerPackSkillTool`**

В `packages/harnesys/src/application/packs/pack-run.ts` строка 229: `function registerPackSkillTool(` → `export function registerPackSkillTool(`. Сигнатура не меняется.

- [ ] **Step 2: Создать `agent-identity.ts`**

```ts
/** Идентичность агента: единственная сборка «definition → реестр+паки+диагностики».
 *  Консюмеры: run-engine (эта версия), spawn-дети/handoff/discovery (планы 2-3).
 *  Порядок сборки пока старый (filter до attach); закрытие мира — отдельный шаг. */
import type { AgentDefinition } from '../domain/agent-definition.ts';
import type { PackRegistration, PackRunMap } from '../domain/pack.ts';
import type { Logger } from '../ports/logger.ts';
import type { SkillRegistry } from '../ports/skills.ts';
import type { ToolDefinition } from '../ports/tools.ts';
import { attachPackTools, buildPackRun, registerPackSkillTool } from './packs/pack-run.ts';
import type { PackDiagnostic } from './packs/registry.ts';
import { printPackDiagnostics } from './packs/pack-run.ts';
import { createLoadToolsTool, LOAD_TOOLS_NAME } from './tools/create-load-tools-tool.ts';
import { filterToolsForAgent } from './tool-registry.ts';

export type AgentIdentity = {
  toolRegistry: Map<string, ToolDefinition>;
  packOutputs: PackRunMap;
  diagnostics: PackDiagnostic[];
};

export type ResolveAgentIdentityCtx = {
  baseRegistry: Map<string, ToolDefinition>;
  registrations: PackRegistration[];
  fsSkills?: SkillRegistry;
  deferredPacks?: readonly string[];
  logger?: Logger;
};

export function resolveAgentIdentity(
  def: AgentDefinition,
  ctx: ResolveAgentIdentityCtx,
): AgentIdentity {
  const runRegistry = new Map(filterToolsForAgent(ctx.baseRegistry, def));
  runRegistry.set(LOAD_TOOLS_NAME, createLoadToolsTool(runRegistry));
  const { outputs, enabled, diagnostics } = buildPackRun(def, ctx.registrations);
  printPackDiagnostics(diagnostics, ctx.logger);
  attachPackTools(runRegistry, enabled, ctx.deferredPacks, ctx.logger);
  registerPackSkillTool(runRegistry, enabled, def, ctx.fsSkills);
  return { toolRegistry: runRegistry, packOutputs: outputs, diagnostics };
}
```

(`registerPackSkillTool` объявлена в файле после импортов — при экспорте из шага 1 импорт из `./packs/pack-run.ts` тот же. Проверить biome-порядок импортов `bun run lint` и отсортировать по его требованию.)

- [ ] **Step 3: Перевести fresh-ветку `prepareExecuteGraphOpts` на резолвер**

В `run-engine-prepare.ts` ветка `else { packOutputs = attachPackRun({...}); packCache.set(...) }` заменяется на:

```ts
const identity = resolveAgentIdentity(agent, {
  baseRegistry: opts.toolRegistry ?? deps.toolRegistry,
  registrations: opts.packs ?? deps.packRegistrations ?? [],
  fsSkills: opts.skills ?? deps.skills,
  deferredPacks: opts.deferredPacks ?? deps.deferredPacks,
  logger: runLogger,
});
packOutputs = identity.packOutputs;
packCache.set(runId, packOutputs);
```

Строка `const runRegistry = new Map(filterToolsForAgent(opts.toolRegistry ?? deps.toolRegistry, agent)); runRegistry.set(LOAD_TOOLS_NAME, ...)` выше остаётся только для cached-ветки (`reusePackRun` мутирует переданный registry) — перенести её внутрь `if (cached !== undefined)` блока, fresh-ветка берёт `identity.toolRegistry` как `runRegistry` (переопределить: `let runRegistry: Map<string, ToolDefinition>`; в cached-блоке собрать по-старому, в fresh — `runRegistry = identity.toolRegistry`). Итог: один прогон — ровно та же последовательность операций, что сейчас.

- [ ] **Step 4: Реэкспорт**

В `packages/harnesys/index.ts` рядом с экспортами `filterToolsForAgent`/`attachPackRun`: `export { resolveAgentIdentity, type AgentIdentity, type ResolveAgentIdentityCtx } from './src/application/agent-identity.ts';` (путь-префикс по образцу соседних строк).

- [ ] **Step 5: Верификация**

Run: `bun run typecheck && bun run lint` — ожидаемый зелёный.
Ручной: убедиться что 5173/3000 слушаются (чужой стенд), через UI (agent-browser) запустить один тред Assistant с сообщением «привет» — ран завершается как раньше; в devtools-логах сервера нет новых `pack_tool_collision`/ошибок сборки.

- [ ] **Step 6: Commit**

`git add -A && git commit -m "refactor: extract resolveAgentIdentity as single capability assembly point"`

---

### Task 2: Миграция-материализация (на СТАРОЙ семантике, до флипов)

**Files:**
- Create: `apps/studio/server/src/adapters/store/sqlite/closed-world-materialization.ts`
- Modify: `apps/studio/server/src/composition/create-host.ts` (вызов после wire runtime, до `listen`)

**Interfaces:**
- Consumes: `resolveAgentIdentity` (T1, старый порядок), `WorkspaceHarnesysRegistry.get(workspace)` → `RuntimeHandle` (`hx.tools.registry()`, `hx.skills.list()` — `ports/create-runtime.ts:72,268`), `effectiveRegistrations(workspace)`, `loadEnabledPlugins(workspaceId)`, `collectWorkspaceSkills` (`application/workspaces/list-workspace-skills.use-case.ts`), `agentsRepo.listByWorkspace`, `workspaces.list()`.
- Produces: маркер-строка `closed_world_materialization_v1` в новой таблице `schema_meta(key,value)`; явные `tools`/`skills`/`mcp_servers`/`enabled_plugins_json`/`budget_json` и `tools` на каждом `llm:generate` в `graph_json` всех агентов. T4 (флип) предполагает: после этого шага ни одна запись не зависит от «пусто = всё».

- [ ] **Step 0: Координация с хозяином (один раз)**

Попросить остановить `dev.ts`-watch; `cp ~/.harnesys/studio.db ~/.harnesys/studio.db.bak-cw`; после правок запустить стенд руками один раз и снять проверки шага 4; вернуть watch хозяину.

- [ ] **Step 1: Модуль миграции**

```ts
/** Одна дозапись «неявное → явное» перед закрытием мира (spec §2). Идемпотентна
 *  по маркеру schema_meta; считает old-effective через resolveAgentIdentity. */
import { resolveAgentIdentity } from 'harnesys';
import type { AgentGraph, PackRegistration, SkillRegistry } from 'harnesys';
import type { AgentRepository } from '../../domain/agent.port.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';
import type { WorkspaceHarnesysRegistry } from './workspace-harnesys.registry.adapter.ts';
import type { SqliteDb } from './store/sqlite/bootstrap.ts';
import { sql } from 'drizzle-orm';

export type ClosedWorldMaterializationDeps = {
  db: SqliteDb;
  workspaces: WorkspaceRepository;
  agents: AgentRepository;
  workspaceHarnesys: WorkspaceHarnesysRegistry;
};

const MARKER = 'closed_world_materialization_v1';
const SERVICE_TOOLS = new Set(['load_tools', 'load_skill', 'Skill']);

export async function runClosedWorldMaterialization(
  deps: ClosedWorldMaterializationDeps,
): Promise<void> {
  const db = deps.db;
  db.run(
    sql.raw('CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)'),
  );
  if (db.all<{ key: string }>(sql.raw(`SELECT key FROM schema_meta WHERE key = '${MARKER}'`)).length > 0) {
    return; // второй запуск — no-op
  }
  for (const workspace of deps.workspaces.list()) {
    const hx = await deps.workspaceHarnesys.get(workspace);
    const baseRegistry = new Map(hx.tools.registry());
    const registrations = deps.workspaceHarnesys.effectiveRegistrations(workspace);
    const pluginNames = (await deps.workspaceHarnesys.loadEnabledPlugins(workspace.id)).map(
      (entry) => entry.record.name,
    );
    for (const row of deps.agents.listByWorkspace(workspace.id)) {
      const def = deps.workspaceHarnesys.resolveAgentDefinition(row.id);
      if (def === null) {
        continue;
      }
      const identity = resolveAgentIdentity(def, {
        baseRegistry,
        registrations,
        fsSkills: hx.skills as SkillRegistry,
        deferredPacks: undefined, // имена от exposure не зависят: материализуем весь реестр
      });
      const names = [...identity.toolRegistry.keys()];
      const mcpServers = names
        .map((name) => identity.toolRegistry.get(name)?.group)
        .filter((group, idx, all): group is string =>
          group !== undefined &&
          (identity.toolRegistry.get(names[idx])?.operations ?? []).includes('mcp') &&
          all.indexOf(group) === idx,
        );
      const graph = materializeGraphNodes(row.graph, names);
      deps.agents.update(row.id, {
        tools: names.filter((name) => !SERVICE_TOOLS.has(name)),
        skills: skillNames(hx.skills, identity.packOutputs),
        mcpServers: [...new Set(mcpServers)],
        enabledPlugins: Object.fromEntries(pluginNames.map((name) => [name, true])),
        ...(row.budget === null ? { budget: { maxSteps: 50, policy: 'ask' as const } } : {}),
        ...(graph !== undefined ? { graph } : {}),
      });
    }
  }
  db.run(sql.raw(`INSERT INTO schema_meta(key, value) VALUES ('${MARKER}', '1')`));
}

/** Каждый llm:generate без ключа tools получает снимок реестра целиком. */
function materializeGraphNodes(graph: AgentGraph, names: string[]): AgentGraph | undefined {
  let changed = false;
  const nodes = Object.fromEntries(
    Object.entries(graph.nodes).map(([id, node]) => {
      if (node.type === 'llm:generate' && !('tools' in node)) {
        changed = true;
        return [id, { ...node, tools: [...names] }];
      }
      return [id, node];
    }),
  );
  return changed ? { ...graph, nodes } : undefined;
}

/** FS+plugin имена из handle-каталога ∪ pack-скилы собранного identity. */
function skillNames(
  catalog: SkillRegistry,
  outputs: ReturnType<typeof resolveAgentIdentity>['packOutputs'],
): string[] {
  const names = new Set<string>();
  for (const s of catalog.list() as { name: string }[]) {
    names.add(s.name);
  }
  for (const out of outputs.values()) {
    for (const s of out.skills) {
      names.add(s.name);
    }
  }
  return [...names];
}
```

`hx.tools.registry()`/`hx.skills` — поля `RuntimeHandle` (`ports/create-runtime.ts:72,268`; `skills.list()` асинхронный — `skillNames` делает `await catalog.list()` и сигнатуру правит на `Promise<string[]>`, вызов в `update` — через `await`). `AgentPatch` (`domain/agent.port.ts:75-82`) уже имеет `tools/graph/budget/enabledPlugins`; `skills`/`mcpServers` добавить в патч, если нет (репо `sqlite-agent.repo.ts:113-131` их пишет через те же поля).

- [ ] **Step 2: Вызов в composition**

В `create-host.ts` после сборки `workspaceHarnesys`/репозиториев и до `server.listen` (рядом с warm plugin agents L126-173):

```ts
await runClosedWorldMaterialization({
  db: uow.db, workspaces, agents: agentsRepo, workspaceHarnesys,
});
```

Ошибка миграции валит старт (fail loud, детерминированно).

- [ ] **Step 3: Типизация `AgentPatch`**

Если `domain/agent.port.ts` не имеет полей `tools/skills/mcpServers/enabledPlugins/budget` в `AgentPatch` — добавить (репозиторий их пишет: `sqlite-agent.repo.ts:113-131` принимает патчем).

- [ ] **Step 4: Верификация (при остановленном watch, шаг 0)**

Запустить `bun run dev.ts` (или попросить хозяина), дождаться слушания 3000, затем:
`sqlite3 ~/.harnesys/studio.db "SELECT name, json_array_length(tools), json_array_length(enabled_plugins_json) FROM agents"` — у всех агентов непустые списки; `SELECT value FROM schema_meta` содержит `closed_world_materialization_v1`; `think`-узел ассистента: `sqlite3 ~/.harnesys/studio.db "SELECT graph_json FROM agents WHERE name='Assistant'" | node -e '...'` — у llm:generate есть `tools`. Повторный старт сервера — ничего не пишет (маркер). UI: обычный прогон Assistant даёт прежний список инструментов (в `model.stats` лога число `tools` совпадает с домиграционным замером — снять его до шага 0).

- [ ] **Step 5: Commit**

`git add -A && git commit -m "feat: materialize implicit agent capabilities before closed-world flip"`

---

### Task 3: Конвертер claude-compat (R9): имена, unmapped-diag, паки, materialized нода, role из документа

**Files:**
- Modify: `packages/harnesys/src/application/plugins/bind-agents.ts:70-107`
- Modify: `apps/studio/server/src/application/plugins/plugin-agents.ts:37-91`
- Modify (diagnostics-канал, если отсутствует): `packages/harnesys/src/application/plugins/formats/agents-commands.ts` — проверить, что `PLANNED_CC_TOOLS` уже даёт diagnostic на парсе; если нет — добавить на месте парсинга `tools`.

**Interfaces:**
- Consumes: `CC_TOOL_ALIASES`/`PLANNED_CC_TOOLS` (`tool-aliases.ts`), `PackRegistration[].pack.meta.tools` (`domain/pack.ts:20-31`), `onDiagnostic: BindDiagnosticSink`.
- Produces: plugin `AgentDefinition` с нативными именами `tools`, `capabilities/packs` (деривация), `graph` с materialized `tools` на think-ноде; каталожная строка `role := doc name`. T4 полагается: у плагинного definition непустой `tools` ⇔ реально маппящиеся инструменты.

- [ ] **Step 1: `buildEntry` — маппинг тулов и drop unmapped**

В `bind-agents.ts`:

```ts
const mappedTools: string[] = [];
for (const name of spec.tools ?? []) {
  const mapped = CC_TOOL_ALIASES[name];
  if (mapped !== undefined) {
    mappedTools.push(mapped);
    continue;
  }
  if (PLANNED_CC_TOOLS[name] !== undefined) {
    bind.onDiagnostic?.({
      severity: 'warning',
      code: 'claude_tool_unmapped',
      message: `agent "${spec.id}" requests Claude tool "${name}": ${PLANNED_CC_TOOLS[name]}`,
    });
    continue;
  }
  mappedTools.push(name); // нативное имя из cc-дока без префиксов
}
if (mappedTools.length > 0) definition.tools = mappedTools;
definition.packs = packsForTools(mappedTools, bind.packIndex); // шаг 2
definition.graph = standardAgentGraph(mappedTools); // шаг 3
```

`type` диaгностики — существующий `PluginDiagnostic` из `domain/plugin-diagnostics.ts`.

- [ ] **Step 2: Индекс «инструмент → пак» в контекст биндинга**

В `AgentBindContext` добавить `packIndex: Map<string, string>` (tool name → pack name), строить у вызывающего (`plugin-agents.ts`):

```ts
const packIndex = new Map(
  registrations.flatMap((r) => r.pack.meta.tools.map((t) => [t.name, r.pack.name] as const)),
);
```

`packsForTools(tools, index)`: `Object.fromEntries([...new Set(tools.map(t=>index.get(t)).filter(Boolean))].map(p=>[p,{}]))` — возвращает `undefined` при пустом результате. В `plugin-agents.ts` `bindAgentComponents(ir, resolveModel, onDiagnostic, userConfig, packIndex)` — расширить сигнатуру (5-й опциональный аргумент).

- [ ] **Step 3: `standardAgentGraph(tools: string[])`**

`buildEntry` строит граф вызовом с материализованным списком; в `standardAgentGraph` think-нода всегда получает `tools: [...tools]` (в т.ч. пустой массив: «агент без инструментов» из документа — это и есть закрытый мир; после T4 отсутствие ключа значило бы то же, но явный ключ снимает догадки).

- [ ] **Step 4: Role/name/description из документа (хост)**

`plugin-agents.ts:65-73`: `role: 'plugin'` → `role: agentName` (имя из документа, по слову владельца дублирует name); строку `name:` не трогать (уже doc name); `plugin: true` оставить до смены level-модели в плане 3. `instructions` уже из тела.

- [ ] **Step 5: Модель без runtime-borrow**

В `resolveModel`-колбэке (`plugin-agents.ts:86-116`) при null — эмитить `PluginDiagnostic` `model_unresolved` (severity warning) вместо тихого отказа: компонент остаётся без модели, спавн закроется ошибкой в T4-эре после плана 2.

- [ ] **Step 6: Верификация**

`bun run typecheck && bun run lint`. Ручной: UI-прогон Assistant: `agents_spawn` на `feature-dev:code-reviewer` (разрешение по имени/префиксу) — в ответе ребёнка реальные тулы (`Glob`→`glob` и т.д.), в warnings-логе сервера ровно по строке `claude_tool_unmapped` на WebSearch/NotebookRead/KillShell/BashOutput из документа. Деск-события UI не сломаны.

- [ ] **Step 7: Commit**

`git add -A && git commit -m "feat: claude-compat agent converter maps tools, derives packs, materializes node tools"`

---

### Task 4: Флип closed-world (только после успешного однократного прогона T2!)

**Files:**
- Modify: `packages/harnesys/src/application/tool-registry.ts:38-70`
- Modify: `packages/harnesys/src/application/agent-identity.ts` (порядок: attach → filter → services)
- Modify: `packages/harnesys/src/application/llm.ts:135` (`resolved`)
- Modify: `apps/studio/server/src/application/agents/react-preset.ts:44-51`
- Modify: `apps/studio/server/src/adapters/studio-run-targets.adapter.ts:185-198` (`effectivePlugins`)
- Modify: `apps/studio/server/src/adapters/capabilities/sqlite-agents-catalog.port.ts:216-218` (стоп-collapse)
- Modify: `packages/harnesys/src/packs/agents/create-agents-tools.ts:184-188` (нет auto-add) + description L123
- Modify: `apps/studio/server/src/application/agents/create-agent.use-case.ts:146-149` (delegate default budget)
- Modify: `packages/harnesys/src/domain/agent-definition.ts` (докуляция-комменты полей `tools/skills`: «omitted = none»)
- Modify: shipped-пресеты `apps/studio/assets/presets/agents/*.json` (явные `tools` в записи и в think/act llm-нодах) — через скрипт шага 7
- Modify: `apps/studio/client/src/features/manage-agent` (labels «пусто = недоступно»; pane плагинов при отсутствии — minimal, паттерн соседней pane)
- Modify: `apps/studio/assets/skills/agent-creator/SKILL.md` (строки 12, 40, §Packs/§Presets; канонический сниппет с явным tools)

**Interfaces:**
- Consumes: T1-резолвер (та же сигнатура), T2 (данные явные), T3 (плагинные def с нативными именами и паками).
- Produces: финальная семантика плана 1: `omitted|null|[]` → пусто везде; `effective` не добавляет ничего, кроме служебных `load_tools`/`load_skill`/`Skill`.

- [ ] **Step 1: `filterToolsForAgent` — allowlist обязателен, пустой/нет = пусто**

```ts
export function filterToolsForAgent(
  registry: Map<string, ToolDefinition>,
  agent: { tools?: string[]; mcpServers?: string[]; disallowedTools?: string[] },
): Map<string, ToolDefinition> {
  // Closed-world: неназванный инструмент недоступен; раннего «вернуть весь реестр» больше нет.
  const blocked = new Set((agent.disallowedTools ?? []).map(resolveToolAlias));
  const allowedServers = new Set(agent.mcpServers ?? []);
  const requested = new Map<string, string>();
  for (const name of agent.tools ?? []) {
    requested.set(resolveToolAlias(name), name);
  }
  const out = new Map<string, ToolDefinition>();
  for (const [name, def] of registry) {
    if (!requested.has(name)) {
      continue;
    }
    const isMcp = def.operations?.includes('mcp') ?? false;
    if (isMcp && def.group !== undefined && !allowedServers.has(def.group)) {
      continue;
    }
    if (blocked.has(name)) {
      continue;
    }
    const alias = requested.get(name);
    out.set(alias ?? name, alias !== undefined && alias !== name ? { ...def, name: alias } : def);
  }
  return out;
}
```

Вызывающие, которые полагались на старый проходной двор (`tools: undefined` = всё), после T2 имеют материализованные списки; библиотечные тестовые/one-shot пути без def-ограничений этот хелпер не зовут (проверить компиляцией: `bun run typecheck`). Комментарий `domain/agent.port.ts:43` («empty = all workspace tools») правится тем же коммитом на `omitted/empty = none`.

- [ ] **Step 2: Порядок в резолвере: attach → filter → services**

В `resolveAgentIdentity` собрать `const merged = new Map(ctx.baseRegistry);` → `buildPackRun`/`attachPackTools(merged, ...)` → `const filtered = filterToolsForAgent(merged, def)` → `runRegistry = new Map(filtered)` → `registerPackSkillTool(runRegistry, ...)` → `runRegistry.set(LOAD_TOOLS_NAME, createLoadToolsTool(runRegistry))`. Служебные поверх фильтра; collisions/diagnostics — как в T1.

- [ ] **Step 3: `llm.ts` — узел без ключа = без инструментов**

`const resolved = node.tools === undefined ? [...ctx.toolRegistry.keys()] : (node.tools ?? []);` → `const resolved = node.tools ?? [];`

- [ ] **Step 4: `buildReactGraph` — think всегда с явным списком**

```ts
const thinkNode: Node = { ...THINK_NODE, tools };
```

(комментарий L45-46 про «пустой список = все» удалить вместе с текстом).

- [ ] **Step 5: `effectivePlugins` — unset = ни одного плагина**

```ts
if (overrides === undefined || Object.keys(overrides).length === 0) {
  return [];
}
```

- [ ] **Step 6: Порт и create**

`toAgentDefinition`: `skills: agent.skills`, `tools: agent.tools`, `mcpServers: agent.mcpServers` (без `.length ? : undefined`). В `create-agents-tools.ts`: удалить ветку auto-add `agents` (L184-188: `const packs = 'agents' in packsRaw ? ...` → `next.packs = packsRaw`), в description `agents_create` добавить `tools/skills/mcpServers/packs/enabledPlugins: omitted or [] means none; list every capability explicitly.`. В `create-agent.use-case.ts` после L147: при `parentId !== null && request.budget == null` — `{ maxSteps: 25, policy: 'error' }`.

- [ ] **Step 7: Пресеты — генерация явных списков**

`temp/gen-preset-tools.ts` (внутри репо, после прогонов удалить не обязан — temp разрешён): импортировать `filesCapability…agentsCapability` и т.д. из `harnesys`, для каждого `assets/presets/agents/*.json`: `tools := union(pack.meta.tools.name по capabilities) ∪ ['ask_user','map','wait']`; записать в JSON `tools` и в `graph.nodes.*.tools` каждого `llm:generate` (`+ ['load_tools','load_skill','Skill']` при наличии). Прогнать `bun run temp/gen-preset-tools.ts`, diff проверить глазами.

- [ ] **Step 8: Клиент**

`manage-agent/model/agent-config.ts`: комментарии/лейблы форм — «пусто = недоступно»; проверить наличие редактора `enabledPlugins` (grep `enabledPlugins` в `ui/`): нет — новая `ui/agent-plugins-pane.tsx` по образцу соседних pane (чекбоксы установленных плагинов воркспейса, `ToggleGroup`/`Field` из `shared/ui`), добавить в `agent-config-category-panes.tsx` + экспорт в `index.ts`. Draft new-agent не прет-fillить tools.

- [ ] **Step 9: SKILL.md (тот же коммит)**

L12: заменить «Omitting the key is not "no tools".» на `"tools" omitted, null or [] means no tools — at node and at agent level alike.`; канонический цикл: `think` с `"tools": ["read_file", "write_file", "shell"]` и фразой-заглушкой «список = все инструменты агента»; §Nodes `llm:generate`: `tools: string[] — only listed names are visible (omitted/empty = none)`; §Packs: убрать auto-add-упоминание, добавить closed-world-предложение; §Presets: «empty/missing tools = no tools».

- [ ] **Step 10: Верификация**

`bun run typecheck && bun run lint`. Стенд: (1) Assistant: обычный тред — все прежние тулы на месте (effective из T2-списков); (2) `agents_create` нового top-level без `tools` → `agents_get` ещё нет, проверить через UI-инспектор: пустой список, в тред-прогоне агент отвечает текстом без tool-calls; (3) UI: создать агента с одним `read_file` без files-пака → предупреждение в … нет UI-effective — проверить логи сервера `tool_unreachable` (добавить print в резолвер T1, severity warning) — diagnostics печатаются `printPackDiagnostics`; (4) feature-dev reviewer спавнится и читает файлы; (5) форма manage-agent: пустой выбор инструментов = сохранение с `[]`, подпись «недоступно» видна.

- [ ] **Step 11: Commit**

`git add -A && git commit -m "feat: enforce closed-world capability semantics (omitted and empty mean none)"`

**Переходное состояние после T4 до плана 2 (осознанно, проверить в приёмке):** `runOneChild`/`prepareHandoff` ещё фильтруют реестр родителя по спискам цели — делегат получает `свои_списки ∩ реестр_родителя` (детерминированно и уже не «всё подряд», но не полная идентичность; её доводит план 2, шаг D). Для валидатора плана 3 зафиксировано исключение: `load_tools`/`load_skill`/`Skill` в `node.tools` не считаются выходом за `agent.tools` (сервисы добавляются резолвером поверх фильтра).

---

### Task 5: Аудит вендорных плагинов и стенда под закрытый мир

**Files:**
- Read-only аудит: `~/.harnesys/plugins/*/agents/*.md`, `~/.harnesys/presets/agents/*.json` (если есть)
- Create при необходимости: заметка `docs/superpowers/plans/2026-09-14-cw-audit-findings.md`

- [ ] **Step 1:** Для каждого плагинного агента: Tools-строки → через шаг T3; у агентов без `tools` в доке — зафиксировать (после T4 они chat-only). Для домашних пресетов: отсутствующий/пустой `tools` → перечислить явно или признать chat-only.
- [ ] **Step 2:** Результаты одной таблицей в notes-файл; владельцу — решение по каждой строке (не менять вендорные файлы без команды хозяина).
- [ ] **Step 3:** Commit заметки: `docs: record closed-world audit for vendor plugins and home presets`

---

### Task 6: Приёмка плана 1 (ручной прогон, spec §12.1–2, 4, 7-частично)

- [ ] 1. sqlite: все строки `agents` имеют непустой `tools` после миграции; повторный boot — no-op (маркер).
- [ ] 2. Замер до/после (снять до T4 в git stash-прогоне или по бэкапу БД): UI-прогон Assistant — тот же набор инструментов (count по `model.stats` в серверных логах), run завершается.
- [ ] 3. Новый агент через UI без инструментов: отвечает, tool-calls нет; через форму: подсказка «недоступно» читается.
- [ ] 4. `agents_spawn` `feature-dev:code-reviewer` из Assistant: ребёнок вызывает `glob`/`grep`/`read_file`; серверные логи содержат `claude_tool_unmapped` только по WebSearch/NotebookRead/KillShell/BashOutput; role в каталоге (`sqlite3 ~/.harnesys/studio.db` — плагинные не в БД; проверить через `agents_list` UI-ассистента запросом «перечисли агентов»): role = `code-reviewer`.
- [ ] 5. `enabledPlugins` пуст у нового агента: ни superpowers-скиллов в каталоге (`load_skill` без плагиновых имён), ни SessionStart-superpowers хука (в логах нет запуска run-hook.cmd при прогоне этого агента).
- [ ] 6. Мусор стресс-теста: `TestSpecialist` остаётся до плана 3 (lineage) — не блокирует.

---

## Self-review

Покрытие spec §1 (резолвер) — T1+T4 шага 2; §2 (миграция) — T2, `enabledPlugins`/`budget` включены; §3 (флипы) — T4 (node/allowlist/services/buildReactGraph/effectivePlugins/auto-add/порт/формы/пресеты/SKILL); §4 (конвертер) — T3; R3 модель/бюджет — T3 шаг 5 + T4 шаг 6 (создание-дефолт); R8 row role — T3 шаг 4 (level/source — план 3). Не покрыто этим планом (осознанно, планы 2–3): spawn/handoff identity (§5, §7), memory/sandbox и scopeForExec (§1 хвост, §8), map-bus и prompt-секции (§8), все discovery-тулы/`system_capabilities`/merge create/lineage/`returnOnEnd`/UI-секции (§6, §7, §9, §10). Типы согласованы: `AgentIdentity`, `ResolveAgentIdentityCtx`, `PluginDiagnostic`, `PackDiagnostic` — существующие; новых публичных имён за пределами T1-экспорта не введено.
