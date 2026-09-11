import { bindingOf } from '../adapters/models/binding.ts';
import type { AgentDefinition } from '../domain/agent-definition.ts';
import type { Diagnostic, DiagnosticSeverity } from '../domain/errors.ts';
import type { AgentsResolve } from '../ports/create-runtime.ts';
import type { ProviderConfig } from '../ports/models.ts';
import type { CustomNodeImpl, ToolDefinition } from '../ports/tools.ts';
import { compile } from './compile.ts';

export type CheckOptions = {
  tools?: Map<string, ToolDefinition>;
  models?: ProviderConfig[];
  modelsPort?: unknown;
  nodes?: Record<string, CustomNodeImpl>;
  agents?: AgentsResolve;
};

export function check(
  def: AgentDefinition,
  opts: CheckOptions = {},
): { diagnostics: Diagnostic[] } {
  const { diagnostics } = compile(def);
  const out: Diagnostic[] = [...diagnostics];

  const add = (
    code: string,
    severity: DiagnosticSeverity,
    message: string,
    path?: string,
  ): void => {
    out.push({ code, severity, message, path });
  };

  if (opts.tools) {
    for (const [id, node] of Object.entries(def.graph.nodes)) {
      if (node.type === 'llm:generate' && node.tools) {
        for (const t of node.tools) {
          if (!opts.tools.has(t)) {
            add(
              'tools_unresolved',
              'error',
              `tool "${t}" not in registry`,
              `graph.nodes.${id}.tools`,
            );
          }
        }
      }
      if (node.type === 'tool:call' && 'name' in node) {
        const name = (node as { name?: string }).name;
        if (typeof name === 'string' && !opts.tools.has(name)) {
          add(
            'tools_unresolved',
            'error',
            `tool "${name}" not in registry`,
            `graph.nodes.${id}.name`,
          );
        }
      }
    }
  }

  if (opts.models) {
    const providers = opts.models;
    const resolveModelRef = (ref: string | { provider: string; model: string }): boolean => {
      if (typeof ref === 'string') {
        for (const p of providers) {
          if (p.models.some((m) => m.name === ref)) {
            try {
              bindingOf(p, ref);
              return true;
            } catch {
              // try next provider
            }
          }
        }
        return false;
      }
      const prov = providers.find((p) => p.name === ref.provider);
      if (!prov) {
        return false;
      }
      try {
        bindingOf(prov, ref.model);
        return true;
      } catch {
        return false;
      }
    };

    for (const [id, node] of Object.entries(def.graph.nodes)) {
      if (node.type === 'llm:generate') {
        const m = node.model;
        if (typeof m === 'string') {
          if (!resolveModelRef(m)) {
            add(
              'model_unresolved',
              'error',
              `model "${m}" not resolved`,
              `graph.nodes.${id}.model`,
            );
          }
        } else if (m && typeof m === 'object') {
          if (!resolveModelRef(m as { provider: string; model: string })) {
            add('model_unresolved', 'error', 'model not resolved', `graph.nodes.${id}.model`);
          }
        } else if (m === undefined && def.model && !resolveModelRef(def.model)) {
          add('model_unresolved', 'error', 'agent default model not resolved', 'model');
        }
      }
    }
  }

  for (const [id, node] of Object.entries(def.graph.nodes)) {
    if (node.type.startsWith('custom:')) {
      if (!opts.nodes || !(node.type in opts.nodes)) {
        add(
          'unsupported_node',
          'error',
          `custom node "${node.type}" not registered`,
          `graph.nodes.${id}.type`,
        );
      }
    } else {
      const known = new Set([
        'core:start',
        'core:end',
        'llm:generate',
        'tool:call',
        'control:assign',
        'control:spawn',
        'control:map',
        'control:yield',
        'control:goto',
        'control:interrupt',
        'control:wait',
        'control:handoff',
      ]);
      if (!known.has(node.type)) {
        add(
          'unsupported_node',
          'error',
          `unsupported node type "${node.type}"`,
          `graph.nodes.${id}.type`,
        );
      }
    }
  }

  if (opts.agents) {
    for (const [id, node] of Object.entries(def.graph.nodes)) {
      if (node.type === 'control:handoff') {
        const agentId = node.agentId;
        if (typeof agentId === 'string' && !agentId.trim().startsWith('$')) {
          if (!opts.agents.resolve(agentId)) {
            add(
              'handoff_target',
              'error',
              `handoff target "${agentId}" not found`,
              `graph.nodes.${id}.agentId`,
            );
          }
        }
      }
    }
  }

  for (const [id, node] of Object.entries(def.graph.nodes)) {
    if (node.type === 'tool:call' && 'approve' in node && node.approve) {
      const tools = node.approve.tools;
      const seen = new Set<string>();
      for (const t of tools) {
        if (seen.has(t)) {
          add(
            'duplicate_hitl',
            'error',
            `duplicate approve tool "${t}"`,
            `graph.nodes.${id}.approve.tools`,
          );
        }
        seen.add(t);
      }
    }
  }

  return { diagnostics: out };
}
