/**
 * TEMPORARY compile shim for apps/studio until packages/harnesys ≥0.3.
 *
 * Purpose: typecheck / link only. Chat and runtime are no-ops.
 *
 * NOT a reference for packages/harnesys:
 * - do not copy names, types, API shape, or Harnyx-era patterns from here
 * - library SoT is docs/01–docs/22 (and ROADMAP freeze rules)
 *
 * Studio must be rewritten to native Harnesys docs types (SessionEvent,
 * RuntimeState, AgentRun, …), then delete or replace this package.
 */

export const DRIVERS = [
  'openai',
  'openai-compatible',
  'anthropic',
  'openrouter',
  'google',
  'groq',
  'mistral',
  'xai',
  'together',
  'kimi',
  'zai',
  'ollama',
  'ollama-cloud',
  'nvidia',
  'cerebras',
  'minimax',
  'xiaomi',
  'qwen',
] as const;

export type Driver = (typeof DRIVERS)[number];
export type DriverEndpoint = { id: string; label: string; apiUrl: string; group?: string };
export type CatalogDriver = { id: Driver; defaultUrl: string; endpoints: DriverEndpoint[] };
export type StudioCatalog = { drivers: CatalogDriver[] };

export const EFFORTS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;
export type Effort = (typeof EFFORTS)[number];
export const MODALITIES = ['text', 'audio', 'image', 'video', 'file'] as const;
export type Modality = (typeof MODALITIES)[number];
export const MODEL_FEATURES = ['tools', 'structured', 'streaming', 'reasoning', 'cache'] as const;
export type ModelFeature = (typeof MODEL_FEATURES)[number];
export const INCOMPLETE_FIELDS = ['context_length', 'pricing'] as const;
export type IncompleteField = (typeof INCOMPLETE_FIELDS)[number];

export function isDriver(value: string): value is Driver {
  return (DRIVERS as readonly string[]).includes(value);
}
export function isEffort(value: string): value is Effort {
  return (EFFORTS as readonly string[]).includes(value);
}

export function driverDefaultUrl(_id: string): string {
  return '';
}
export function driverEndpoints(_id: string): DriverEndpoint[] {
  return [];
}

// Loose types: enough for Studio to typecheck against the stub.
export type ModelRecord = any;
export type ModelFields = any;
export type ModelArchitecture = any;
export type ModelPricing = any;
export type ModelTopProvider = any;
export type ModelOrigin = any;
export type ModelKind = any;
export type ModelHints = any;
export type ModelBinding = any;
export type ModelsPort = any;
export type DiscoveredModel = any;
export type DiscoveredModelView = any;
export type StudioModel = any;
export type StudioModelView = any;
export type ProviderPublic = any;
export type ProviderModelPublic = any;

export type PortRef = any;
export type AgentProjectPaths = { paths: string[]; [k: string]: any };
export type AgentGenerationSettings = any;
export type ToolOutputSettings = any;
export type AgentMemoryConfig = any;
export type AgentSpec = any;
export type ToolPermission = any;
export type ToolDefinition = any;
export type ToolCatalogEntry = any;
export type McpTransport = any;
export type McpServerConfig = any;
export type McpResourceInfo = any;

export type SendFile = any;
export type SendInput = any;
export type AnswerInput = any;
export type ConfirmDecision = any;
export type HitlBatchSnapshot = any;
export type RunConfigSnapshot = any;

