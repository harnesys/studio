import { readFileSync } from 'node:fs';
import matter from 'gray-matter';
import type { AgentDefinition, AgentGraph, AgentModelRef } from '../../domain/agent-definition.ts';
import type { AgentPacks } from '../../domain/pack.ts';
import type { PluginDiagnostic } from '../../domain/plugin-diagnostics.ts';
import type { AgentSpec, PluginIr } from '../../domain/plugin-ir.ts';
import { CC_TOOL_ALIASES, PLANNED_CC_TOOLS } from '../tool-aliases.ts';
import type { UserConfigContentOptions } from './user-config.ts';
import { substituteUserConfigContent } from './user-config.ts';
export type CatalogAgentEntry = {
  id: string;
  description?: string;
  definition: AgentDefinition;
  disallowedTools?: string[];
  color?: string;
};
export type ResolveAgentModel = (ref: string) => AgentModelRef | null;
export type AgentBindContext = {
  resolveModel: ResolveAgentModel;
  onDiagnostic: BindDiagnosticSink | undefined;
  userConfig: UserConfigContentOptions | undefined;
  packIndex: Map<string, string> | undefined;
};
export type BindDiagnosticSink = (diagnostic: PluginDiagnostic) => void;
export function bindAgentComponents(
  ir: PluginIr,
  resolveModel: ResolveAgentModel,
  onDiagnostic?: BindDiagnosticSink,
  userConfig?: UserConfigContentOptions,
  packIndex?: Map<string, string>,
): CatalogAgentEntry[] {
  const entries: CatalogAgentEntry[] = [];
  const bind: AgentBindContext = { resolveModel, onDiagnostic, userConfig, packIndex };
  for (const component of ir.components) {
    if (component.kind !== 'agent' || component.status !== 'native') {
      continue;
    }
    const spec = component.spec as AgentSpec;
    const entry = buildEntry(spec, component.source.file, bind);
    if (entry !== undefined) {
      entries.push(entry);
    }
  }
  return entries;
}
function buildEntry(
  spec: AgentSpec,
  sourceFile: string,
  bind: AgentBindContext,
): CatalogAgentEntry | undefined {
  warnUnsupportedField(spec, sourceFile, bind.onDiagnostic);
  const model = resolveSpecModel(spec, sourceFile, bind);
  const instructions = readAgentBody(spec, sourceFile, bind);
  if (instructions === null) {
    return undefined;
  }
  const mappedTools = mapSpecTools(spec, sourceFile, bind);
  const definition: AgentDefinition = {
    id: spec.id,
    prompts: { main: { instructions } },
    graph: standardAgentGraph(mappedTools),
  };
  if (model !== undefined) {
    definition.model = model;
  }
  const disallowed = mapSpecDisallowedTools(spec);
  if (disallowed.length > 0) {
    definition.disallowedTools = disallowed;
  }
  const packs = packsForTools(mappedTools, bind.packIndex);
  if (packs !== undefined) {
    definition.packs = packs;
  }
  if (spec.skills !== undefined) {
    definition.skills = spec.skills;
  }
  if (spec.maxTurns !== undefined) {
    definition.budget = { maxSteps: spec.maxTurns };
  }
  return {
    id: spec.id,
    definition,
    ...(spec.description !== undefined
      ? {
          description: bind.userConfig
            ? substituteUserConfigContent(spec.description, bind.userConfig)
            : spec.description,
        }
      : {}),
    ...(spec.disallowedTools !== undefined ? { disallowedTools: spec.disallowedTools } : {}),
    ...(spec.color !== undefined ? { color: spec.color } : {}),
  };
}
function mapSpecTools(spec: AgentSpec, sourceFile: string, bind: AgentBindContext): string[] {
  const mappedTools: string[] = [];
  for (const name of spec.tools ?? []) {
    const mapped = CC_TOOL_ALIASES[name];
    if (mapped !== undefined) {
      mappedTools.push(mapped);
      continue;
    }
    if (PLANNED_CC_TOOLS[name] !== undefined) {
      bind.onDiagnostic?.({
        level: 'warning',
        code: 'claude_tool_unmapped',
        message: `agent "${spec.id}" requests Claude tool "${name}": ${PLANNED_CC_TOOLS[name]}`,
        path: sourceFile,
      });
      continue;
    }
    mappedTools.push(name);
  }
  return mappedTools;
}
function mapSpecDisallowedTools(spec: AgentSpec): string[] {
  const out: string[] = [];
  for (const name of spec.disallowedTools ?? []) {
    if (PLANNED_CC_TOOLS[name] !== undefined) {
      continue;
    }
    out.push(CC_TOOL_ALIASES[name] ?? name);
  }
  return out;
}
function packsForTools(
  tools: string[],
  index: Map<string, string> | undefined,
): AgentPacks | undefined {
  if (index === undefined) {
    return undefined;
  }
  const names = [
    ...new Set(tools.map((t) => index.get(t)).filter((p): p is string => p !== undefined)),
  ];
  if (names.length === 0) {
    return undefined;
  }
  return Object.fromEntries(names.map((p) => [p, {}]));
}
function warnUnsupportedField(
  spec: AgentSpec,
  sourceFile: string,
  onDiagnostic: BindDiagnosticSink | undefined,
): void {
  if (spec.memory !== undefined) {
    onDiagnostic?.({
      level: 'warning',
      code: 'unsupported_frontmatter_field',
      message: 'agent frontmatter field "memory" has no carrier in the agent model and is dropped',
      path: sourceFile,
    });
  }
  if (spec.background === true) {
    onDiagnostic?.({
      level: 'warning',
      code: 'unsupported_frontmatter_field',
      message:
        'agent frontmatter field "background" has no carrier in the agent model and is dropped',
      path: sourceFile,
    });
  }
}
function resolveSpecModel(
  spec: AgentSpec,
  sourceFile: string,
  bind: AgentBindContext,
): AgentModelRef | undefined {
  if (spec.model === undefined) {
    return undefined;
  }
  const resolved = bind.resolveModel(spec.model);
  if (resolved === null) {
    bind.onDiagnostic?.({
      level: 'warning',
      code: 'unresolved_model',
      message: `agent model "${spec.model}" does not resolve; inheriting parent model on spawn`,
      path: sourceFile,
    });
    return undefined;
  }
  return spec.effort !== undefined ? { ...resolved, effort: spec.effort } : resolved;
}
function readAgentBody(spec: AgentSpec, sourceFile: string, bind: AgentBindContext): string | null {
  try {
    const body = matter(readFileSync(spec.file, 'utf8')).content.trim();
    return bind.userConfig ? substituteUserConfigContent(body, bind.userConfig) : body;
  } catch (cause) {
    bind.onDiagnostic?.({
      level: 'error',
      code: 'invalid_component',
      message: `agent body unreadable: ${cause instanceof Error ? cause.message : String(cause)}`,
      path: sourceFile,
    });
    return null;
  }
}
function standardAgentGraph(tools: string[]): AgentGraph {
  return {
    nodes: {
      start: { type: 'core:start' },
      generate: { type: 'llm:generate', prompt: 'main', tools: [...tools] },
      end: { type: 'core:end' },
    },
    edges: [
      { from: 'start', to: 'generate' },
      { from: 'generate', to: 'end' },
    ],
  };
}
