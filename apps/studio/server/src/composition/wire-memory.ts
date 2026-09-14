import type { Hono } from 'hono';
import { KnowledgeController } from '../adapters/http/memory/knowledge.controller.ts';
import { MemoryController } from '../adapters/http/memory/memory.controller.ts';
import { StudioEmbeddings } from '../adapters/memory/embeddings.ts';
import { KnowledgeIndexEventsAdapter } from '../adapters/memory/knowledge-index-events.adapter.ts';
import { SqliteKnowledgeIndexRepo } from '../adapters/memory/knowledge-index-repo.ts';
import { KnowledgeIndexer } from '../adapters/memory/knowledge-indexer.ts';
import { KnowledgeWatchBridge } from '../adapters/memory/knowledge-watch.ts';
import { SqliteEpisodicPort } from '../adapters/memory/sqlite-episodic.port.ts';
import { SqliteKnowledgePort } from '../adapters/memory/sqlite-knowledge.port.ts';
import { SqlitePinPort } from '../adapters/memory/sqlite-pin.port.ts';
import { SqliteSemanticPort } from '../adapters/memory/sqlite-semantic.port.ts';
import type { StudioDb } from '../adapters/store/sqlite/connection.ts';
import { CancelKnowledgeIndexUseCase } from '../application/memory/cancel-knowledge-index.use-case.ts';
import { DeleteKnowledgeRootUseCase } from '../application/memory/delete-knowledge-root.use-case.ts';
import { DeletePinUseCase } from '../application/memory/delete-pin.use-case.ts';
import { DeleteSemanticUseCase } from '../application/memory/delete-semantic.use-case.ts';
import { GetKnowledgeIndexStateUseCase } from '../application/memory/get-knowledge-index-state.use-case.ts';
import { GetKnowledgeSettingsUseCase } from '../application/memory/get-knowledge-settings.use-case.ts';
import { GetKnowledgeStatsUseCase } from '../application/memory/get-knowledge-stats.use-case.ts';
import { ListKnowledgeFilesUseCase } from '../application/memory/list-knowledge-files.use-case.ts';
import { ListKnowledgeRootsUseCase } from '../application/memory/list-knowledge-roots.use-case.ts';
import { ListPinsUseCase } from '../application/memory/list-pins.use-case.ts';
import { ListSemanticUseCase } from '../application/memory/list-semantic.use-case.ts';
import { PutKnowledgeSettingsUseCase } from '../application/memory/put-knowledge-settings.use-case.ts';
import { ReindexKnowledgeUseCase } from '../application/memory/reindex-knowledge.use-case.ts';
import { SearchEpisodicUseCase } from '../application/memory/search-episodic.use-case.ts';
import { SearchKnowledgeUseCase } from '../application/memory/search-knowledge.use-case.ts';
import { UpsertKnowledgeRootUseCase } from '../application/memory/upsert-knowledge-root.use-case.ts';
import { UpsertPinUseCase } from '../application/memory/upsert-pin.use-case.ts';
import { UpsertSemanticUseCase } from '../application/memory/upsert-semantic.use-case.ts';
import type { AgentRepository } from '../domain/agent.port.ts';
import type { FilesWatcherInput } from '../domain/files-watcher.port.ts';
import type { LlmModelRepository, LlmProviderRepository } from '../domain/llm-provider.port.ts';
import type { WorkspaceRepository } from '../domain/workspace.port.ts';

export type StudioMemoryPorts = {
  pin: SqlitePinPort;
  semantic: SqliteSemanticPort;
  episodic: SqliteEpisodicPort;
  knowledge: SqliteKnowledgePort;
  knowledgeIndexer: KnowledgeIndexer;
  knowledgeWatch: KnowledgeWatchBridge;
  knowledgeIndexEvents: KnowledgeIndexEventsAdapter;
  embeddings: StudioEmbeddings;
};

export type CreateStudioMemoryDeps = {
  providers: LlmProviderRepository;
  models: LlmModelRepository;
  workspaces: WorkspaceRepository;
  filesWatcher?: FilesWatcherInput;
};

export type WireMemoryHttpDeps = {
  agents: AgentRepository;
  workspaces: WorkspaceRepository;
};

