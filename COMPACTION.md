# Компакция окна (threshold-summary, сообщение-саммари)

Компакция сжимает историю треда перед следующим LLM-вызовом. Саммари порождает сам агент штатной генерацией: оно стримится в чат как обычное сообщение, помечается `kind: 'compaction'` и становится якорем окна — любой следующий фолд собирается с него первого. Текст саммари дополнительно пишется файлом внутри workspace. Триггер: порог по токенам, защита недавнего хвоста, срез только между целыми парами tool-call/tool-result.

## Состояние на сегодня

Есть в коде:

- `AgentDefinition.compaction?: PortRef` — `packages/harnesys/src/domain/agent-definition.ts:74`.
- `THRESHOLD_SUMMARY_NAME = 'threshold-summary'` — `packages/harnesys/src/domain/compaction.ts`.
- Конфиг течёт до библиотеки: колонка `agents.compaction_json`, `defaultAgentCompaction()` (`apps/studio/shared/agent-runtime-defaults.ts`), панель `DraftCompaction`, `compaction: agent.compaction` в `workspace-harnesys.registry.ts:152`.
- Эндпоинт `POST /api/threads/:id/compact` и `CompactThreadUseCase` — заглушка `{ compacted: false }` (`apps/studio/server/application/threads/compact-thread.use-case.ts:12`).
- `episodic-on-compacted.ts` принимает `{ fromSeq, toSeq, compactionEntryId? }` — хук индексации саммари.
- Головной system-ход в массиве сообщений адаптер склеивает с промптом: `ai-llm-adapter.ts:69-78`.

Нет: потребления `agent.compaction` в рантайме. Это предмет документа.

## Хранение истории

История треда — снимок рантайма: таблица `snapshots` (`session_id = thread_id`), внутри JSON-состояния `st`. Ходы лежат в `st.messages`:

```ts
// user      — { role: 'user', content, attachments?, origin? }
// assistant — { role: 'assistant', content, reasoning?, toolCalls?: { name, args, id }[],
//               finishReason?, sources?, files?, usage? }
// tool      — { role: 'tool', toolCallId, name, content }
```

Пушат ходы: `core:start` (user, `graph.ts:441-477`), `llm:generate` (assistant, `graph.ts:667-676`), `executeToolCall` (tool, `buildToolMessage`). Инвариант компакции: `st.messages` только дописывается, индексы стабильны. Переписывать или сплайсить покрытый префикс запрещено.

## Сообщение-саммари

Отдельного журнала компакций нет: метка живёт на сообщении.

```ts
type CompactionMessage = {
  role: 'assistant';
  kind: 'compaction';
  id: string;                    // uuid; он же compactionEntryId для episodic-хука
  content: string;               // текст саммари
  coveredFrom: number;           // первый покрытый индекс (слот прошлого саммари или 0)
  coveredUntil: number;          // последний покрытый индекс st.messages
  reason: 'threshold' | 'manual';
  stats: { tokensBefore: number; tokensAfter: number; coveredCount: number; usage?: unknown };
  model?: { provider: string; model: string };
  createdAt: string;
};
```

Проекция использует только `coveredUntil`; остальные поля — для файла, UI и аудита.

## Триггер

Перед каждым `llm:generate` (ветка node в `graph.ts`, до сбора notes) выполняется проверка порога:

```
contextLength = binding.model.context_length ?? binding.model.top_provider?.context_length
available     = contextLength - (spec.outputReserveTokens ?? 0)
estimate      = estimateTokens(projectedMessages, toolsJson)
compact       = available <= 0 || estimate >= available * spec.thresholdRatio
```

`contextLength` берётся у binding'а генерации (`ports/models.ts:57-61, 87-95`); нет значения — авто-компакция не срабатывает. `toolsJson` — имена и описания инструментов реестра.

