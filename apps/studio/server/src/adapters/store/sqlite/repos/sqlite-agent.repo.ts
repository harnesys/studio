import {
  type AgentMode,
  defaultAgentCompaction,
  isModeId,
  type PackConfig,
  type PortRef,
} from '@harnesys/studio-shared';
import { and, eq } from 'drizzle-orm';
import { type HooksBinding, normalizePackAssignment, type PackAssignment } from 'harnesys';
import type {
  Agent,
  AgentInsert,
  AgentPatch,
  AgentRepository,
} from '../../../../domain/agent.port.ts';
import { NotFoundError } from '../../../../domain/studio.error.ts';
import type { StudioDb } from '../connection.ts';
import { mapSqliteError } from '../errors.ts';
import { type AgentRow, agentsTable } from '../schema';
import { parseGraph } from './agent-graph-json.ts';

export class SqliteAgentRepo implements AgentRepository {
  constructor(private readonly db: StudioDb) {}

  listAll(): Agent[] {
    return this.db.select().from(agentsTable).all().map(toAgent);
  }

  listByWorkspace(workspaceId: string): Agent[] {
    return this.db
      .select()
      .from(agentsTable)
      .where(eq(agentsTable.workspaceId, workspaceId))
      .all()
      .map(toAgent);
  }

  findById(id: string): Agent | undefined {
    const row = this.db.select().from(agentsTable).where(eq(agentsTable.id, id)).get();
    return row ? toAgent(row) : undefined;
  }

  findByName(workspaceId: string, name: string): Agent | undefined {
    const row = this.db
      .select()
      .from(agentsTable)
      .where(and(eq(agentsTable.workspaceId, workspaceId), eq(agentsTable.name, name)))
      .get();
    return row ? toAgent(row) : undefined;
  }

  insert(rec: AgentInsert): Agent {
    try {
      const {
        skills,
        mcpServers,
        modes,
        tools: _tools,
        generation,
        toolOutput,
        compaction,
        graph,
        budget,
        capabilities,
        hooks,
        enabledPlugins,
        ...rest
      } = rec;
      // `tools` stays on the record type for Task 8 consumers but
      // is no longer persisted; the columns keep their stored data on disk.
      const row = this.db
        .insert(agentsTable)
        .values({
          ...rest,
          skills: JSON.stringify(skills),
          mcpServers: JSON.stringify(mcpServers),
          generation: serializeJson(generation),
          toolOutput: serializeJson(toolOutput),
          compactionJson: serializeJsonColumn(compaction),
          graphJson: JSON.stringify(graph),
          budgetJson: serializeJsonColumn(budget),
          capabilitiesJson: JSON.stringify(capabilities),
          hooksJson: JSON.stringify(hooks),
          enabledPluginsJson: JSON.stringify(enabledPlugins),
          modesJson: serializeJson(modes) ?? '[]',
        })
        .returning()
        .get();
      return toAgent(row);
    } catch (err) {
      return mapSqliteError(err, { conflict: 'agent name taken in workspace' });
    }
  }

  update(id: string, patch: AgentPatch): Agent {
    try {
      const {
        skills,
        mcpServers,
        modes,
        tools: _tools,
        generation,
        toolOutput,
        compaction,
        graph,
        budget,
        capabilities,
        hooks,
        enabledPlugins,
        ...rest
      } = patch;
      const row = this.db
        .update(agentsTable)
        .set({
          ...rest,
          ...(skills !== undefined ? { skills: JSON.stringify(skills) } : {}),
          ...(mcpServers !== undefined ? { mcpServers: JSON.stringify(mcpServers) } : {}),
          ...(generation !== undefined ? { generation: serializeJson(generation) } : {}),
          ...(toolOutput !== undefined ? { toolOutput: serializeJson(toolOutput) } : {}),
          ...(compaction !== undefined ? { compactionJson: serializeJsonColumn(compaction) } : {}),
          ...(graph !== undefined ? { graphJson: JSON.stringify(graph) } : {}),
          ...(budget !== undefined ? { budgetJson: serializeJsonColumn(budget) } : {}),
          ...(capabilities !== undefined ? { capabilitiesJson: JSON.stringify(capabilities) } : {}),
          ...(hooks !== undefined ? { hooksJson: JSON.stringify(hooks) } : {}),
          ...(enabledPlugins !== undefined
            ? { enabledPluginsJson: JSON.stringify(enabledPlugins) }
            : {}),
          ...(modes !== undefined ? { modesJson: serializeJson(modes) ?? '[]' } : {}),
        })
        .where(eq(agentsTable.id, id))
        .returning()
        .get();
      if (!row) {
        throw new NotFoundError('agent not found');
      }
      return toAgent(row);
    } catch (err) {
      return mapSqliteError(err, { conflict: 'agent name taken in workspace' });
    }
  }