export function createStudioMemory(db: StudioDb, deps: CreateStudioMemoryDeps): StudioMemoryPorts {
  const embeddingsDeps = { providers: deps.providers, models: deps.models };
  const embeddings = new StudioEmbeddings(embeddingsDeps);
  const episodic = new SqliteEpisodicPort(db, {
    backend: 'fts',
    embeddings,
  });
  const resolveWorkspacePath = (workspaceId: string) => deps.workspaces.findById(workspaceId)?.path;
  const indexRepo = new SqliteKnowledgeIndexRepo(db);
  const knowledge = new SqliteKnowledgePort(db, {
    backend: 'fts',
    embeddings,
    embeddingsDeps,
    resolveWorkspacePath,
    indexRepo,
  });
  const listEnabledRoots = (workspaceId: string) =>
    knowledge
      .listRoots(workspaceId)
      .filter((root) => root.enabled)
      .map((root) => root.path);
  const knowledgeIndexEvents = new KnowledgeIndexEventsAdapter();
  const knowledgeIndexer = new KnowledgeIndexer(indexRepo, {
    resolveWorkspacePath,
    listEnabledRoots,
    embeddings,
    embeddingsDeps,
    events: knowledgeIndexEvents,
  });
  knowledge.setIndexer(knowledgeIndexer, indexRepo);
  const knowledgeWatch = new KnowledgeWatchBridge({
    workspaces: deps.workspaces,
    indexRepo,
    indexer: knowledgeIndexer,
    listEnabledRoots,
    filesWatcher: deps.filesWatcher,
  });
  knowledgeWatch.start();
  return {
    pin: new SqlitePinPort(db),
    semantic: new SqliteSemanticPort(db),
    episodic,
    knowledge,
    knowledgeIndexer,
    knowledgeWatch,
    knowledgeIndexEvents,
    embeddings,
  };
}

export function registerMemoryHttp(
  app: Hono,
  memory: StudioMemoryPorts,
  deps: WireMemoryHttpDeps,
): void {
  new MemoryController({
    listPins: new ListPinsUseCase(memory.pin, deps.workspaces, deps.agents),
    upsertPin: new UpsertPinUseCase(memory.pin, deps.workspaces, deps.agents),
    deletePin: new DeletePinUseCase(memory.pin, deps.workspaces, deps.agents),
    listSemantic: new ListSemanticUseCase(memory.semantic, deps.workspaces, deps.agents),
    upsertSemantic: new UpsertSemanticUseCase(memory.semantic, deps.workspaces, deps.agents),
    deleteSemantic: new DeleteSemanticUseCase(memory.semantic, deps.workspaces, deps.agents),
    searchEpisodic: new SearchEpisodicUseCase(memory.episodic, deps.workspaces),
  }).register(app);

  new KnowledgeController({
    listKnowledgeRoots: new ListKnowledgeRootsUseCase(memory.knowledge, deps.workspaces),
    upsertKnowledgeRoot: new UpsertKnowledgeRootUseCase(memory.knowledge, deps.workspaces),
    deleteKnowledgeRoot: new DeleteKnowledgeRootUseCase(memory.knowledge, deps.workspaces),
    getKnowledgeSettings: new GetKnowledgeSettingsUseCase(memory.knowledge, deps.workspaces),
    putKnowledgeSettings: new PutKnowledgeSettingsUseCase(memory.knowledge, deps.workspaces, {
      onWatchChanged: (workspaceId, watchEnabled) => {
        memory.knowledgeWatch.syncWatch(workspaceId, watchEnabled);
      },
    }),
    listKnowledgeFiles: new ListKnowledgeFilesUseCase(memory.knowledge, deps.workspaces),
    getKnowledgeIndexState: new GetKnowledgeIndexStateUseCase(memory.knowledge, deps.workspaces),
    getKnowledgeStats: new GetKnowledgeStatsUseCase(memory.knowledge, deps.workspaces),
    reindexKnowledge: new ReindexKnowledgeUseCase(memory.knowledge, deps.workspaces),
    cancelKnowledgeIndex: new CancelKnowledgeIndexUseCase(memory.knowledge, deps.workspaces),
    searchKnowledge: new SearchKnowledgeUseCase(memory.knowledge, deps.workspaces),
    indexEvents: memory.knowledgeIndexEvents,
    workspaces: deps.workspaces,
  }).register(app);
}
