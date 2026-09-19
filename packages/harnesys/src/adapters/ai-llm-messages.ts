function userContentParts(content: unknown[]): Record<string, unknown>[] {
  const parts: Record<string, unknown>[] = [];
  for (const raw of content) {
    if (!raw || typeof raw !== 'object') {
      continue;
    }
    const part = raw as Record<string, unknown>;
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
export function toModelMessages(raw: unknown[]): unknown[] {
  const out: unknown[] = [];
  for (const item of raw as Record<string, unknown>[]) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const role = item.role as string | undefined;
    if (role === 'user') {
      const content = item.content;
      if (typeof content === 'string') {
        out.push({ role: 'user', content });
      } else if (Array.isArray(content)) {
        const parts = userContentParts(content);
        out.push({ role: 'user', content: parts.length > 0 ? parts : '' });
      } else {
        out.push({ role: 'user', content: '' });
      }
    } else if (role === 'assistant') {
      const text = typeof item.content === 'string' ? (item.content as string) : '';
      const toolCalls = Array.isArray(item.toolCalls) ? (item.toolCalls as unknown[]) : [];
      const reasoning = typeof item.reasoning === 'string' ? (item.reasoning as string) : '';
      if (toolCalls.length === 0 && !reasoning) {
        out.push({ role: 'assistant', content: text });
      } else {
        const content: Record<string, unknown>[] = [];
        if (reasoning) {
          content.push({ type: 'reasoning', text: reasoning });
        }
        if (text) {
          content.push({ type: 'text', text });
        }
        for (const tc of toolCalls as Record<string, unknown>[]) {
          const id = String((tc.id ?? tc.toolCallId ?? '') as string);
          const name = String((tc.name ?? tc.toolName ?? 'tool') as string);
          const input = (tc.args ?? tc.input ?? {}) as unknown;
          content.push({ type: 'tool-call', toolCallId: id, toolName: name, input });
        }
        if (content.length === 0) {
          content.push({ type: 'text', text: '' });
        }
        out.push({ role: 'assistant', content });
      }
    } else if (role === 'tool') {
      const toolCallId = String((item.toolCallId ?? item.id ?? '') as string);
      const toolName = String((item.name ?? item.toolName ?? 'tool') as string);
      const rawContent = item.content as unknown;
      let value: string;
      if (typeof rawContent === 'string') {
        value = rawContent;
      } else if (rawContent == null) {
        value = '';
      } else {
        try {
          value = JSON.stringify(rawContent, null, 2);
        } catch {
          value = String(rawContent);
        }
      }
      out.push({
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId,
            toolName,
            output: { type: 'text', value },
          },
        ],
      });
    } else if (role === 'system') {
      const text = typeof item.content === 'string' ? (item.content as string) : '';
      out.push({ role: 'system', content: text });
    }
  }
  return out;
}
