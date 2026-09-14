/** Идентичность агента: единственная сборка «definition → реестр+паки+диагностики».
 *  Консюмеры: run-engine (эта версия), spawn-дети/handoff/discovery (планы 2-3).
 *  Порядок сборки пока старый (filter до attach); закрытие мира — отдельный шаг. */
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
  const runRegistry = new Map(filterToolsForAgent(ctx.baseRegistry, def));
  runRegistry.set(LOAD_TOOLS_NAME, createLoadToolsTool(runRegistry));
  const { outputs, enabled, diagnostics } = buildPackRun(def, ctx.registrations);
  printPackDiagnostics(diagnostics, ctx.logger);
  attachPackTools(runRegistry, enabled, ctx.deferredPacks, ctx.logger);
  registerPackSkillTool(runRegistry, enabled, def, ctx.fsSkills);
  return { toolRegistry: runRegistry, packOutputs: outputs, diagnostics };
}
