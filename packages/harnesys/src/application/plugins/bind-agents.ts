import { readFileSync } from 'node:fs';
import matter from 'gray-matter';
import type { AgentDefinition, AgentGraph, AgentModelRef } from '../../domain/agent-definition.ts';
import type { PluginDiagnostic } from '../../domain/plugin-diagnostics.ts';
import type { AgentSpec, PluginIr } from '../../domain/plugin-ir.ts';

/** Каталогная запись плагинного агента; id `plugin:agent` глобально уникален. */
export type CatalogAgentEntry = {
  id: string;
  /** frontmatter `description` — описание каталога агентов. */
  description?: string;
  definition: AgentDefinition;
  /** Вычитание имён из ран-реестра инструментов (filterToolsForAgent). */
  disallowedTools?: string[];
};

/** Резолв model-строки против моделей хоста; null → компонент отбрасывается. */
export type ResolveAgentModel = (ref: string) => AgentModelRef | null;

/** Приёмник диагностик биндинга; хост решает, где их показывать. */
export type BindDiagnosticSink = (diagnostic: PluginDiagnostic) => void;

/**
 * IR → записи каталога агентов (спека §3): тело md → `prompts.main.instructions`,
 * стандартный граф `start → llm:generate → end`, `tools`/`skills` переезжают
 * как есть, `maxTurns` → `budget.maxSteps`, `model`/`effort` → `AgentModelRef`
 * через `resolveModel`. `memory`/`background` носителя не имеют: поле
 * отбрасывается с diagnostic `unsupported_frontmatter_field`; `isolation`
 * помечается на парсе.
 */
export function bindAgentComponents(
  ir: PluginIr,
  resolveModel: ResolveAgentModel,
  onDiagnostic?: BindDiagnosticSink,
): CatalogAgentEntry[] {
  const entries: CatalogAgentEntry[] = [];
  for (const component of ir.components) {
    if (component.kind !== 'agent' || component.status !== 'native') {
      continue;
    }
    const spec = component.spec as AgentSpec;
    const entry = buildEntry(spec, component.source.file, resolveModel, onDiagnostic);
    if (entry !== undefined) {
      entries.push(entry);
    }
  }
  return entries;
}

function buildEntry(
  spec: AgentSpec,
  sourceFile: string,
  resolveModel: ResolveAgentModel,
  onDiagnostic: BindDiagnosticSink | undefined,
): CatalogAgentEntry | undefined {
  warnUnsupportedField(spec, sourceFile, onDiagnostic);
  const model = resolveSpecModel(spec, sourceFile, resolveModel, onDiagnostic);
  if (model === null) {
    return undefined;
  }
  const instructions = readAgentBody(spec, sourceFile, onDiagnostic);
  if (instructions === null) {
    return undefined;
  }
  const definition: AgentDefinition = {
    id: spec.id,
    prompts: { main: { instructions } },
    graph: standardAgentGraph(),
  };
  if (model !== undefined) {
    definition.model = model;
  }
  if (spec.tools !== undefined) {
    definition.tools = spec.tools;
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
    ...(spec.description !== undefined ? { description: spec.description } : {}),
    ...(spec.disallowedTools !== undefined ? { disallowedTools: spec.disallowedTools } : {}),
  };
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

/** `undefined` — model не задан; `null` — не резолвится, компонент отбрасывается. */
function resolveSpecModel(
  spec: AgentSpec,
  sourceFile: string,
  resolveModel: ResolveAgentModel,
  onDiagnostic: BindDiagnosticSink | undefined,
): AgentModelRef | null | undefined {
  if (spec.model === undefined) {
    return undefined;
  }
  const resolved = resolveModel(spec.model);
  if (resolved === null) {
    onDiagnostic?.({
      level: 'warning',
      code: 'unresolved_model',
      message: `agent model "${spec.model}" does not resolve against host models; component dropped`,
      path: sourceFile,
    });
    return null;
  }
  return spec.effort !== undefined ? { ...resolved, effort: spec.effort } : resolved;
}

function readAgentBody(
  spec: AgentSpec,
  sourceFile: string,
  onDiagnostic: BindDiagnosticSink | undefined,
): string | null {
  try {
    return matter(readFileSync(spec.file, 'utf8')).content.trim();
  } catch (cause) {
    onDiagnostic?.({
      level: 'error',
      code: 'invalid_component',
      message: `agent body unreadable: ${cause instanceof Error ? cause.message : String(cause)}`,
      path: sourceFile,
    });
    return null;
  }
}

function standardAgentGraph(): AgentGraph {
  return {
    nodes: {
      start: { type: 'core:start' },
      generate: { type: 'llm:generate', prompt: 'main' },
      end: { type: 'core:end' },
    },
    edges: [
      { from: 'start', to: 'generate' },
      { from: 'generate', to: 'end' },
    ],
  };
}
