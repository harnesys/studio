export { entityColorClass as agentColorClass } from '@/shared/lib/entity-colors';
export { findModelLabel } from '@/shared/lib/model-label';
export {
  AGENT_STATUSES,
  type Agent,
  type AgentCapabilitiesPatch,
  type AgentDraft,
  type AgentPatch,
  type AgentStatus,
  agentStarters,
  formatContextWindow,
  initialsFromName,
  statusLabel,
  statusTone,
} from './model/agent';
export { useAgentStore } from './model/agent.store';
export { agentColorTintClass } from './model/agent-colors';
export { toClientAgent } from './model/agent-record';
