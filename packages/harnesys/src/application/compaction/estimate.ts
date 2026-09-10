import { CHARS_PER_TOKEN_ESTIMATE } from '../../constants.ts';

export type TokenEstimate = { messages: number; tools: number; total: number };

function textLen(value: unknown): number {
  return typeof value === 'string' ? value.length : 0;
}

function jsonLen(value: unknown): number {
  if (value === undefined || value === null) {
    return 0;
  }
  try {
    return JSON.stringify(value).length;
  } catch {
    return 0;
  }
}

/** chars/4 по текстовым полям хода; структура роли не играет. */
export function estimateMessageTokens(message: unknown): number {
  if (!message || typeof message !== 'object') {
    return 0;
  }
  const m = message as Record<string, unknown>;
  const chars =
    textLen(m.content) +
    textLen(m.reasoning) +
    jsonLen(m.toolCalls) +
    jsonLen(m.attachments) +
    jsonLen(m.sources) +
    jsonLen(m.files);
  return Math.ceil(chars / CHARS_PER_TOKEN_ESTIMATE);
}

export function estimateTokens(messages: readonly unknown[], toolsJson?: string): TokenEstimate {
  const msgs = messages.reduce<number>((sum, m) => sum + estimateMessageTokens(m), 0);
  const tools = toolsJson ? Math.ceil(toolsJson.length / CHARS_PER_TOKEN_ESTIMATE) : 0;
  return { messages: msgs, tools, total: msgs + tools };
}
