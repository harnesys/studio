import { trace } from '../lib/trace';

export type SseFrame = {
  event: string;
  data: string;
};

export async function* readSse(response: Response): AsyncGenerator<SseFrame> {
  if (!response.body) {
    trace('sse', 'no response body');
    return;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const chunk = await reader.read();
      buffer += decoder.decode(chunk.value ?? new Uint8Array(), { stream: !chunk.done });
      const frames = buffer.split('\n\n');
      buffer = chunk.done ? '' : (frames.pop() ?? '');
      for (const block of frames) {
        const frame = parseBlock(block);
        if (frame) {
          yield frame;
        }
      }
      if (chunk.done) {
        const last = parseBlock(buffer);
        if (last) {
          yield last;
        }
        trace('sse', 'reader done');
        return;
      }
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      // Stream might already be closed/cancelled
    }
  }
}

type EventSourceConnection = {
  source: EventSource;
  refs: number;
  listeners: Map<string, Set<(data: string) => void>>;
  attached: Set<string>;
};

const eventSources = new Map<string, EventSourceConnection>();

/** Shared EventSource per URL. Last unsubscribe closes the socket. */
export function watchEventSource(
  url: string,
  event: string,
  onData: (data: string) => void,
): () => void {
  let conn = eventSources.get(url);
  if (!conn) {
    conn = {
      source: new EventSource(url),
      refs: 0,
      listeners: new Map(),
      attached: new Set(),
    };
    eventSources.set(url, conn);
  }
  conn.refs += 1;
  let set = conn.listeners.get(event);
  if (!set) {
    set = new Set();
    conn.listeners.set(event, set);
  }
  set.add(onData);
  if (!conn.attached.has(event)) {
    conn.attached.add(event);
    const name = event;
    conn.source.addEventListener(name, (message: Event) => {
      const current = eventSources.get(url);
      if (!current) {
        return;
      }
      const payload = (message as MessageEvent<string>).data;
      for (const handler of current.listeners.get(name) ?? []) {
        handler(payload);
      }
    });
  }
  return () => {
    const current = eventSources.get(url);
    if (!current) {
      return;
    }
    current.listeners.get(event)?.delete(onData);
    current.refs -= 1;
    if (current.refs > 0) {
      return;
    }
    current.source.close();
    eventSources.delete(url);
  };
}

function parseBlock(block: string): SseFrame | undefined {
  let event = 'message';
  const data: string[] = [];
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) {
      event = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      data.push(line.slice(5).trimStart());
    }
  }
  if (data.length === 0) {
    return undefined;
  }
  return { event, data: data.join('\n') };
}
