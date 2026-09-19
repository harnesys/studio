type MessageRecord = Record<string, unknown>;
function userContentParts(content: unknown[]): MessageRecord[] {
  const parts: MessageRecord[] = [];
  for (const raw of content) {
    if (!raw || typeof raw !== 'object') {
      continue;
    }
    const part = raw as MessageRecord;
    if (part.type === 'text') {
      parts.push({ type: 'text', text: String(part.text ?? '') });
      continue;
    }
    if (part.type === 'file') {
      parts.push({
        type: 'file',
        mediaType: String(part.mediaType ?? 'application/octet-stream'),
        data: part.data,
      });
      continue;
    }
    if (part.type === 'image' || part.type === 'audio' || part.type === 'video') {
      parts.push({
        type: 'file',
        mediaType: String(part.mediaType ?? part.type),
        data: part.data,
      });
    }
  }
  return parts;
}
function userMessage(item: MessageRecord): MessageRecord {
  const content = item.content;
  if (typeof content === 'string') {
    return { role: 'user', content };
  }
  if (Array.isArray(content)) {
    const parts = userContentParts(content);
    return { role: 'user', content: parts.length > 0 ? parts : '' };
  }
  return { role: 'user', content: '' };
}
function toolCallPart(tc: MessageRecord): MessageRecord {
  const id = String((tc.id ?? tc.toolCallId ?? '') as string);
  const name = String((tc.name ?? tc.toolName ?? 'tool') as string);
  const input = (tc.args ?? tc.input ?? {}) as unknown;
  return { type: 'tool-call', toolCallId: id, toolName: name, input };
}
function assistantContent(
  text: string,
  reasoning: string,
  toolCalls: MessageRecord[],
): MessageRecord[] {
  const content: MessageRecord[] = [];
  if (reasoning) {
    content.push({ type: 'reasoning', text: reasoning });
  }
  if (text) {
    content.push({ type: 'text', text });
  }
  for (const tc of toolCalls) {
    content.push(toolCallPart(tc));
  }
  if (content.length === 0) {
    content.push({ type: 'text', text: '' });
  }
  return content;
}
function assistantMessage(item: MessageRecord): MessageRecord {
  const text = typeof item.content === 'string' ? item.content : '';
  const toolCalls = Array.isArray(item.toolCalls) ? (item.toolCalls as MessageRecord[]) : [];
  const reasoning = typeof item.reasoning === 'string' ? item.reasoning : '';
  if (toolCalls.length === 0 && !reasoning) {
    return { role: 'assistant', content: text };
  }
  return { role: 'assistant', content: assistantContent(text, reasoning, toolCalls) };
}
function toolResultValue(rawContent: unknown): string {
  if (typeof rawContent === 'string') {
    return rawContent;
  }
  if (rawContent == null) {
    return '';
  }
  try {
    return JSON.stringify(rawContent, null, 2);
  } catch {
    return String(rawContent);
  }
}
function toolMessage(item: MessageRecord): MessageRecord {
  return {
    role: 'tool',
    content: [
      {
        type: 'tool-result',
        toolCallId: String((item.toolCallId ?? item.id ?? '') as string),
        toolName: String((item.name ?? item.toolName ?? 'tool') as string),
        output: { type: 'text', value: toolResultValue(item.content) },
      },
    ],
  };
}
function systemMessage(item: MessageRecord): MessageRecord {
  const text = typeof item.content === 'string' ? item.content : '';
  return { role: 'system', content: text };
}
function convertMessage(item: MessageRecord): MessageRecord | undefined {
  const role = item.role as string | undefined;
  if (role === 'user') {
    return userMessage(item);
  }
  if (role === 'assistant') {
    return assistantMessage(item);
  }
  if (role === 'tool') {
    return toolMessage(item);
  }
  if (role === 'system') {
    return systemMessage(item);
  }
  return undefined;
}
export function toModelMessages(raw: unknown[]): unknown[] {
  const out: unknown[] = [];
  for (const item of raw as MessageRecord[]) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const converted = convertMessage(item);
    if (converted) {
      out.push(converted);
    }
  }
  return out;
}
