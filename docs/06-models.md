# 06. Models

**Depends:** 02, 05  
**Sources:** RUNTIME model binding; Harnyx ProviderConfig / AgentModelRef

## Контракт

```ts
type ProviderConfig = {
  name: string
  driver: string // ∈ DRIVERS
  apiKey?: string
  apiUrl?: string
  headers?: Record<string, string>
  enabled?: boolean
  models: ModelRecord[] // минимум { name: string, … }
}

// createRuntime({ models: ProviderConfig[] | ModelsPort })
// discoverModels({ driver, apiKey?, apiUrl?, headers? })
```

Binding (согласовано с AgentDefinition):

| Источник | Правило |
|---|---|
| `llm:generate.model` omit \| `'default'` | `agent.model` |
| `llm:generate.model` string | `agent.models[id]` (нет ключа → ошибка) |
| `llm:generate.model` AgentModelRef | как есть |
| Резолв | `createRuntime.models`: provider `name` + model `name` |

Нет провайдера/модели → `model_unresolved` до вызова LLM.  
`fallback?: AgentModelRef[]` на агенте: как Harnyx (политика retry/failover при реализации).

`ai` / `@ai-sdk/*` наружу не экспортируем; драйверы внутри пакета.

## Утилиты

```ts
function resolveModel(record: ModelRecord): ResolvedModel
```

Накладывает `record.host` поля на record. Возвращает `ResolvedModel` с merged полями.

```ts
const CHAT_GENERATION_PARAMETERS: readonly string[]
// ['temperature', 'top_p', 'top_k', 'frequency_penalty', 'presence_penalty', 'seed', 'max_tokens', 'max_completion_tokens']

function withChatGenerationParameters(params: string[] | undefined): string[]
```

Добавляет стандартные chat-параметры к списку `supported_parameters`. Используется при проверке совместимости модели.

```ts
function filterGenerationSettings(
  settings: AgentGenerationSettings | undefined,
  supportedParameters: string[] | undefined,
): AgentGenerationSettings | undefined
```

Фильтрует `AgentGenerationSettings` по `supported_parameters` модели. Возвращает `undefined` если ни один параметр не поддерживается.

## Инварианты

- Примеры PUBLIC_API с `model: 'default'` валидны при заданном `agent.model`.
- `toolPermission` / modelAliases на createRuntime нет.

## Out of scope

Chat port internals, stream chunk constants (VISION). Cost guards: middleware (`05`); hard-stop budget: `maxSteps` / `maxTokens` / `deadlineMs` (`13`).