export type JournalAttachmentKind = any;
export type JournalAttachment = any;
export type TokenUsage = any;
export type GenerationUsage = any;
export type AgentStepStatus = any;
export type AgentStep = {
  id: string;
  type: string;
  status: string;
  seq: number;
  createdAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
  payload?: any;
  [k: string]: any;
};
export type AgentEntryMeta = any;
export type AgentEntryError = any;
export type AgentRunStatus = any;
export type AgentEntry = {
  id: string;
  type?: string;
  status?: any;
  steps?: AgentStep[];
  [k: string]: any;
};
export type HumanEntry = {
  id: string;
  type?: string;
  text?: string;
  attachments?: any[];
  [k: string]: any;
};
export type SystemEntryPayload = any;
export type SystemEntry = { id: string; type?: string; payload?: any; [k: string]: any };
export type CompactionPayloadStats = any;
export type CompactionPayload = any;
export type CompactionEntry = { id: string; type?: string; payload?: any; [k: string]: any };
export type JournalEntry = AgentEntry | HumanEntry | SystemEntry | CompactionEntry | { id: string; type?: string; [k: string]: any };
export type JournalBranch = any;
/** Shape needed so `.entries.filter((entry) => …)` gets contextual `any`. */
export type Journal = {
  entries: any[];
  branch?: any;
  status?: any;
  [k: string]: any;
};
export type StreamEvent = any;
export type CompactedRange = any;
export type CompactedRangeNotify = any;

export type MemoryScopeId = any;
export type PinSource = any;
export type PinRecord = any;
export type PinUpsertInput = any;
export type PinPort = any;
export type SemanticScope = any;
export type MemoryRecordSource = any;
export type MemoryRecord = any;
export type SemanticListQuery = any;
export type SemanticUpsertInput = any;
export type SemanticProjectInput = any;
export type SemanticSessionTtl = any;
export type SemanticMemoryPort = any;
export type EpisodicHit = any;
export type EpisodicIndexInput = any;
export type EpisodicSearchInput = any;
export type EpisodicPort = any;
export type KnowledgeHit = any;
export type KnowledgeSearchInput = any;
export type KnowledgeReadInput = any;
export type KnowledgeReadResult = any;
export type KnowledgeReindexInput = any;
export type KnowledgePort = any;

export type AgentRun = any;
export type ThreadHandle = any;
export type AgentHandle = any;

export type HarnesysRuntime = {
  agent: (name: string, spec?: AgentSpec) => AgentHandle | Promise<AgentHandle>;
  close: () => Promise<void>;
  listSkills: () => any[];
  mcpSnapshot: () => {
    servers: Array<{ serverId: string; tools: any[]; [k: string]: any }>;
  };
  toolCatalog: () => any[];
  session: (...args: any[]) => any;
  run: (...args: any[]) => any;
  start: (...args: any[]) => any;
  resume: (...args: any[]) => any;
};

/** @deprecated temporary alias */
export type Harnyx = HarnesysRuntime;

export class ThreadBusyError extends Error {
  constructor(message = 'thread busy') {
    super(message);
    this.name = 'ThreadBusyError';
  }
}
export class PendingHitlError extends Error {
  constructor(message = 'pending hitl') {
    super(message);
    this.name = 'PendingHitlError';
  }
}
export class StaleAgentError extends Error {
  constructor(message = 'stale agent') {
    super(message);
    this.name = 'StaleAgentError';
  }
}
export class ModelLookupError extends Error {
  constructor(message = 'model lookup failed') {
    super(message);
    this.name = 'ModelLookupError';
  }
}
export class AgentLoadError extends Error {
  constructor(message = 'agent load failed') {
    super(message);
    this.name = 'AgentLoadError';
  }
}
export class NothingToResumeError extends Error {
  constructor(message = 'nothing to resume') {
    super(message);
    this.name = 'NothingToResumeError';
  }
}
export class RunNotActiveError extends Error {
  constructor(message = 'run not active') {
    super(message);
    this.name = 'RunNotActiveError';
  }
}

export const THRESHOLD_SUMMARY_NAME = 'threshold-summary';
export const DEFAULT_TOOL_OUTPUT_MAX_CHARS = 12_000;
export const DEFAULT_TOOL_OUTPUT_HEAD_CHARS = 4_000;
export const DEFAULT_TOOL_OUTPUT_TAIL_CHARS = 4_000;

