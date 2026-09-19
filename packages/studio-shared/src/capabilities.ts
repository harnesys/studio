import type { AgentRosterEntry, ExplainEntry, ToolExposure } from 'harnesys';
export type AgentCapabilityRegistryEntry = {
  name: string;
  exposure: ToolExposure;
  source: string;
};
export type AgentCapabilitiesView = {
  explain: ExplainEntry[];
  registry: AgentCapabilityRegistryEntry[];
  subagents: AgentRosterEntry[];
};
