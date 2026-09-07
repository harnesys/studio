# Команда агентов + thread shell — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thread-first shell (slide, origin/current, ветки, handoff UI), затем runtime spawn/handoff, каталог агентов, системный скилл с пресетами и From Preset.

**Architecture:** Тред — контейнер; `originAgentId` + `agentId` (current); ветка = child thread (`parentThreadId`/`forkAt`). Сайдбар slide Agents→Threads. Библиотека исполняет spawn/handoff и пачку `agents` над портом; пресеты только в `~/.harnesys/skills`.

**Tech Stack:** TypeScript, bun, SQLite/drizzle, Hono, React/FSD Studio, harnesys capabilities, biome, agent-browser.

**Spec:** `docs/superpowers/specs/2026-09-07-spawn-handoff-agent-catalog-design.md`

## Global Constraints

- Тесты запрещены. Верификация: biome + typecheck; UI — agent-browser на :5173/:3000 без второго стенда.
- `graph.ts` не раздувать: spawn/handoff в отдельных файлах.
- В `packages/harnesys` нет слова preset.
- Коммиты: `feat(studio): …`, `feat(harnesys): …`.
- Слайс FSD наружу только через `index.ts`; файлы ~300 строк по ответственности.

## Порядок тасков

Shell/данные → handoff UI → ветки → library runtime → catalog → skill/presets. Runtime (4–5) можно параллелить с хвостом shell, если контракт SessionEvent уже зафиксирован в Task 2–3.

---

### Task 1: Схема треда — origin / parent / fork + patch agentId

**Files:**
- Modify: `apps/studio/server/domain/thread.port.ts`
- Modify: sqlite schema / repo adapter для threads
- Modify: create-thread use case (ставить `originAgentId = agentId`)
- Modify: shared/client thread types + mappers
- Migration: backfill `originAgentId = agentId`

**Interfaces:**
- Produces: `Thread.originAgentId: string`; `parentThreadId?: string | null`; `forkAt?: string | null`; `ThreadPatch.agentId?`; list/filter helper `threadsForAgent(agentId)` = origin|current

- [ ] **Step 1:** Расширить тип `Thread` и `ThreadPatch` по спеке.
- [ ] **Step 2:** Колонки в SQLite + backfill.
- [ ] **Step 3:** Create thread всегда пишет origin=current; API patch current agentId.
- [ ] **Step 4:** Client `Thread` + store `forAgent` → filter origin|current.
- [ ] **Step 5:** biome + typecheck; commit `feat(studio): thread origin and branch fields`.

---

### Task 2: SessionEvent handoff + сервер пишет current

**Files:**
- Modify: `packages/harnesys/src/ports/session.ts` (тип события; можно раньше runtime)
- Modify: shared SessionEvent union если дублируется
- Modify: studio bridge / send-run path — на `agent.handoff` вызвать update thread.agentId + desk event

**Interfaces:**
- Produces: `SessionEvent` variant `{ type: 'agent.handoff'; agentId: string; ... }`; thread row updated

- [ ] **Step 1:** Тип события в библиотеке (+ реэкспорт/shared).
- [ ] **Step 2:** Подписка/обработка на сервере Studio: patch `agentId`, не трогать `originAgentId`.
- [ ] **Step 3:** Клиентский session store принимает тип (карточка — Task 3).
- [ ] **Step 4:** commit `feat(harnesys): agent.handoff session event` / `feat(studio): persist handoff current agent`.

Примечание: полный runtime handoff (ребинд графа) — Task 5; здесь контракт события и запись current, чтобы UI мог идти раньше на mock/synthetic event при необходимости.

---

### Task 3: Сайдбар slide + thread-first навигация (убрать лендинг-хаб)

**Files:**
- Modify: `apps/studio/client/src/widgets/workspace-sidebar/**`
- Modify: routes / desk open-agent-landing flows
- Modify: `ide-sync`, `ide.store` (threadId первичен; agentId на табе = current)
- Modify: agent dashboard landing — убрать из primary nav (settings с меню строки агента)

**Interfaces:**
- Produces: панели `agents` | `agent-threads`; back; open thread → tab

- [ ] **Step 1:** Состояние slide в сайдбаре (agents ↔ threadsFor(agentId)).
- [ ] **Step 2:** Клик агент → Threads; back → Agents; клик тред → `studioPath.thread` + tab.
- [ ] **Step 3:** Убрать/редирект хаб `/agent/:id` из основного потока; settings с строки.
- [ ] **Step 4:** ide-sync: не сбрасывать тред при смене current; обновлять tab.agentId.
- [ ] **Step 5:** agent-browser: slide, open thread, back. commit `feat(studio): sidebar slide agents to threads`.

---