export function withChatGenerationParameters(params: string[] | undefined | null): string[] {
  return params ? [...params] : [];
}
export function filterGenerationSettings<T>(settings: T, _supported?: unknown): T {
  return settings;
}
export function resolveModel(record: ModelRecord): ModelRecord {
  return record;
}
export function missingModelFields(_record?: unknown): any {
  return [];
}
export function modelEfforts(_record?: unknown): any {
  return [];
}
export async function discoverModels(_opts: unknown): Promise<DiscoveredModel[]> {
  return [];
}
export function defaultAgentMemory(): AgentMemoryConfig {
  return {};
}
type StubToolDef = {
  name?: string;
  description?: string;
  parameters?: unknown;
  execute?: (raw: any, ctx?: any) => any;
  [k: string]: unknown;
};

export function tool(def: StubToolDef): any;
export function tool(name: string, def: StubToolDef): any;
export function tool(...args: any[]): any {
  if (args.length >= 2) {
    return { name: args[0], ...(args[1] ?? {}) };
  }
  return args[0];
}
export function files(_opts?: unknown): ToolDefinition[] {
  return [];
}
export function shell(_opts?: unknown): ToolDefinition[] {
  return [];
}
export function fetch(_opts?: unknown): ToolDefinition[] {
  return [];
}
export function askUser(_opts?: unknown): ToolDefinition[] {
  return [];
}

export function isHumanEntry(entry: JournalEntry): boolean {
  return entry?.type === 'human';
}
export function isAgentEntry(entry: JournalEntry): boolean {
  return entry?.type === 'agent';
}
export function isSystemEntry(entry: JournalEntry): boolean {
  return entry?.type === 'system';
}
export function isCompactionEntry(entry: JournalEntry): boolean {
  return entry?.type === 'compaction';
}
export function isBuiltinStep(step: AgentStep): boolean {
  return typeof step?.type === 'string';
}
export function isTextAttachment(attOrMedia: any, name?: any): boolean {
  if (typeof name === 'string' || name === undefined && typeof attOrMedia === 'string') {
    return true;
  }
  return Boolean(attOrMedia);
}
export function lastAgentEntry(journal: Journal): AgentEntry | undefined {
  const entries = journal?.entries ?? [];
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const entry = entries[i];
    if (isAgentEntry(entry)) return entry;
  }
  return undefined;
}
export function appendSystem(journal: Journal, payload: SystemEntryPayload): void {
  if (!journal.entries) journal.entries = [];
  journal.entries.push({ id: `stub-system-${journal.entries.length}`, type: 'system', payload });
}
export function reconcileStaleRunning(journal: Journal): void {
  if (journal?.status === 'running') journal.status = 'needs_input';
}

function emptyJournal(): Journal {
  return { entries: [], status: 'idle' };
}
function stubRun(id = `stub-run-${Date.now()}`): AgentRun {
  return {
    id,
    status: 'completed',
    async *stream() {
      yield { type: 'done' };
    },
    output: Promise.resolve({ text: '' }),
    respond: async () => undefined,
    reject: async () => undefined,
    answer: async () => undefined,
    confirm: async () => undefined,
    cancel: () => undefined,
  };
}
function stubThread(opts: Record<string, unknown>): ThreadHandle {
  const journal = (opts.journal as Journal | undefined) ?? emptyJournal();
  return {
    journal,
    send: () => stubRun(),
    resume: () => stubRun(),
    compact: async () => undefined,
  };
}
function stubAgent(): AgentHandle {
  return { thread: (opts: Record<string, unknown>) => stubThread(opts) };
}

export async function createRuntime(_opts?: unknown): Promise<HarnesysRuntime> {
  return {
    agent: async () => stubAgent(),
    close: async () => undefined,
    listSkills: () => [],
    mcpSnapshot: () => ({ servers: [] }),
    toolCatalog: () => [],
    session: () => ({ send: () => stubRun(), resume: () => stubRun() }),
    run: async () => ({ status: 'completed' }),
    start: async function* () {
      yield { type: 'done' };
    },
    resume: async () => ({ status: 'completed' }),
  };
}

/** @deprecated use createRuntime */
export const createHarnyx = createRuntime;
