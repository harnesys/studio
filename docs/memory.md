# Memory порты

**Depends:** 02, 05  
**Sources:** Harnyx memory ports; AgentMemoryConfig (02)

## Контракт

Memory — host-side. Библиотека определяет порты (интерфейсы), хост реализует. Runtime резолвит `PortRef` из `AgentMemoryConfig` в конкретную реализацию.

```ts
type MemoryScopeId = {
  workspaceId: string
  agentName: string
  threadId?: string
}
```

Все memory операции scoped по `MemoryScopeId`. Хост передаёт scope при вызове портов.

## Pin (закреплённые воспоминания)

```ts
type PinSource = 'agent' | 'human'

type PinRecord = {
  key: string
  text: string
  updatedAt: string
  source: PinSource
}

type PinUpsertInput = {
  key: string
  text: string
  source: PinSource
}

type PinPort = {
  list(scope: MemoryScopeId): Promise<PinRecord[]>
  upsert(scope: MemoryScopeId, input: PinUpsertInput): Promise<PinRecord>
  remove(scope: MemoryScopeId, key: string): Promise<void>
  projectForWindow(scope: MemoryScopeId, budgetTokens: number): Promise<string>
}
```

Key-value хранилище. `projectForWindow` возвращает текст для вставки в prompt, обрезанный по `budgetTokens`.

## Semantic (семантическая память)

```ts
type SemanticScope = 'session' | 'long'
type SemanticSessionTtl = 'thread' | '24h'
type MemoryRecordSource = 'agent' | 'human' | 'compaction'

type MemoryRecord = {
  id: string
  scope: SemanticScope
  text: string
  key?: string
  createdAt: string
  updatedAt: string
  source: MemoryRecordSource
  threadId?: string
}

type SemanticListQuery = {
  scope?: SemanticScope
  limit?: number
  sessionTtl?: SemanticSessionTtl
}

type SemanticProjectInput = {
  scopes: SemanticScope[]
  limit: number
  budgetTokens: number
  sessionTtl?: SemanticSessionTtl
}

type SemanticUpsertInput = {
  scope: SemanticScope
  text: string
  key?: string
  threadId?: string
  source: MemoryRecordSource
  sessionTtl?: SemanticSessionTtl
}

type SemanticMemoryPort = {
  list(scopeId: MemoryScopeId, query: SemanticListQuery): Promise<MemoryRecord[]>
  upsert(scopeId: MemoryScopeId, input: SemanticUpsertInput): Promise<MemoryRecord>
  remove(scopeId: MemoryScopeId, id: string): Promise<void>
  projectForWindow?(scopeId: MemoryScopeId, input: SemanticProjectInput): Promise<string>
}
```

`session` scope — в рамках thread. `long` —持久ные. `sessionTtl` определяет время жизни session-записей.

## Episodic (эпизодическая память)

```ts
type EpisodicHit = {
  threadId: string
  entryId?: string
  seq?: number
  text: string
  score?: number
}

type EpisodicIndexInput = {
  workspaceId: string
  threadId: string
  fromSeq: number
  toSeq: number
  compactionEntryId?: string
}

type EpisodicSearchInput = {
  workspaceId: string
  query: string
  threadId?: string
  limit?: number
}

type EpisodicPort = {
  index?(input: EpisodicIndexInput): Promise<void>
  search(input: EpisodicSearchInput): Promise<EpisodicHit[]>
}
```

Поиск по истории thread. `index` — опциональная индексация после compaction.

## Knowledge (база знаний)

```ts
type KnowledgeHit = {
  id: string
  title?: string
  text: string
  uri?: string
  score?: number
}

type KnowledgeSearchInput = {
  workspaceId: string
  query: string
  limit?: number
}

type KnowledgeReadInput = {
  workspaceId: string
  id: string
}

type KnowledgeReadResult = {
  id: string
  text: string
  uri?: string
}

type KnowledgeReindexInput = {
  workspaceId: string
}

type KnowledgePort = {
  search(input: KnowledgeSearchInput): Promise<KnowledgeHit[]>
  read?(input: KnowledgeReadInput): Promise<KnowledgeReadResult>
  reindex?(input: KnowledgeReindexInput): Promise<void>
}
```

RAG-порт. `search` — обязательный. `read` и `reindex` — опциональные.

## Инварианты

- Memory порты — host-side. Библиотека определяет интерфейсы, хост реализует.
- `MemoryScopeId` scopeирует все операции: workspace + agent + thread.
- `PortRef` в `AgentMemoryConfig` резолвится хостом в конкретную реализацию порта.
- `null` в `PortRef` выключает подсистему.

## Out of scope

Compaction стратегии (02), runtime wiring (05), host tools для memory (16).