### Task 4: Handoff в ленте + аватары в шапке треда

**Files:**
- Modify: chat-transcript (FeedNotice handoff)
- Modify: thread header / desk chrome (avatar stack)
- Modify: session event → UI wiring

- [ ] **Step 1:** Карточка handoff через `FeedNotice`.
- [ ] **Step 2:** Шапка: origin + current (current выделен); на событие — обновить.
- [ ] **Step 3:** На live handoff: patch thread store, replace query `?agent=`, tab in place, без remount ленты.
- [ ] **Step 4:** agent-browser smoke; commit `feat(studio): handoff notice and participant avatars`.

---

### Task 5: Branch from message

**Files:**
- Modify: create-thread API (parentThreadId, forkAt, agent ids)
- Modify: transcript message actions UI
- Modify: thread list badges + navigate parent/child

- [ ] **Step 1:** API create branch thread.
- [ ] **Step 2:** UI «Branch from here» → create + open tab.
- [ ] **Step 3:** Бейджи/ссылки parent↔child в slide и шапке.
- [ ] **Step 4:** agent-browser; commit `feat(studio): branch thread from message`.

---

### Task 6: Library — GraphOpts.agents + control:spawn

**Files:**
- Modify: `graph.ts` GraphOpts; run-engine*; create-runtime
- Create: `graph-spawn.ts`
- Modify: `graph.ts` ветка spawn

- [ ] **Step 1:** Протянуть `agents` в GraphOpts / RunEngineDeps / вызовы.
- [ ] **Step 2:** `runSpawnNode` по спеке (`spawn_target_missing`, child state, barrier).
- [ ] **Step 3:** Ветка в graph.ts; tsc + biome; commit `feat(harnesys): execute control:spawn`.

---

### Task 7: Library — control:handoff (ребинд) + map to SessionEvent

**Files:**
- Create: `graph-handoff.ts`
- Modify: `graph.ts`, `run-engine-events.ts`

- [ ] **Step 1:** `prepareHandoff` / ребинд let-копий agent/plan/input в startGraph.
- [ ] **Step 2:** Emit → `agent.handoff` в session mapping (согласовано с Task 2).
- [ ] **Step 3:** tsc + biome; commit `feat(harnesys): execute control:handoff`.

---

### Task 8: AgentsCatalogPort + capability `agents`

**Files:**
- Create: `packages/harnesys/src/ports/agents-catalog.ts`
- Create: `packages/harnesys/src/capabilities/agents/**`
- Modify: `packages/harnesys/index.ts`

- [ ] **Step 1–4:** Порт, tools, pack, exports по спеке; commit `feat(harnesys): agents catalog capability`.

---

### Task 9: Studio — adapter порта, graph create/update guard, wire

**Files:**
- Create: sqlite-agents-catalog.port / is-stock-react-graph
- Modify: create/update agent use cases; wire-capabilities

- [ ] **Step 1–4:** по спеке; commit `feat(studio): agents catalog port and custom graph save`.

---

### Task 10: author-agents skill + presets + From Preset UI

**Files:**
- Create: `~/.harnesys/skills/author-agents/**` (не в git)
- Modify: presets API + sidebar From Preset
- Note: `skillRegistryRoots()` уже system+workspace `.harnesys/skills`

- [ ] **Step 1:** SKILL.md + presets JSON.
- [ ] **Step 2:** GET presets + unique name suffix.
- [ ] **Step 3:** From Preset UI.
- [ ] **Step 4:** agent-browser; commit studio API/UI only.

---

### Task 11: Сквозная приёмка

- [ ] Slide Agents↔Threads; нет лендинг-хаба.
- [ ] Handoff: current меняется, origin нет; notice; тот же tab.
- [ ] Branch: child + связи.
- [ ] Spawn/handoff runtime на реальных агентах.
- [ ] list/create tools; From Preset; custom graph не затирается.
- [ ] Отчёт хозяину по пунктам критериев спеки.

---

## Spec coverage

| Спека | Таск |
|-------|------|
| origin/current, patch agentId | 1 |
| SessionEvent + persist current | 2 |
| Slide, убрать лендинг-хаб | 3 |
| Notice, аватары, in-place nav | 4 |
| Branch | 5 |
| spawn runtime | 6 |
| handoff runtime | 7 |
| catalog port/capability | 8 |
| studio adapter/graph guard | 9 |
| skill/presets/From Preset | 10 |
| приёмка | 11 |
| `.harnesys` skills roots | уже в коде; проверить в 10/11 |

## Self-check

- Имя пачки `agents`; коды `spawn_target_missing`, `handoff_target`.
- Пресеты: `~/.harnesys/skills/author-agents/presets`.
- Сайдбар: slide, не expand.
- Ветка не заменяет handoff.
`)