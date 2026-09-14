/** Одна дозапись «неявное → явное» перед закрытием мира (spec §2). Идемпотентна
 *  по маркеру schema_meta; считает old-effective через resolveAgentIdentity.
 *  Исторично: tools-blank guard был вакуумным на единственном живом прогоне —
 *  read-path toAgent вернули позже (review Minor 8); повторный прогон на
 *  post-flip базе теперь падает ниже по SERVICE_TOOLS-проверке, а не обнуляет. */
import { sql } from 'drizzle-orm';
import { type Node, resolveAgentIdentity, type SkillRegistry } from 'harnesys';
import { logger } from '../../../config/logger.ts';
import type { AgentGraph, AgentRepository } from '../../../domain/agent.port.ts';
import type { WorkspaceRepository } from '../../../domain/workspace.port.ts';
import { runInHostToolScope } from '../../host-tool-scope.ts';
import type { WorkspaceHarnesysRegistry } from '../../workspace-harnesys.registry.ts';
import type { StudioDb } from './connection.ts';

export type ClosedWorldMaterializationDeps = {
  db: StudioDb;
  workspaces: WorkspaceRepository;
  agents: AgentRepository;
  workspaceHarnesys: WorkspaceHarnesysRegistry;
};

const MARKER = 'closed_world_materialization_v1';
const SERVICE_TOOLS = new Set(['load_tools', 'load_skill', 'Skill']);

export async function runClosedWorldMaterialization(
  deps: ClosedWorldMaterializationDeps,
): Promise<void> {
  const db = deps.db;
  db.run(
    sql.raw('CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)'),
  );
  if (
    db.all<{ key: string }>(sql.raw(`SELECT key FROM schema_meta WHERE key = '${MARKER}'`)).length >
    0
  ) {
    return; // второй запуск — no-op
  }
  for (const workspace of deps.workspaces.list()) {
    const hx = await deps.workspaceHarnesys.get(workspace);
    const baseRegistry = new Map(hx.tools.registry());
    const registrations = deps.workspaceHarnesys.effectiveRegistrations(workspace);
    // handle отдаёт только list(); дальше по SkillRegistry никто не идёт:
    // резолвер лишь регистрирует load_skill, execute здесь не вызывается.
    const skillCatalog = hx.skills as SkillRegistry;
    const pluginNames = (await deps.workspaceHarnesys.loadEnabledPlugins(workspace.id)).map(
      (entry) => entry.record.name,
    );
    for (const row of deps.agents.listByWorkspace(workspace.id)) {
      const def = deps.workspaceHarnesys.resolveAgentDefinition(row.id);
      if (def === undefined) {
        logger.warn(
          { scope: 'migration' },
          `closed-world materialization skipped agent ${row.id} (${row.name}): definition unresolved`,
        );
        continue;
      }
      // create() паков тянет host-scope через requireHostToolScope (ALS); ранна
      // во время миграции нет. threadId инертен: тулы не исполняются, ключи
      // memory-спеков не затрагиваются.
      const identity = runInHostToolScope(
        { workspaceId: workspace.id, agentId: row.id, threadId: 'migration' },
        () =>
          resolveAgentIdentity(def, {
            baseRegistry,
            registrations,
            fsSkills: skillCatalog,
            deferredPacks: undefined, // имена от exposure не зависят: материализуем весь реестр
          }),
      );
      const names = [...identity.toolRegistry.keys()];
      // Post-flip база (откат бэкапа, второй хост на ~/.harnesys): def.tools=[] значит
      // «ничего», names = services-only, и blank-guard ниже молча обнулил бы capabilities.
      if (names.every((name) => SERVICE_TOOLS.has(name))) {
        throw new Error(
          'closed-world materialization: resolver returned only service tools — library semantics already flipped; restore the pre-flip backup',
        );
      }
      const mcpServers: string[] = [];
      for (const name of names) {
        const tool = identity.toolRegistry.get(name);
        if ((tool?.operations ?? []).includes('mcp') === false) {
          continue;
        }
        if (tool?.group !== undefined && !mcpServers.includes(tool.group)) {
          mcpServers.push(tool.group);
        }
      }
      const graph = materializeGraphNodes(row.graph, names);
      // Заполняем только пустые поля: непустой сохранённый allowlist — явный выбор,
      // он остаётся как есть.
      deps.agents.update(row.id, {
        ...(row.tools.length === 0
          ? { tools: names.filter((name) => !SERVICE_TOOLS.has(name)) }
          : {}),
        ...(row.skills.length === 0
          ? { skills: await skillNames(skillCatalog, identity.packOutputs) }
          : {}),
        ...(row.mcpServers.length === 0 ? { mcpServers } : {}),
        ...(Object.keys(row.enabledPlugins).length === 0
          ? { enabledPlugins: Object.fromEntries(pluginNames.map((name) => [name, true])) }
          : {}),
        ...(row.budget === null ? { budget: { maxSteps: 50, policy: 'ask' as const } } : {}),
        ...(graph !== undefined ? { graph } : {}),
      });
    }
  }
  db.run(sql.raw(`INSERT INTO schema_meta(key, value) VALUES ('${MARKER}', '1')`));
}

/** Каждый llm:generate без ключа tools получает снимок реестра целиком. */
function materializeGraphNodes(graph: AgentGraph, names: string[]): AgentGraph | undefined {
  let changed = false;
  const nodes: Record<string, Node> = Object.fromEntries(
    Object.entries(graph.nodes).map((entry): [string, Node] => {
      const [id, node] = entry;
      if (node.type === 'llm:generate' && !('tools' in node)) {
        changed = true;
        return [id, { ...node, tools: [...names] }];
      }
      return [id, node];
    }),
  );
  return changed ? { ...graph, nodes } : undefined;
}

/** FS+plugin имена из handle-каталога ∪ pack-скилы собранного identity. */
async function skillNames(
  catalog: SkillRegistry,
  outputs: Map<string, { skills: { name: string }[] }>,
): Promise<string[]> {
  const names = new Set<string>();
  for (const s of await catalog.list()) {
    names.add(s.name);
  }
  for (const out of outputs.values()) {
    for (const s of out.skills) {
      names.add(s.name);
    }
  }
  return [...names];
}
