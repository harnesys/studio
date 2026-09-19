import {
  type EmbeddingModelRef,
  type EmbeddingsPort,
  StudioEmbeddings,
  type StudioEmbeddingsDeps,
} from './embeddings.ts';
import type { KnowledgeSettingsRecord } from './knowledge-index-types.ts';

const UNAVAILABLE_EMBEDDINGS: EmbeddingsPort = {
  available: () => false,
  embed: () =>
    Promise.reject(new Error('knowledge vector backend needs embedProvider and embedModel')),
};

export function modelRefFromSettings(
  settings: KnowledgeSettingsRecord,
): EmbeddingModelRef | undefined {
  if (!settings.embedProvider || !settings.embedModel) {
    return undefined;
  }
  return { provider: settings.embedProvider, model: settings.embedModel };
}

/** Fingerprint for index skip keys; changes when backend/embed model change. */
export function knowledgeIndexModeKey(settings: KnowledgeSettingsRecord): string {
  if (settings.backend !== 'vector') {
    return 'fts';
  }
  const provider = settings.embedProvider?.trim() ?? '';
  const model = settings.embedModel?.trim() ?? '';
  return `vector:${provider}/${model}`;
}

/** Knowledge embeddings: explicit embed model only; no catalog fallback. */
export function embeddingsForSettings(
  deps: StudioEmbeddingsDeps,
  settings: KnowledgeSettingsRecord,
  workspaceId: string,
): EmbeddingsPort {
  const modelRef = modelRefFromSettings(settings);
  if (!modelRef) {
    return UNAVAILABLE_EMBEDDINGS;
  }
  return new StudioEmbeddings({
    ...deps,
    modelRef,
    workspaceId,
  });
}
