/** Идентичность агента: единственная сборка «definition → реестр+паки+диагностики».
 *  Консюмеры: run-engine (эта версия), spawn-дети/handoff/discovery (планы 2-3).
 *  Порядок closed-world: attach → filter → services; служебные тулы поверх фильтра. */
import type { AgentDefinition } from '../domain/agent-definition.ts';
import type { PackRegistration } from '../domain/pack.ts';
import type { Logger } from '../ports/logger.ts';
import type { SkillRegistry } from '../ports/skills.ts';
import type { ToolDefinition } from '../ports/tools.ts';
import type { PackRunMap } from './packs/pack-run.ts';
import {
  attachPackTools,
  buildPackRun,
  printPackDiagnostics,
  registerPackSkillTool,
} from './packs/pack-run.ts';
import type { PackDiagnostic } from './packs/registry.ts';
import { resolveToolAlias } from './tool-aliases.ts';
import { filterToolsForAgent } from './tool-registry.ts';
import { createLoadToolsTool } from './tools/create-load-tools-tool.ts';
import { LOAD_TOOLS_NAME } from './tools/exposure.ts';

export type AgentIdentity = {
  toolRegistry: Map<string, ToolDefinition>;
  packOutputs: PackRunMap;
  diagnostics: PackDiagnostic[];
};

export type ResolveAgentIdentityCtx = {
  baseRegistry: Map<string, ToolDefinition>;
  registrations: PackRegistration[];
  fsSkills?: SkillRegistry;
  deferredPacks?: readonly string[];
  logger?: Logger;
};

export function resolveAgentIdentity(
  def: AgentDefinition,
  ctx: ResolveAgentIdentityCtx,
): AgentIdentity {
  const merged = new Map(ctx.baseRegistry);
  const { outputs, enabled, diagnostics } = buildPackRun(def, ctx.registrations);
  attachPackTools(merged, enabled, ctx.deferredPacks, ctx.logger);
  const filtered = filterToolsForAgent(merged, def);
  for (const name of def.tools ?? []) {
    if (!merged.has(resolveToolAlias(name))) {
      diagnostics.push({
        severity: 'warning',
        code: 'tool_unreachable',
        message: `tool "${name}" is not provided by any enabled pack/server`,
      });
    }
  }
  printPackDiagnostics(diagnostics, ctx.logger);
  const runRegistry = new Map(filtered);
  registerPackSkillTool(runRegistry, enabled, def, ctx.fsSkills);
  runRegistry.set(LOAD_TOOLS_NAME, createLoadToolsTool(runRegistry));
  return { toolRegistry: runRegistry, packOutputs: outputs, diagnostics };
}