Спека: `agent.compaction` — `PortRef`; `null` выключает. `{ name: 'threshold-summary', spec }`, неизвестное `name` — diagnostic и пропуск (путь capability-диагностик, `graph.ts:191-195`). Парсер клампит `thresholdRatio` в `[0.1, 1]`, `protectRecentRatio` в `[0, 0.9]`, `outputReserveTokens` — целое `>= 0`, дефолты `0.8 / 0.1 / 0`.

Пропуски триггера: `spec.auto === false`; ран в `needs_input` или в `st` есть `$resume` / чекпоинт тулбатча; `st.messages` пуст; попытка в этом ране уже была (успешная или нет). `contextLength` отсутствует.

## Точка среза

Валидная граница — индекс `i`, где ход `i` закрыт: не assistant с незакрытыми `toolCalls` (каждый `id` имеет последующий `role: 'tool'` ход до следующего assistant). В момент триггера текущее поколение ещё не существует, срез через него невозможен по построению.

Дальше граница опускается ниже защищённого хвоста: с конца копим `estimateTokens`, пока сумма < `contextLength * protectRecentRatio` (ручной вызов — 0), и поднимаем до ближайшего валидного `i` выше. Повторная компакция режет от прошлого саммари: кандидаты начинаются после `last.coveredUntil`. Кандидатов нет — плана нет.

## Проход саммари

Срабатывание запускает вторую генерацию в той же ветке `llm:generate`, до основной:

- system: фиксированный шаблон саммари (ниже). При повторе к нему добавляется `<prior-summary>` с текстом прошлого саммари и правила слияния.
- tools: пустой набор.
- messages: покрытая голова живыми ходами (user/assistant/tool как есть, без сериализации).
- модель: `spec.summaryModel` через `ModelsPort.get`, иначе binding генерации.
- стрим: события проходят штатный `PASSTHROUGH_MODEL_EVENTS` — в чате видно обычное стримящееся сообщение агента.

Системный промпт шаблонный, не агентский: полный промпт с фрагментами пачек платил бы токенами на каждой компакции и повышал риск «ответить вместо суммаризовать». Живые ходы вместо сериализации компенсируют потерю идентичности: цели, решения и состояние и так лежат в разговоре.

Guard'ы результата: `finishReason === 'stop'` и непустой текст, иначе ход не пишется, коммитится `compaction.failed`, ран продолжается на полном окне; одна попытка на ран. abort — ход не пишется вовсе. Успешный текст пушится в `st.messages` как `CompactionMessage`; `stats.tokensBefore/After` считает `estimateTokens` до и после (проекция с новым якорем + `toolsJson`); `tokens += usage` прохода в бюджет рана, steps не растут.

Системный промпт прохода (фиксированный шаблон):

```
Output exactly the Markdown structure shown inside <template> and keep the section order unchanged. Do not include the <template> tags in your response.
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
- Tools are not available in this pass. Respond with the summary text only; never call tools.
- Keep every section, even when empty.
- Use terse bullets, not prose paragraphs.
- Preserve exact file paths, symbols, commands, error strings, URLs, and identifiers when known.
- Do not mention the summary process or that context was compacted.
- Use only facts from the source.
```

Добавка при повторе (в конец system): блок `<prior-summary>` с прошлым текстом и правила — диалог новее и выигрывает конфликт; из prior переносятся цели, ограничения, решения; завершённое уходит в Completed; всё, что не перенесено, теряется.

## Проекция окна

Саммари не переписывает историю — срез применяется при сборке запроса в `runLlmGenerate` (`application/llm.ts`) после `resolveMessages`:

```ts
const projected = projectCompacted(messages);
// последний kind:'compaction' на индексе s =>
//   [{ role: 'system', content: summary },
//    ...ходы с индексами > coveredUntil, кроме слота s]
// без меток => messages как есть
```

