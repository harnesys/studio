import { type AgentMemoryConfig, type AgentProjectPaths, defaultAgentMemory, type PortRef } from '@studio/shared';

export const MEMORY_OFF = 'off' as const;

export const PIN_IMPLS = [MEMORY_OFF, 'kv-pin'] as const;
export type PinImpl = (typeof PIN_IMPLS)[number];

export const SEMANTIC_IMPLS = [MEMORY_OFF, 'record-store'] as const;
export type SemanticImpl = (typeof SEMANTIC_IMPLS)[number];

export const SEARCH_IMPLS = [MEMORY_OFF, 'fts', 'vector'] as const;
export type SearchImpl = (typeof SEARCH_IMPLS)[number];

export const KNOWLEDGE_IMPLS = [MEMORY_OFF, 'on'] as const;
export type KnowledgeImpl = (typeof KNOWLEDGE_IMPLS)[number];

export const SEMANTIC_SCOPES = ['session', 'long'] as const;
export type SemanticScopeOption = (typeof SEMANTIC_SCOPES)[number];

export const SESSION_TTLS = ['thread', '24h'] as const;
export type SessionTtlOption = (typeof SESSION_TTLS)[number];

export type PinDraft = {
  impl: PinImpl;
  budgetTokens: string;
  maxItems: string;
};

export type SemanticDraft = {
  impl: SemanticImpl;
  autoProject: SemanticScopeOption[];
  projectLimit: string;
  projectBudgetTokens: string;
  sessionTtl: SessionTtlOption;
};

export type EpisodicDraft = {
  impl: SearchImpl;
  indexOnCompact: boolean;
  topK: string;
};

export type KnowledgeDraft = {
  impl: KnowledgeImpl;
  topK: string;
};

export type MemoryDraft = {
  pin: PinDraft;
  semantic: SemanticDraft;
  episodic: EpisodicDraft;
  knowledge: KnowledgeDraft;
  projectPaths: string[];
};

export type AgentMemoryProject = PortRef | AgentProjectPaths | null | undefined;

export function memoryDraftFrom(memory: AgentMemoryConfig): MemoryDraft {
  const defaults = defaultAgentMemory();
  return {
    pin: pinDraftFrom(memory.pin ?? null, defaults.pin),
    semantic: semanticDraftFrom(memory.semantic ?? null, defaults.semantic),
    episodic: episodicDraftFrom(memory.episodic ?? null, defaults.episodic),
    knowledge: knowledgeDraftFrom(memory.knowledge ?? null),
    projectPaths: projectPathsFrom(memory.project),
  };
}

export function toAgentMemoryConfig(draft: MemoryDraft): AgentMemoryConfig {
  return {
    pin: toPinRef(draft.pin),
    semantic: toSemanticRef(draft.semantic),
    episodic: toEpisodicRef(draft.episodic),
    knowledge: toKnowledgeRef(draft.knowledge),
    project: draft.projectPaths.length > 0 ? { paths: draft.projectPaths } : null,
  };
}

function pinDraftFrom(ref: PortRef | undefined, fallback: PortRef | undefined): PinDraft {
  const base = fallback?.name === 'kv-pin' ? fallback : { name: 'kv-pin', spec: {} };
  if (ref?.name !== 'kv-pin') {
    return {
      impl: MEMORY_OFF,
      budgetTokens: stringifyNumber(base.spec?.budgetTokens, '1500'),
      maxItems: stringifyNumber(base.spec?.maxItems, '32'),
    };
  }
  return {
    impl: 'kv-pin',
    budgetTokens: stringifyNumber(ref.spec?.budgetTokens, '1500'),
    maxItems: stringifyNumber(ref.spec?.maxItems, '32'),
  };
}

