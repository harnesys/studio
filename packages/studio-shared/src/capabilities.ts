import type { AgentRosterEntry, ExplainEntry, ToolExposure } from 'harnesys';

export type AgentCapabilityRegistryEntry = {
  name: string;
  exposure: ToolExposure;
  source: string;
};

/** Инспектор `GET /api/agents/:id/capabilities`: effective set агента
 *  (без режимного сужения) с провенансом каждой записи. */
export type AgentCapabilitiesView = {
  explain: ExplainEntry[];
  registry: AgentCapabilityRegistryEntry[];
  subagents: AgentRosterEntry[];
};
