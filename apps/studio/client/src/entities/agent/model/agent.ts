import type {
  AgentBudget,
  AgentGenerationSettings,
  AgentMemoryConfig,
  CapabilityConfig,
  PortRef,
  ToolOutputSettings,
} from '@studio/shared';

export const AGENT_STATUSES = ['idle', 'running', 'waiting', 'error', 'offline'] as const;

export type AgentStatus = (typeof AGENT_STATUSES)[number];

export type Agent = {
  id: string;
  workspaceId: string;
  name: string;
  modelId: string | null;
  role: string;
  instructions: string;
  effort: string | null;
  generation: AgentGenerationSettings | null;
  toolOutput: ToolOutputSettings | null;
  budget: AgentBudget | null;
  compaction: PortRef;
  memory: AgentMemoryConfig;
  skills: string[];
  mcpServers: string[];
  tools: string[];
  capabilities: Record<string, CapabilityConfig | null>;
  createdAt: string;
  updatedAt: string;
  status: AgentStatus;
  initials: string;
  lastActiveAt: string;
  currentTask: string;
};

export type AgentDraft = {
  name: string;
  role: string;
  instructions: string;
  modelId: string | null;
  effort?: string | null;
  generation?: AgentGenerationSettings | null;
  toolOutput?: ToolOutputSettings | null;
  budget?: AgentBudget | null;
  compaction?: PortRef;
  memory?: AgentMemoryConfig | null;
  capabilities?: Record<string, CapabilityConfig | null>;
};

export type AgentPatch = Partial<
  Pick<
    Agent,
    | 'name'
    | 'role'
    | 'instructions'
    | 'modelId'
    | 'effort'
    | 'generation'
    | 'toolOutput'
    | 'budget'
    | 'compaction'
    | 'memory'
    | 'skills'
    | 'mcpServers'
    | 'tools'
    | 'capabilities'
  >
>;

export type AgentCapabilitiesPatch = {
  skills?: string[];
  mcpServers?: string[];
  tools?: string[];
};

export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return 'AG';
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

export function statusTone(status: AgentStatus): 'idle' | 'live' | 'wait' | 'danger' | 'off' {
  switch (status) {
    case 'running':
      return 'live';
    case 'waiting':
      return 'wait';
    case 'error':
      return 'danger';
    case 'offline':
      return 'off';
    case 'idle':
      return 'idle';
  }
}

export function statusLabel(status: AgentStatus): string {
  switch (status) {
    case 'idle':
      return 'Idle';
    case 'running':
      return 'Running';
    case 'waiting':
      return 'Waiting';
    case 'error':
      return 'Error';
    case 'offline':
      return 'Offline';
  }
}

export function formatContextWindow(value: number): string {
  if (value >= 1_000_000) {
    return `${value / 1_000_000}M`;
  }
  if (value >= 1_000) {
    return `${value / 1_000}k`;
  }
  return String(value);
}

export function agentStarters(agent: Agent): string[] {
  return [
    `What would you do first as ${agent.name}?`,
    'Give me a plan before we touch anything.',
    'Inspect the workspace and list key files.',
  ];
}