  delete(id: string): void {
    this.db.delete(agentsTable).where(eq(agentsTable.id, id)).run();
  }

  deleteByWorkspace(workspaceId: string): void {
    this.db.delete(agentsTable).where(eq(agentsTable.workspaceId, workspaceId)).run();
  }
}

function toAgent(row: AgentRow): Agent {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    parentId: row.parentId ?? null,
    name: row.name,
    modelId: row.modelId,
    role: row.role,
    instructions: row.instructions,
    effort: row.effort,
    generation: parseJsonObject(row.generation),
    toolOutput: parseJsonObject(row.toolOutput),
    compaction: coalesceCompaction(parseJsonColumn<PortRef>(row.compactionJson)),
    // `tools` no longer read from column (Task 8 removes the consumers); empty tools means all workspace tools.
    skills: parseStringList(row.skills),
    mcpServers: parseStringList(row.mcpServers),
    tools: [],
    graph: parseGraph(row.graphJson),
    budget: parseJsonObject(row.budgetJson),
    capabilities: parsePacks(row.capabilitiesJson),
    hooks: parseHooks(row.hooksJson),
    enabledPlugins: parseEnabledPlugins(row.enabledPluginsJson),
    defaultModeId: row.defaultModeId ?? null,
    modes: parseAgentModes(row.modesJson),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function coalesceCompaction(value: PortRef | undefined): PortRef {
  if (value === undefined) {
    return defaultAgentCompaction();
  }
  return value;
}

/**
 * Stored pack assignments use the `capabilities_json` column. `true`
 * normalizes to `{}`; objects pass through; `false`, `null`, and
 * `undefined` drop the key.
 */
function parsePacks(raw: string | null): Record<string, PackConfig | null> {
  const parsed = parseJsonObject<Record<string, PackConfig | boolean | null>>(raw) ?? {};
  const out: Record<string, PackConfig | null> = {};
  for (const [name, value] of Object.entries(parsed)) {
    if (value === undefined || value === null || value === false) {
      continue;
    }
    out[name] = normalizePackAssignment(value as PackAssignment);
  }
  return out;
}

function serializeJson(value: object | null | undefined): string | null {
  if (value == null) {
    return null;
  }
  return JSON.stringify(value);
}

/** Shape-guard for stored hook bindings: keep entries with an event name and a handler object. */
function parseHooks(raw: string | null): HooksBinding[] {
  if (!raw) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    const out: HooksBinding[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        continue;
      }
      const candidate = item as HooksBinding;
      if (
        typeof candidate.event !== 'string' ||
        !candidate.handler ||
        typeof candidate.handler !== 'object' ||
        typeof candidate.handler.type !== 'string'
      ) {
        continue;
      }
      out.push(candidate);
    }
    return out;
  } catch {
    return [];
  }
}

/** Boolean-valued entries only; anything else in the column drops. */
function parseEnabledPlugins(raw: string | null): Record<string, boolean> {
  const parsed = parseJsonObject<Record<string, unknown>>(raw) ?? {};
  const out: Record<string, boolean> = {};
  for (const [name, value] of Object.entries(parsed)) {
    if (typeof value === 'boolean') {
      out[name] = value;
    }
  }
  return out;
}

/** Persists JSON including literal `null` (explicit off). */
function serializeJsonColumn(value: unknown): string | null {
  if (value === undefined) {
    return null;
  }
  return JSON.stringify(value);
}

function parseJsonColumn<T>(raw: string | null): T | null | undefined {
  if (raw == null) {
    return undefined;
  }
  try {
    return JSON.parse(raw) as T | null;
  } catch {
    return undefined;
  }
}

function parseJsonObject<T extends object>(raw: string | null): T | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    return parsed as T;
  } catch {
    return null;
  }
}

function parseStringList(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((item): item is string => typeof item === 'string');
  } catch {
    return [];
  }
}

function parseAgentModes(raw: string): AgentMode[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    const modes: AgentMode[] = [];
    const seen = new Set<string>();
    for (const item of parsed) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        continue;
      }
      const candidate = item as AgentMode;
      if (
        typeof candidate.id !== 'string' ||
        typeof candidate.name !== 'string' ||
        candidate.name === ''
      ) {
        continue;
      }
      // 'ask' is a legal builtin copy on the agent (Decision 3); only duplicates drop.
      if (!isModeId(candidate.id) || seen.has(candidate.id)) {
        continue;
      }
      seen.add(candidate.id);
      modes.push(candidate);
    }
    return modes;
  } catch {
    return [];
  }
}
