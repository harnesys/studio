---

### 1. **Взрыв портов в `packages/harnesys/src/ports/` (20+ файлов)**

Каждая доменная сущность получает свой порт (`run-event-store.ts`, `run-lifecycle-store.ts`, `runtime-state.ts`, `session.ts`, `threads.ts`, `agents-catalog.ts`, `scheduler.ts`, `webhook.ts`, `memory.ts`, `mcp.ts`, `tools.ts`, `skills.ts`, `create-runtime.ts`, `run-targets.ts`, `paths.ts`, `models.ts`, `permissions.ts`, `artifacts.ts`, `plan.ts`...). Это **порт-на-сущность**, а не порт-на-возможность — создаёт сильную связанность, заставляет хосты реализовывать кучу интерфейсов и делает библиотеку сложной для постепенного внедрения. Сам `CreateRuntimeOptions` содержит 24 поля.

### 2. **Протекающая абстракция: `RunEngineDeps` смешивает процесс-статические и per-run зависимости**

```ts
// run-engine-types.ts:18-36
export type RunEngineDeps = {
  lifecycle: RunLifecycleStore;      // на процесс
  events: RunEventStore;             // на процесс
  feed: RunEventFeed;                // на процесс
  instanceId: string;                // на процесс
  models: ProviderConfig[] | ModelsPort; // на процесс, но конфигурируемый
  toolRegistry: Map<string, ToolDefinition>; // на процесс
  // ...
  /** Per-run контекст приходит через RunTargetOpts */
  agents: AgentsResolve;
};
```

Потом `RunTargetOpts` дублирует/перекрывает половину (`packs`, `skills`, `toolRegistry`, `permissions`, `paths`, `notes`...). Двухслойный DI запутывает и провоцирует ошибки.

### 3. **`RuntimeHandle` — монструозный кухонный комбайн (50+ методов в 7 неймспейсах)**

`create-runtime.ts:65-116` — `run`, `start`, `resume` (deprecated но оставлен), `compile`, `check`, `session`, `skills.list`, `packs.list`, `tools.list`, `tools.registry`, `mcp.list`, `reloadSkills`, `reloadMcp`, `close`. Грубое нарушение ISP. Хостам, которым нужен только `run()`, приходится стабить/имплементировать всё.

### 4. **SQLite-адаптеры дублируют логику портов вместо композиции**

`sqlite-run-lifecycle.adapter.ts` — 290 строк с CAS-переходами, продлением лиз, управлением epoch. Эта логика принадлежит доменному слою библиотеки, а не адаптеру. Интерфейс порта даже документирует коды ошибок CAS (`run_terminal`, `already_queued`, `lease_stale`...) — **порт диктует детали реализации**.

### 5. **`run-engine.ts` — 228 строк смешанных ответственностей**

Управление лизами, кэш паков, журналирование событий, журналирование детей-спавнов, запуск графа, обработка ошибок — всё в одной функции. Метод `execute` делает: таймер продления лиза, выборку событий, поиск ответа, компиляцию, сборку реестра, прикрепление паков, сборку опций графа, запуск сегмента, очистку. Сложно тестировать, сложно читать.

### 6. **Нет чёткой границы «ядро библиотеки» / «интеграция хоста»**

- `packages/harnesys/src/application/run-engine.ts` импортирует из `../ports/run-lifecycle-store.ts` (порт библиотеки)
- Но `apps/studio/server/composition/studio.ts` связывает `SqliteRunLifecycleStore` (адаптер) + `createRunEngine` (библиотека) + `createRunClaimer` (библиотека) + `StudioRunTargets` (адаптер студии) в одном файле на 327 строк

Библиотека экспортирует и низкоуровневые порты, и высокоуровневые движки — хосты вынуждены понимать внутреннюю слоистость.

### 7. **In-memory дефолты внутри `createRuntime` скрывают обязательные зависимости**

```ts
// create-runtime.ts:83-95
if ((options.lifecycle === undefined) !== (options.events === undefined)) {
  throw new Error('lifecycle and events must be provided together');
}
if (lifecycle === undefined && events === undefined) {
  const memEvents = new InMemoryRunEventStore();
  events = memEvents;
  lifecycle = new InMemoryRunLifecycleStore(memEvents);
}
```

Тихо создаёт in-memory сторы — ок для демо, опасно для продакшена (потеря данных при рестарте). Должен требовать явный opt-in.

### 8. **Определение агента — огромный нетипизированный JSON-блоб**

`agent-definition.ts:63-85` — `AgentDefinition` с 22 опциональными полями, включая вложенные объекты (`model`, `models`, `fallback`, `skills`, `tools`, `mcpServers`, `toolOutput`, `compaction`, `memory`, `paths`, `state`, `graph`, `budget`, `packs`, `capabilities`). Нет дискриминанта, нет стратегии версионирования. `defineAgent` делает `JSON.parse(JSON.stringify(def))` — рантайм-клон, теряющий типы.

### 9. **Реестр инструментов — просто `Map<string, ToolDefinition>`, передаваемый везде**

Нет формальной модели capability/permission — просто мешок функций. Поля `exposure: 'always' | 'deferred'` и `revealsTools` намекают на намерения, но нигде не принудительно применяются.

### 10. **Общие типы клиент/сервер в `apps/studio/shared/`, но нет валидации схем на границе**

`shared/types.ts` вероятно дублирует доменные типы. Нет `zod`-схем на HTTP-границе — сервер доверяет вводу клиента или валидирует ad-hoc в use-case'ах.

---

**Итог**: Библиотека пытается быть полным фреймворком (порты + движки + адаптеры + CLI), но слои абстракции инвертированы — порты диктуют реализацию, движки выставляют слишком большую поверхность, хосты обязаны сшивать 20+ интерфейсов для рабочего рантайма. Меньшее ядро с **capability-based портами** (один `RuntimePort` с `run`, `stream`, `compile` вместо 20 портов) было бы проще для внедрения.