Якорь поднимается как system-ход: адаптер склеит его с промптом (`ai-llm-adapter.ts:69-78`). assistant-first в окно не попадает — первый не-system ход остаётся user, требования Anthropic Messages API не нарушаются. Защищённый хвост (индексы между `coveredUntil` и слотом саммари) остаётся дословно и хронологически. Notes (`assembleNotes`) остаются системным ходом в хвосте, как сейчас (`llm.ts:124-126`).

В транскрипте сообщение-саммари лежит на своём хронологическом месте и выглядит как ответ агента; badge по желанию UI — поле `kind` в `model.completed` metadata прохода и в событии `compaction.completed`.

## Файл саммари в workspace

После каждой успешной компакции библиотека пишет один markdown-файл, раскладка повторяет вложения:

```
<workspace>/.harnesys/threads/<threadId>/compactions/<compaction-timestamp>.md
```

Имя файла — ISO-8601 время компакции с `:`, заменённым на `-` (проходит `sanitizeFileName`, сортируется по алфавиту как по времени), например `2026-09-07T12-04-11Z.md`. Содержимое:

```md
# 2026-09-07T12:04:11Z
- id: <uuid сообщения-саммари>
- reason: threshold
- covered: msgs 0-141
- tokens: 78k → 9k
- model: xiaomi/mimo-v2.5

<текст саммари>
```

- Запись идёт через тот же файловый доступ, что и file-инструменты (`paths` из `GraphOpts`); хоста без `paths` пропуск с diagnostic, компакция работает.
- Studio при создании workspace добавляет `.harnesys/` в `.gitignore` workspace (рекомендация, чтобы журнал не уезжал в репозиторий пользователя).
- Файлы переживают удаление треда: аудит и восстановление. Удаление треда их не трогает.
- Восстановление: человек читает файлы (список по имени = хронология); агент находит прошлое через episodic-индекс — студийный хук `episodic-on-compacted.ts` вызывается с `fromSeq = coveredFrom`, `toSeq = coveredUntil`, `compactionEntryId = id` сообщения-саммари. Отдельный инструмент чтения каталога — вне первой версии.

## Ручной вызов

`POST /api/threads/:id/compact` → `CompactThreadUseCase`: гарды (компакция включена, нет активного рана через `ActiveRunRegistry`), `state.load()`, библиотечная `compactForced` — тот же проход с `protectRecent = 0` и `reason: 'manual'`, без стрима (события гасятся), запись сообщения, запись файла компакции, `state.commit`, ответ `{ compacted: true }` с метаданными. Кандидатов нет — `{ compacted: false }` без записи.

## Отказы

Ошибка прохода или пустой текст: `compaction.failed` с текстом ошибки, генерация продолжается на полном окне, следующая попытка в следующем ране. Отмена сигналом: тихо, ход не пишется. Частичный текст при `finishReason: 'length'` якорем не становится.

## Граница библиотеки и хоста

Библиотека (`packages/harnesys`):

- `domain/compaction.ts` — `THRESHOLD_SUMMARY_NAME`, `CompactionSpec`, `CompactionMessage`, парсер spec.
- `application/compaction/estimate.ts` — `estimateTokens` (chars/4 по content, reasoning, tool-call JSON, tool content; плюс `toolsJson`).
- `application/compaction/plan-cut.ts` — закрытость границы, protect-recent, план.
- `application/compaction/summarize.ts` — шаблон, сборка system (с `<prior-summary>`), вызов модели.
- `application/compaction/run.ts` — `runSummaryPassIfDue` (авто) и `compactForced` (ручной), запись `CompactionMessage`, append в файл.
- `application/llm.ts` — `projectCompacted`.
- Экспорт из `index.ts`: типы, `THRESHOLD_SUMMARY_NAME`, `projectCompacted`, `compactForced`, `estimateTokens`.

Хост (`apps/studio`):

