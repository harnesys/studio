import { sandboxDenyText } from '../../application/tool-permission.ts';
import { GRAPH_MAP_TOOL, MAP_ITEM_LIMIT, WAIT_DELAY_MS_MAX, WAIT_TOOL } from '../../constants.ts';
import type { ToolContext, ToolDefinition } from '../../ports/tools.ts';
import { tool } from '../../ports/tools.ts';

export { GRAPH_MAP_TOOL, WAIT_TOOL };

/** Queue items for control:map (ReAct → $state.mapItems). */
export function graphMap(): ToolDefinition {
  return tool(GRAPH_MAP_TOOL, {
    description:
      'Queue a fan-out over items for the graph control:map node. items is a JSON array (max 32). Each item is processed in the map body with $item/$index; results return as Map results in context. Prefer this for parallel same-graph work; use agents_spawn when you need another agent definition.',
    group: 'control',
    input: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          description: 'Items to map (strings or objects). Max 32.',
          maxItems: MAP_ITEM_LIMIT,
        },
      },
      required: ['items'],
      additionalProperties: false,
    },
    execute(input, ctx: ToolContext) {
      if (ctx.sandbox) {
        return sandboxDenyText(GRAPH_MAP_TOOL, 'user input');
      }
      const rec = input as { items?: unknown };
      if (!Array.isArray(rec.items)) {
        throw new Error('items must be an array');
      }
      if (rec.items.length > MAP_ITEM_LIMIT) {
        throw new Error(`items exceed limit ${MAP_ITEM_LIMIT}`);
      }
      return { items: rec.items, count: rec.items.length };
    },
  });
}

/** Queue a mid-run sleep for control:wait (ReAct → $state.waitUntilMs). */
export function wait(): ToolDefinition {
  return tool(WAIT_TOOL, {
    description:
      'Park this run until a wall-clock time (control:wait). delayMs is relative sleep (1..7d). Prefer this for mid-pipeline pauses; use schedule_set for recurring or next-session wakes after the run ends. Does not replace ask_user.',
    group: 'control',
    input: {
      type: 'object',
      properties: {
        delayMs: {
          type: 'integer',
          minimum: 1,
          maximum: WAIT_DELAY_MS_MAX,
          description: 'Milliseconds to sleep before the graph continues',
        },
      },
      required: ['delayMs'],
      additionalProperties: false,
    },
    execute(input, ctx: ToolContext) {
      if (ctx.sandbox) {
        return sandboxDenyText(WAIT_TOOL, 'user input');
      }
      const rec = input as { delayMs?: unknown };
      const delayMs = typeof rec.delayMs === 'number' ? rec.delayMs : Number.NaN;
      if (!Number.isFinite(delayMs) || delayMs < 1 || delayMs > WAIT_DELAY_MS_MAX) {
        throw new Error(`invalid delayMs ${String(rec.delayMs)}`);
      }
      return { delayMs, waitUntilMs: Date.now() + delayMs };
    },
  });
}
