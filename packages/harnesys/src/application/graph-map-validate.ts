import { MAP_INSTRUCTION_MAX_CHARS, MAP_ITEM_LIMIT, WAIT_DELAY_MS_MAX } from '../constants.ts';
import type { AgentDefinition, Edge, Node } from '../domain/agent-definition.ts';
import type { DiagnosticSeverity } from '../domain/errors.ts';
import { isPathExpr, parseExpr } from './expr-eval.ts';

type AddDiag = (code: string, severity: DiagnosticSeverity, message: string, path?: string) => void;

function tryParse(expr: string, path: string | undefined, add: AddDiag): boolean {
  try {
    parseExpr(expr);
    return true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    add('expr_syntax', 'error', msg, path);
    return false;
  }
}

function collectMapBodies(nodes: Record<string, Node>): {
  bodyIds: Set<string>;
  maps: Array<{ id: string; body: Set<string>; enter: string }>;
} {
  const bodyIds = new Set<string>();
  const maps: Array<{ id: string; body: Set<string>; enter: string }> = [];
  for (const [id, n] of Object.entries(nodes)) {
    if (n.type !== 'control:map') {
      continue;
    }
    const body = new Set(Array.isArray(n.body) ? n.body : []);
    for (const b of body) {
      bodyIds.add(b);
    }
    maps.push({ id, body, enter: typeof n.enter === 'string' ? n.enter : '' });
  }
  return { bodyIds, maps };
}

