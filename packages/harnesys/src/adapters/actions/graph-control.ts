import { sandboxDenyText } from '../../application/tool-permission.ts';
import {
  MAP_INSTRUCTION_MAX_CHARS,
  MAP_ITEM_LIMIT,
  MAP_TOOL,
  WAIT_DELAY_MS_MAX,
  WAIT_TOOL,
} from '../../constants.ts';
import type { ToolContext, ToolDefinition } from '../../ports/tools.ts';
import { tool } from '../../ports/tools.ts';

export { MAP_TOOL, WAIT_TOOL };

type MapToolInput = {
  items: unknown[];
  instruction?: string;
  maxTokensPerItem?: number;
};
function parseMapToolInput(input: unknown): MapToolInput {
  const rec = input as {
    items?: unknown;
    instruction?: unknown;
    maxTokensPerItem?: unknown;
  };
  if (!Array.isArray(rec.items)) {
    throw new Error('items must be an array');
  }
  if (rec.items.length > MAP_ITEM_LIMIT) {
    throw new Error(`items exceed limit ${MAP_ITEM_LIMIT}`);
  }
  if (rec.instruction !== undefined) {
    if (typeof rec.instruction !== 'string' || rec.instruction.trim().length === 0) {
      throw new Error('instruction must be a non-empty string');
    }
    if (rec.instruction.length > MAP_INSTRUCTION_MAX_CHARS) {
      throw new Error(`instruction exceeds limit ${MAP_INSTRUCTION_MAX_CHARS}`);
    }
  }
  if (rec.maxTokensPerItem !== undefined) {
    if (
      typeof rec.maxTokensPerItem !== 'number' ||
      !Number.isInteger(rec.maxTokensPerItem) ||
      rec.maxTokensPerItem < 1
    ) {
      throw new Error('maxTokensPerItem must be an integer >= 1');
    }
  }
  return {
    items: rec.items,
    ...(typeof rec.instruction === 'string' ? { instruction: rec.instruction } : {}),
    ...(typeof rec.maxTokensPerItem === 'number' ? { maxTokensPerItem: rec.maxTokensPerItem } : {}),
  };
}
export function mapTool(): ToolDefinition {
  return tool(MAP_TOOL, {
    description:
      'Queue a fan-out over items for the graph control:map node. items is a JSON array (max 32). Optional instruction is a per-item template with $item/$index; it overrides the node default. Optional maxTokensPerItem caps each worker text result. Each item is processed in the map body with $item/$index; results return as Map results in context. Prefer this for parallel same-graph work; use agents_spawn when you need another agent definition.',
    group: 'control',
    input: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          description: 'Items to map (strings or objects). Max 32.',
          items: {
            description: 'Single item to process in the map body: string or object.',
          },
          maxItems: MAP_ITEM_LIMIT,
        },
        instruction: {
          type: 'string',
          description:
            'Per-item instruction template with $item/$index. Overrides the node default.',
          maxLength: MAP_INSTRUCTION_MAX_CHARS,
        },
        maxTokensPerItem: {
          type: 'integer',
          description: 'Per-item text budget in tokens (truncated at maxTokens * 4 chars).',
          minimum: 1,
        },
      },
      required: ['items'],
      additionalProperties: false,
    },
    execute(input, ctx: ToolContext) {
      if (ctx.sandbox) {
        return sandboxDenyText(MAP_TOOL, 'user input');
      }
      const parsed = parseMapToolInput(input);
      return {
        items: parsed.items,
        count: parsed.items.length,
        ...(parsed.instruction !== undefined ? { instruction: parsed.instruction } : {}),
        ...(parsed.maxTokensPerItem !== undefined
          ? { maxTokensPerItem: parsed.maxTokensPerItem }
          : {}),
      };
    },
  });
}
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
      const rec = input as {
        delayMs?: unknown;
      };
      const delayMs = typeof rec.delayMs === 'number' ? rec.delayMs : Number.NaN;
      if (!Number.isFinite(delayMs) || delayMs < 1 || delayMs > WAIT_DELAY_MS_MAX) {
        throw new Error(`invalid delayMs ${String(rec.delayMs)}`);
      }
      return { delayMs, waitUntilMs: Date.now() + delayMs };
    },
  });
}