function semanticDraftFrom(ref: PortRef | undefined, fallback: PortRef | undefined): SemanticDraft {
  const base = fallback?.name === 'record-store' ? fallback : { name: 'record-store', spec: {} };
  if (ref?.name !== 'record-store') {
    return {
      impl: MEMORY_OFF,
      autoProject: scopesFrom(base.spec?.autoProject, ['long']),
      projectLimit: stringifyNumber(base.spec?.projectLimit, '20'),
      projectBudgetTokens: stringifyNumber(base.spec?.projectBudgetTokens, '800'),
      sessionTtl: ttlFrom(base.spec?.sessionTtl, 'thread'),
    };
  }
  return {
    impl: 'record-store',
    autoProject: scopesFrom(ref.spec?.autoProject, ['long']),
    projectLimit: stringifyNumber(ref.spec?.projectLimit, '20'),
    projectBudgetTokens: stringifyNumber(ref.spec?.projectBudgetTokens, '800'),
    sessionTtl: ttlFrom(ref.spec?.sessionTtl, 'thread'),
  };
}

function episodicDraftFrom(ref: PortRef | undefined, fallback: PortRef | undefined): EpisodicDraft {
  const base = fallback ?? { name: 'fts', spec: {} };
  if (ref?.name !== 'fts' && ref?.name !== 'vector') {
    return {
      impl: MEMORY_OFF,
      indexOnCompact: base.spec?.indexOnCompact !== false,
      topK: stringifyNumber(base.spec?.topK, '8'),
    };
  }
  return {
    impl: ref.name,
    indexOnCompact: ref.spec?.indexOnCompact !== false,
    topK: stringifyNumber(ref.spec?.topK, '8'),
  };
}

function knowledgeDraftFrom(ref: PortRef | undefined): KnowledgeDraft {
  if (ref?.name !== 'knowledge' && ref?.name !== 'fts' && ref?.name !== 'vector') {
    return { impl: MEMORY_OFF, topK: '5' };
  }
  return {
    impl: 'on',
    topK: stringifyNumber(ref.spec?.topK, '5'),
  };
}

function toPinRef(draft: PinDraft): PortRef {
  if (draft.impl === MEMORY_OFF) {
    return null;
  }
  return {
    name: 'kv-pin',
    spec: {
      budgetTokens: parseIntOr(draft.budgetTokens, 1500),
      maxItems: parseIntOr(draft.maxItems, 32),
    },
  };
}

function toSemanticRef(draft: SemanticDraft): PortRef {
  if (draft.impl === MEMORY_OFF) {
    return null;
  }
  return {
    name: 'record-store',
    spec: {
      autoProject: draft.autoProject,
      projectLimit: parseIntOr(draft.projectLimit, 20),
      projectBudgetTokens: parseIntOr(draft.projectBudgetTokens, 800),
      sessionTtl: draft.sessionTtl,
    },
  };
}

function toEpisodicRef(draft: EpisodicDraft): PortRef {
  if (draft.impl === MEMORY_OFF) {
    return null;
  }
  return {
    name: draft.impl,
    spec: {
      backend: draft.impl,
      indexOnCompact: draft.indexOnCompact,
      topK: parseIntOr(draft.topK, 8),
    },
  };
}

function toKnowledgeRef(draft: KnowledgeDraft): PortRef {
  if (draft.impl === MEMORY_OFF) {
    return null;
  }
  return {
    name: 'knowledge',
    spec: {
      topK: parseIntOr(draft.topK, 5),
    },
  };
}

function projectPathsFrom(project: AgentMemoryProject): string[] {
  if (!project || Array.isArray(project) || typeof project !== 'object') {
    return [];
  }
  if ('paths' in project && isAgentProjectPaths(project)) {
    return project.paths.filter((path) => path.trim().length > 0);
  }
  return [];
}

function isAgentProjectPaths(value: object): value is AgentProjectPaths {
  return 'paths' in value && Array.isArray((value as AgentProjectPaths).paths);
}

function scopesFrom(value: unknown, fallback: SemanticScopeOption[]): SemanticScopeOption[] {
  if (!Array.isArray(value)) {
    return fallback;
  }
  return value.filter((item): item is SemanticScopeOption =>
    SEMANTIC_SCOPES.includes(item as SemanticScopeOption),
  );
}

function ttlFrom(value: unknown, fallback: SessionTtlOption): SessionTtlOption {
  return SESSION_TTLS.includes(value as SessionTtlOption) ? (value as SessionTtlOption) : fallback;
}

function stringifyNumber(value: unknown, fallback: string): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : fallback;
}

function parseIntOr(value: string, fallback: number): number {
  const next = Number(value.trim());
  return Number.isFinite(next) ? Math.floor(next) : fallback;
}
