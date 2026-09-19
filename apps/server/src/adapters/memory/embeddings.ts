import { isDriver } from 'harnesys';
import { EMBEDDING_ERROR_PREVIEW_CHARS, OLLAMA_EMBED_KEEP_ALIVE } from '../../config/constants.ts';
import type {
  LlmModel,
  LlmModelRepository,
  LlmProviderRepository,
} from '../../domain/llm-provider.port.ts';
import { ValidationError } from '../../domain/studio.error.ts';

export type EmbeddingModelRef = {
  provider: string;
  model: string;
};

export type EmbeddingsPort = {
  available(): boolean;
  embed(texts: string[], options?: { signal?: AbortSignal }): Promise<number[][]>;
};

export type StudioEmbeddingsDeps = {
  providers: LlmProviderRepository;
  models: LlmModelRepository;
  /** Prefer this embed model; else first enabled embed model in catalog. */
  modelRef?: EmbeddingModelRef;
  workspaceId?: string;
};

type ResolvedEmbedTarget = {
  apiUrl: string;
  apiKey: string | undefined;
  headers: Record<string, string>;
  modelName: string;
};

export class StudioEmbeddings implements EmbeddingsPort {
  private modelRef: EmbeddingModelRef | undefined;

  constructor(private readonly deps: StudioEmbeddingsDeps) {
    this.modelRef = deps.modelRef;
  }

  setModelRef(modelRef: EmbeddingModelRef | undefined): void {
    this.modelRef = modelRef;
  }

  available(): boolean {
    return resolveEmbedTarget({ ...this.deps, modelRef: this.modelRef }) !== undefined;
  }

  async embed(texts: string[], options?: { signal?: AbortSignal }): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }
    const target = resolveEmbedTarget({ ...this.deps, modelRef: this.modelRef });
    if (!target) {
      throw new ValidationError(
        'vector memory requires an embeddings model; add a model with kind "embed" or set embedding model ref',
      );
    }
    const url = `${trimTrailingSlash(target.apiUrl)}/embeddings`;
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      ...target.headers,
    };
    if (target.apiKey) {
      headers.authorization = `Bearer ${target.apiKey}`;
    }
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: target.modelName,
        input: texts,
        keep_alive: OLLAMA_EMBED_KEEP_ALIVE,
      }),
      signal: options?.signal,
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new ValidationError(
        `embeddings request failed (${response.status}): ${detail.slice(0, EMBEDDING_ERROR_PREVIEW_CHARS) || response.statusText}`,
      );
    }
    const body = (await response.json()) as {
      data?: Array<{ embedding?: number[]; index?: number }>;
    };
    const rows = body.data ?? [];
    if (rows.length !== texts.length) {
      throw new ValidationError('embeddings response length mismatch');
    }
    const ordered = [...rows].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    return ordered.map((row, i) => {
      if (!Array.isArray(row.embedding) || row.embedding.length === 0) {
        throw new ValidationError(`missing embedding for input ${i}`);
      }
      return row.embedding;
    });
  }
}

function resolveEmbedTarget(deps: StudioEmbeddingsDeps): ResolvedEmbedTarget | undefined {
  if (deps.modelRef) {
    return targetFromRef(deps, deps.modelRef);
  }
  const workspaceId = deps.workspaceId;
  if (!workspaceId) {
    return undefined;
  }
  for (const provider of deps.providers.list(workspaceId)) {
    if (!provider.enabled || !isDriver(provider.driver)) {
      continue;
    }
    const embedModel = deps.models.listByProvider(provider.id).find((m) => m.kind === 'embed');
    if (!embedModel) {
      continue;
    }
    return toTarget({
      driver: provider.driver,
      apiUrl: provider.apiUrl,
      apiKey: provider.apiKey,
      headers: provider.headers,
      model: embedModel,
    });
  }
  return undefined;
}

function targetFromRef(
  deps: StudioEmbeddingsDeps,
  ref: EmbeddingModelRef,
): ResolvedEmbedTarget | undefined {
  const workspaceId = deps.workspaceId;
  if (!workspaceId) {
    return undefined;
  }
  const provider = deps.providers.findByName(workspaceId, ref.provider);
  if (!provider?.enabled || !isDriver(provider.driver)) {
    return undefined;
  }
  const model = deps.models.findByProviderAndName(provider.id, ref.model);
  if (model?.kind !== 'embed') {
    return undefined;
  }
  return toTarget({
    driver: provider.driver,
    apiUrl: provider.apiUrl,
    apiKey: provider.apiKey,
    headers: provider.headers,
    model,
  });
}

type ToTargetInput = {
  driver: string;
  apiUrl: string | null;
  apiKey: string | null;
  headers: Record<string, string>;
  model: LlmModel;
};

function toTarget(input: ToTargetInput): ResolvedEmbedTarget {
  const base = input.apiUrl ?? 'https://api.openai.com/v1';
  return {
    apiUrl: normalizeEmbedBase(input.driver, base),
    apiKey: input.apiKey ?? undefined,
    headers: input.headers,
    modelName: input.model.name,
  };
}

function normalizeEmbedBase(driver: string, apiUrl: string): string {
  const trimmed = trimTrailingSlash(apiUrl);
  if (driver === 'ollama' && !trimmed.endsWith('/v1')) {
    return `${trimmed}/v1`;
  }
  return trimmed;
}

function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}