export function validateMapWaitNodes(
  def: AgentDefinition,
  edgesByFrom: Map<string, Edge[]>,
  add: AddDiag,
): void {
  const nodes = def.graph.nodes;
  const { bodyIds, maps } = collectMapBodies(nodes);

  for (const [id, n] of Object.entries(nodes)) {
    if (n.type === 'control:yield') {
      if (!bodyIds.has(id)) {
        add(
          'yield_outside_map',
          'error',
          `control:yield "${id}" must be inside a control:map body`,
          `graph.nodes.${id}`,
        );
      }
      if (n.value !== undefined) {
        if (typeof n.value !== 'string' || !n.value.trim().startsWith('$')) {
          add(
            'yield_value',
            'error',
            'yield value must be a $ expression when set',
            `graph.nodes.${id}.value`,
          );
        } else {
          tryParse(n.value, `graph.nodes.${id}.value`, add);
        }
      }
      continue;
    }

    if (n.type === 'control:map') {
      const base = `graph.nodes.${id}`;
      if (typeof n.items !== 'string' || n.items.trim().length === 0) {
        add('map_fields', 'error', 'map.items is required', `${base}.items`);
      } else {
        tryParse(n.items, `${base}.items`, add);
        try {
          const parsed = JSON.parse(n.items.trim());
          if (!Array.isArray(parsed)) {
            add(
              'map_items_dynamic',
              'warning',
              'map items not statically enumerable',
              `${base}.items`,
            );
          } else if (parsed.length > MAP_ITEM_LIMIT) {
            add(
              'map_item_limit',
              'error',
              `map items literal exceeds limit ${MAP_ITEM_LIMIT}`,
              `${base}.items`,
            );
          }
        } catch {
          add(
            'map_items_dynamic',
            'warning',
            'map items not statically enumerable',
            `${base}.items`,
          );
        }
      }
      if (!Array.isArray(n.body) || n.body.length === 0) {
        add('map_fields', 'error', 'map.body must be a non-empty string[]', `${base}.body`);
      } else {
        const seen = new Set<string>();
        for (const bid of n.body) {
          if (typeof bid !== 'string' || !bid) {
            add(
              'map_fields',
              'error',
              'map.body entries must be non-empty strings',
              `${base}.body`,
            );
            continue;
          }
          if (seen.has(bid)) {
            add('map_fields', 'error', `duplicate body id "${bid}"`, `${base}.body`);
          }
          seen.add(bid);
          const bn = nodes[bid];
          if (!bn) {
            add('map_body_unknown', 'error', `map body id "${bid}" not in nodes`, `${base}.body`);
            continue;
          }
          if (bn.type === 'control:map') {
            add('map_nested', 'error', `nested control:map "${bid}" in body`, `${base}.body`);
          }
          if (bn.type === 'core:end') {
            add(
              'end_in_map_body',
              'error',
              `core:end "${bid}" not allowed in map body`,
              `${base}.body`,
            );
          }
          if (bn.type === 'control:handoff') {
            add(
              'handoff_in_map_body',
              'error',
              `control:handoff "${bid}" not allowed in map body`,
              `${base}.body`,
            );
          }
        }
      }
      if (typeof n.enter !== 'string' || !n.enter) {
        add('map_enter', 'error', 'map.enter is required', `${base}.enter`);
      } else if (Array.isArray(n.body) && !n.body.includes(n.enter)) {
        add('map_enter', 'error', `map.enter "${n.enter}" must be in body`, `${base}.enter`);
      }
      const conc = n.concurrency;
      if (conc !== 'parallel' && conc !== 'sequential') {
        if (typeof conc === 'string' && conc.trim().startsWith('$')) {
          tryParse(conc, `${base}.concurrency`, add);
        } else {
          add('concurrency_invalid', 'error', 'invalid map concurrency', `${base}.concurrency`);
        }
      }
      if (n.barrier !== undefined && n.barrier.policy !== 'all') {
        add('barrier_policy', 'error', 'barrier.policy must be "all"', `${base}.barrier.policy`);
      }
      if (n.timeoutMs !== undefined) {
        if (!Number.isFinite(n.timeoutMs) || n.timeoutMs <= 0) {
          add('map_timeout', 'error', 'timeoutMs must be a positive number', `${base}.timeoutMs`);
        }
      }
      if (n.onTimeout !== undefined && n.onTimeout !== 'fail' && n.onTimeout !== 'partial') {
        add('map_timeout', 'error', 'onTimeout must be fail|partial', `${base}.onTimeout`);
      }
      if (n.onTimeout !== undefined && n.timeoutMs === undefined) {
        add('map_timeout', 'error', 'onTimeout requires timeoutMs', `${base}.onTimeout`);
      }
      if (n.instruction !== undefined) {
        if (typeof n.instruction !== 'string' || n.instruction.trim().length === 0) {
          add(
            'map_instruction',
            'error',
            'instruction must be a non-empty string',
            `${base}.instruction`,
          );
        } else if (n.instruction.length > MAP_INSTRUCTION_MAX_CHARS) {
          add(
            'map_instruction',
            'error',
            `instruction exceeds limit ${MAP_INSTRUCTION_MAX_CHARS}`,
            `${base}.instruction`,
          );
        }
      }
      if (n.maxTokensPerItem !== undefined) {
        if (
          typeof n.maxTokensPerItem !== 'number' ||
          !Number.isInteger(n.maxTokensPerItem) ||
          n.maxTokensPerItem < 1
        ) {
          add(
            'map_max_tokens',
            'error',
            'maxTokensPerItem must be an integer >= 1',
            `${base}.maxTokensPerItem`,
          );
        }
      }
      // edges from body must stay in body; yield has no outgoing
      if (Array.isArray(n.body)) {
        const bodySet = new Set(n.body);
        let hasYield = false;
        for (const bid of n.body) {
          const bn = nodes[bid];
          if (bn?.type === 'control:yield') {
            hasYield = true;
            continue;
          }
          for (const ed of edgesByFrom.get(bid) ?? []) {
            if (!bodySet.has(ed.to)) {
              add(
                'map_escape',
                'error',
                `edge from map body "${bid}" escapes to "${ed.to}"`,
                `graph.edges.from:${bid}`,
              );
            }
          }
        }
        if (!hasYield) {
          add('map_no_yield', 'error', `map "${id}" body has no control:yield`, base);
        }
      }
      continue;
    }

    if (n.type === 'control:wait') {
      const base = `graph.nodes.${id}`;
      const hasDelay = n.delayMs !== undefined;
      const hasUntil = n.untilMs !== undefined;
      if (hasDelay && hasUntil) {
        add('wait_mode', 'error', 'delayMs and untilMs are mutually exclusive', base);
      }
      if (hasDelay) {
        if (!Number.isFinite(n.delayMs) || (n.delayMs as number) < 1) {
          add('wait_delay', 'error', 'delayMs must be >= 1', `${base}.delayMs`);
        } else if ((n.delayMs as number) > WAIT_DELAY_MS_MAX) {
          add(
            'wait_delay',
            'error',
            `delayMs exceeds WAIT_DELAY_MS_MAX (${WAIT_DELAY_MS_MAX})`,
            `${base}.delayMs`,
          );
        }
        if (n.timeoutMs !== undefined) {
          add('wait_mode', 'error', 'timeoutMs is not valid with sleep (delayMs/untilMs)', base);
        }
      }
      if (hasUntil) {
        if (typeof n.untilMs !== 'string' || !n.untilMs.trim().startsWith('$')) {
          add('wait_mode', 'error', 'untilMs must be a $ expression', `${base}.untilMs`);
        } else {
          tryParse(n.untilMs, `${base}.untilMs`, add);
        }
        if (n.timeoutMs !== undefined) {
          add('wait_mode', 'error', 'timeoutMs is not valid with sleep (delayMs/untilMs)', base);
        }
      }
      if (!hasDelay && !hasUntil) {
        // gate mode
        if (n.timeoutMs !== undefined) {
          if (!Number.isFinite(n.timeoutMs) || n.timeoutMs < 1) {
            add('wait_timeout', 'error', 'timeoutMs must be >= 1', `${base}.timeoutMs`);
          }
        }
        if (
          n.onTimeout !== undefined &&
          n.onTimeout !== 'fail' &&
          n.onTimeout !== 'continue' &&
          n.onTimeout !== 'interrupt'
        ) {
          add(
            'wait_timeout',
            'error',
            'onTimeout must be fail|continue|interrupt',
            `${base}.onTimeout`,
          );
        }
        if (n.onTimeout !== undefined && n.timeoutMs === undefined) {
          add('wait_timeout', 'error', 'onTimeout requires timeoutMs', `${base}.onTimeout`);
        }
      } else if (n.onTimeout !== undefined) {
        add('wait_mode', 'error', 'onTimeout is only valid for gate wait', `${base}.onTimeout`);
      }
      if (n.onTimeout === 'interrupt' && (hasDelay || hasUntil)) {
        add(
          'wait_mode',
          'error',
          'onTimeout interrupt is only valid for gate wait',
          `${base}.onTimeout`,
        );
      }
    }
  }

  // Body nodes must not appear in multiple maps
  const owner = new Map<string, string>();
  for (const m of maps) {
    for (const bid of m.body) {
      const prev = owner.get(bid);
      if (prev && prev !== m.id) {
        add(
          'map_fields',
          'error',
          `node "${bid}" is in multiple map bodies (${prev}, ${m.id})`,
          `graph.nodes.${m.id}.body`,
        );
      }
      owner.set(bid, m.id);
    }
  }
}

export function mapBodyNodeIds(nodes: Record<string, Node>): Set<string> {
  return collectMapBodies(nodes).bodyIds;
}

export function isYieldValuePath(expr: string): boolean {
  return isPathExpr(expr) || (typeof expr === 'string' && expr.trim().startsWith('$'));
}