- Вызов прохода в ветке `llm:generate` `graph.ts` + `commit('running', 'compaction.completed' | 'compaction.failed', 'recorded', ...)` для ленты событий.
- `CompactThreadUseCase` вместо заглушки: гарды, вызов `compactForced`, сохранение snapshot.
- `.harnesys/` в `.gitignore` workspace при создании.
- UI: сообщение рисуется штатно; badge по `kind` — опционально.

## Скелет вызова в graph.ts

```ts
// ветка llm:generate, после resolve binding, до notes/runLlmGenerate
if (!compactionAttempted) {
  compactionAttempted = true;                     // одна попытка на ран
  for await (const ev of runSummaryPassIfDue({
    agent: opts.agent, state: st, binding, models: opts.models,
    toolRegistry: opts.toolRegistry, paths: opts.paths,
    signal: opts.signal ?? new AbortController().signal,
  })) {
    if (ev.type === 'completed') {
      yield await commit('running', 'compaction.completed', 'recorded', {
        id: ev.message.id, coveredFrom: ev.message.coveredFrom,
        coveredUntil: ev.message.coveredUntil,
        tokensBefore: ev.message.stats.tokensBefore,
        tokensAfter: ev.message.stats.tokensAfter, reason: ev.message.reason,
      });
    } else if (PASSTHROUGH_MODEL_EVENTS.has(ev.type)) {
      yield { ...mkEv(ctx(), ev.type), metadata: ev.data, agentId: opts.agent.id };
    }
  }
}
```

`compactionAttempted` — локальная переменная рана, не состояние `st`.

## Скелет run.ts

```ts
export async function* runSummaryPassIfDue(ctx: {
  agent: AgentDefinition;
  state: Record<string, unknown>;
  binding: ModelBinding;
  models: ProviderConfig[] | ModelsPort;
  toolRegistry: Map<string, ToolDefinition>;
  paths?: PathsConfig;
  signal: AbortSignal;
}): AsyncIterable<{ type: string; data?: unknown; message?: CompactionMessage }> {
  const ref = ctx.agent.compaction;
  if (!ref || ref.name !== THRESHOLD_SUMMARY_NAME || ref.spec?.auto === false) return;
  if (blockedByPendingWork(ctx.state)) return;

  const spec = parseThresholdSpec(ref.spec);
  const messages = (ctx.state.messages as unknown[]) ?? [];
  const projected = projectCompacted(messages);
  const toolsJson = JSON.stringify([...ctx.toolRegistry.values()].map((t) => ({
    name: t.name, description: t.description,
  })));
  const before = estimateTokens(projected, toolsJson);
  const contextLength = ctx.binding.model.context_length
    ?? ctx.binding.model.top_provider?.context_length;
  if (!contextLength) return;

  const available = contextLength - spec.outputReserveTokens;
  if (available > 0 && before.total < available * spec.thresholdRatio) return;

  const anchor = lastCompactionMessage(messages);
  const plan = planCut(messages, {
    protectTokens: Math.floor(contextLength * spec.protectRecentRatio),
    afterIndex: anchor ? anchor.coveredUntil : -1,
  });
  if (!plan) return;

  // summarize: генерация с шаблонным system, tools = [], живая голова;
  // события стрима отдаются наружу до записи сообщения
  yield* writeCompactionMessage(ctx, { spec, plan, anchor, reason: 'threshold', before });
}
```

`writeCompactionMessage` резолвит модель саммари, зовёт генерацию (стрим наружу), проверяет guard'ы, пушит `CompactionMessage` в `st.messages`, пишет файл компакции, считает `tokensAfter`, отдаёт `completed` с сообщением. `compactForced` — тот же путь c `protectTokens: 0`, `reason: 'manual'`, без проброса стрима.

## Не проверено

- Поведение адаптера на вложениях в саммари-проходе: доходят ли картинки до модели. Шаблон требует «только факты из источника»; суммаризация изображений не обещается.
- Слияние соседних user-ходов адаптером: в дизайне не полагается — `<prior-summary>` живёт в system, голова начинается с user.
