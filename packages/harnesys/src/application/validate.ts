import type { AgentDefinition, Edge, Node } from '../domain/agent-definition.ts';
import type { Diagnostic, DiagnosticSeverity } from '../domain/errors.ts';
import { isPathExpr, parseExpr } from './expr-eval.ts';

const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const RESERVED = new Set([
  'input',
  'state',
  'output',
  'resume',
  'messages',
  'toolCalls',
  'finishReason',
  'text',
]);

function hasCycle(nodes: Record<string, Node>, edges: Edge[]): boolean {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    const arr = adj.get(e.from);
    if (arr) {
      arr.push(e.to);
    } else {
      adj.set(e.from, [e.to]);
    }
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  let found = false;
  function dfs(n: string): void {
    if (found) {
      return;
    }
    visiting.add(n);
    for (const nb of adj.get(n) ?? []) {
      if (visiting.has(nb)) {
        found = true;
        return;
      }
      if (!visited.has(nb)) {
        dfs(nb);
      }
    }
    visiting.delete(n);
    visited.add(n);
  }
  for (const id of Object.keys(nodes)) {
    if (!visited.has(id) && !visiting.has(id)) {
      dfs(id);
    }
  }
  return found;
}

export function validateStructural(def: AgentDefinition): Diagnostic[] {
  const diags: Diagnostic[] = [];
  const add = (
    code: string,
    severity: DiagnosticSeverity,
    message: string,
    path?: string,
  ): void => {
    diags.push({ code, severity, message, path });
  };
  const tryParse = (expr: string, path?: string): boolean => {
    try {
      parseExpr(expr);
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      add('expr_syntax', 'error', msg, path);
      return false;
    }
  };

  const nodes = def.graph.nodes;
  const edges = def.graph.edges;
  const nodeIds = new Set(Object.keys(nodes));

  if (typeof def.id !== 'string' || def.id.trim().length === 0) {
    add('id_required', 'error', 'id is required and must be non-empty', 'id');
  }
  if (def.version !== undefined && !SEMVER_RE.test(def.version)) {
    add('version_format', 'error', `version "${def.version}" must be semver`, 'version');
  }

  const startIds: string[] = [];
  const endIds: string[] = [];
  for (const [id, n] of Object.entries(nodes)) {
    if (n.type === 'core:start') {
      startIds.push(id);
    }
    if (n.type === 'core:end') {
      endIds.push(id);
    }
  }
  if (startIds.length !== 1) {
    add(
      'start_count',
      'error',
      `expected exactly 1 core:start, got ${startIds.length}`,
      'graph.nodes',
    );
  }
  if (endIds.length < 1) {
    add('end_count', 'error', `expected at least 1 core:end, got ${endIds.length}`, 'graph.nodes');
  }

  const edgesByFrom = new Map<string, Edge[]>();
  for (let i = 0; i < edges.length; i++) {
    const e = edges[i] as Edge;
    const base = `graph.edges[${i}]`;
    if (!nodeIds.has(e.from)) {
      add('edge_endpoint', 'error', `edge from "${e.from}" not in nodes`, `${base}.from`);
    }
    if (!nodeIds.has(e.to)) {
      add('edge_endpoint', 'error', `edge to "${e.to}" not in nodes`, `${base}.to`);
    }
    if (e.when !== undefined) {
      tryParse(e.when, `${base}.when`);
    }
    const list = edgesByFrom.get(e.from);
    if (list) {
      list.push(e);
    } else {
      edgesByFrom.set(e.from, [e]);
    }
  }

  for (const [id, n] of Object.entries(nodes)) {
    if (n.type === 'core:end' || n.type === 'control:goto') {
      continue;
    }
    const out = edgesByFrom.get(id);
    if (!out || out.length === 0) {
      add('outgoing_required', 'error', `node "${id}" requires outgoing edge`, `graph.nodes.${id}`);
    }
  }

  for (const [from, list] of edgesByFrom) {
    const withWhen = list.filter((e) => e.when !== undefined);
    const defaults = list.filter((e) => e.when === undefined);
    if (withWhen.length > 0 && defaults.length === 0) {
      add(
        'missing_default',
        'error',
        `missing default edge from "${from}"`,
        `graph.edges.from:${from}`,
      );
    }
    if (defaults.length > 1) {
      add(
        'default_edge',
        'error',
        `at most 1 default edge from "${from}"`,
        `graph.edges.from:${from}`,
      );
    } else if (defaults.length === 1) {
      const last = list[list.length - 1] as Edge;
      if (last.when !== undefined) {
        add(
          'default_edge',
          'error',
          `default edge must be last from "${from}"`,
          `graph.edges.from:${from}`,
        );
      }
    }
  }

  for (const [id, n] of Object.entries(nodes)) {
    if (n.type === 'llm:generate') {
      if (!def.prompts[n.prompt]) {
        add(
          'prompt_missing',
          'error',
          `prompt "${n.prompt}" not found`,
          `graph.nodes.${id}.prompt`,
        );
      }
      if (n.messages !== undefined) {
        const m = n.messages;
        const ok = tryParse(m, `graph.nodes.${id}.messages`);
        if (ok && (!isPathExpr(m) || !m.trim().startsWith('$state.'))) {
          add(
            'messages_path',
            'error',
            'messages must be $state.* path',
            `graph.nodes.${id}.messages`,
          );
        }
      }
      if (n.output && typeof n.output === 'object') {
        const props = (n.output as { properties?: Record<string, unknown> }).properties;
        if (props) {
          for (const k of Object.keys(props)) {
            if (RESERVED.has(k)) {
              add(
                'output_key_reserved',
                'warning',
                `output key "${k}" is reserved`,
                `graph.nodes.${id}.output.properties.${k}`,
              );
            }
          }
        }
      }
    }
    if ((n as { type: string }).type === 'tool:call') {
      const tc = n as unknown as {
        name?: unknown;
        args?: unknown;
        calls?: unknown;
        concurrency?: unknown;
        barrier?: { policy?: unknown };
      };
      const hasName = typeof tc.name === 'string' && (tc.name as string).length > 0;
      const hasArgs = tc.args !== undefined;
      const hasCalls = tc.calls !== undefined;
      const hasConcurrency = tc.concurrency !== undefined;
      const isFixed = hasName && hasArgs && !hasCalls && !hasConcurrency;
      const isBatch = hasCalls && hasConcurrency && !hasName && !hasArgs;
      if (!isFixed && !isBatch) {
        add(
          'tool_call_shape',
          'error',
          'tool:call must be fixed (name+args) XOR batch (calls+concurrency)',
          `graph.nodes.${id}`,
        );
      }
      if (isBatch) {
        const callsExpr = tc.calls as string;
        if (typeof callsExpr === 'string') {
          tryParse(callsExpr, `graph.nodes.${id}.calls`);
        }
        const conc = tc.concurrency as unknown;
        if (typeof conc === 'string' && conc.trim().startsWith('$')) {
          tryParse(conc as string, `graph.nodes.${id}.concurrency`);
        }
      }
      if (hasArgs && typeof tc.args === 'object' && tc.args !== null) {
        for (const [k, v] of Object.entries(tc.args as Record<string, unknown>)) {
          if (typeof v === 'string' && v.trim().startsWith('$')) {
            tryParse(v, `graph.nodes.${id}.args.${k}`);
          }
        }
      }
      if (tc.barrier !== undefined && tc.barrier.policy !== 'all') {
        add(
          'barrier_policy',
          'error',
          'barrier.policy must be "all"',
          `graph.nodes.${id}.barrier.policy`,
        );
      }
    }
    if (n.type === 'control:assign') {
      for (const [k, v] of Object.entries(n.patch)) {
        if (typeof v === 'string' && v.trim().startsWith('$')) {
          tryParse(v, `graph.nodes.${id}.patch.${k}`);
        }
        if (typeof v === 'string' && v.includes('{$')) {
          for (const m of v.matchAll(/\{\$[^}]+\}/g)) {
            const inner = m[0].slice(1, -1);
            tryParse(inner, `graph.nodes.${id}.patch.${k}`);
          }
        }
      }
    }
    if (n.type === 'control:goto') {
      const target = n.target;
      if (typeof target !== 'string' || target.trim().length === 0) {
        add('goto_target', 'error', 'goto target is required', `graph.nodes.${id}.target`);
      } else {
        tryParse(target, `graph.nodes.${id}.target`);
      }
    }
    if (n.type === 'control:spawn') {
      const callsExpr = n.calls;
      if (typeof callsExpr === 'string') {
        tryParse(callsExpr, `graph.nodes.${id}.calls`);
      }
      const conc = n.concurrency;
      if (typeof conc === 'string' && conc.trim().startsWith('$')) {
        tryParse(conc as string, `graph.nodes.${id}.concurrency`);
      }
      if (n.barrier !== undefined && n.barrier.policy !== 'all') {
        add(
          'barrier_policy',
          'error',
          'barrier.policy must be "all"',
          `graph.nodes.${id}.barrier.policy`,
        );
      }
    }
    if (n.type === 'control:handoff') {
      if (typeof n.agentId === 'string' && n.agentId.trim().startsWith('$')) {
        tryParse(n.agentId, `graph.nodes.${id}.agentId`);
      }
      if (typeof n.input === 'string' && n.input.trim().startsWith('$')) {
        tryParse(n.input, `graph.nodes.${id}.input`);
      }
    }
  }

  for (const [pid, p] of Object.entries(def.prompts)) {
    for (const m of p.instructions.matchAll(/\{\$[^}]+\}/g)) {
      const inner = m[0].slice(1, -1);
      tryParse(inner, `prompts.${pid}.instructions`);
    }
  }

  if (
    hasCycle(nodes, edges) &&
    def.budget?.maxSteps === undefined &&
    def.budget?.deadlineMs === undefined
  ) {
    add('cycle_budget', 'error', 'graph has cycle but no budget.maxSteps/deadlineMs', 'budget');
  }

  const spawnNodes = Object.entries(nodes).filter(([, v]) => v.type === 'control:spawn');
  if (spawnNodes.length > 0 && def.state?.reducers) {
    const replaceKeys = Object.entries(def.state.reducers)
      .filter(([, val]) => val === 'replace')
      .map(([k]) => k);
    if (replaceKeys.length > 0) {
      const parallel = spawnNodes.filter(([, v]) => {
        const c = (v as { concurrency: unknown }).concurrency;
        return c === 'parallel' || (typeof c === 'string' && (c as string).trim().startsWith('$'));
      });
      if (parallel.length > 0) {
        const written = new Map<string, number>();
        for (const [, v] of Object.entries(nodes)) {
          if (v.type === 'control:assign') {
            for (const k of Object.keys(v.patch)) {
              written.set(k, (written.get(k) ?? 0) + 1);
            }
          }
        }
        for (const k of replaceKeys) {
          if ((written.get(k) ?? 0) >= 2) {
            add(
              'concurrent_replace',
              'error',
              `key "${k}" written by multiple branches with reducers replace`,
              `state.reducers.${k}`,
            );
          }
        }
      }
    }
  }

  for (const [id, n] of Object.entries(nodes)) {
    if (n.type === 'control:spawn' && n.concurrency === 'parallel') {
      let isStatic = false;
      try {
        const parsed = JSON.parse(n.calls.trim());
        if (Array.isArray(parsed)) {
          isStatic = true;
        }
      } catch {
        isStatic = false;
      }
      if (!isStatic) {
        add(
          'spawn_targets_dynamic',
          'warning',
          'spawn calls not statically enumerable',
          `graph.nodes.${id}.calls`,
        );
      }
    }
  }

  if (startIds.length === 1) {
    const startId = startIds[0] as string;
    const visited = new Set<string>([startId]);
    const queue: string[] = [startId];
    while (queue.length > 0) {
      const cur = queue.shift() as string;
      for (const e of edgesByFrom.get(cur) ?? []) {
        if (!visited.has(e.to)) {
          visited.add(e.to);
          queue.push(e.to);
        }
      }
    }
    for (const id of Object.keys(nodes)) {
      if (!visited.has(id)) {
        add('unreachable', 'warning', `node "${id}" unreachable from start`, `graph.nodes.${id}`);
      }
    }
  }

  return diags;
}
