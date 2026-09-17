import { trace } from '../lib/trace';
import { getHostCredential } from './host-credential';

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

type FetchSseConnection = {
  refs: number;
  listeners: Map<string, Set<(data: string) => void>>;
  abort: AbortController;
  onError?: () => void;
};

const connections = new Map<string, FetchSseConnection>();

export type WatchEventSourceOptions = {
  credential?: string | null;
  onError?: () => void;
};

/**
 * Shared SSE per URL via fetch + Authorization Bearer (EventSource cannot set headers).
 * Last unsubscribe aborts the request.
 */
export function watchEventSource(
  url: string,
  event: string,
  onData: (data: string) => void,
  options?: WatchEventSourceOptions,
): () => void {
  let conn = connections.get(url);
  if (!conn) {
    const abort = new AbortController();
    conn = { refs: 0, listeners: new Map(), abort, onError: options?.onError };
    connections.set(url, conn);
    void openSse(url, abort.signal, options?.credential).catch(() => {
      connections.get(url)?.onError?.();
      connections.delete(url);
    });
  }
  conn.refs += 1;
  let set = conn.listeners.get(event);
  if (!set) {
    set = new Set();
    conn.listeners.set(event, set);
  }
  set.add(onData);
  return () => {
    const current = connections.get(url);
    if (!current) {
      return;
    }
    current.listeners.get(event)?.delete(onData);
    current.refs -= 1;
    if (current.refs > 0) {
      return;
    }
    current.abort.abort();
    connections.delete(url);
  };
}

async function openSse(
  url: string,
  signal: AbortSignal,
  credentialOverride?: string | null,
): Promise<void> {
  const headers = new Headers();
  const credential = credentialOverride === undefined ? getHostCredential() : credentialOverride;
  if (credential) {
    headers.set('Authorization', `Bearer ${credential}`);
  }
  const response = await fetch(url, { headers, signal });
  if (!response.ok) {
    trace('sse', `open failed ${response.status}`);
    connections.get(url)?.onError?.();
    return;
  }
  for await (const frame of readSse(response)) {
    const current = connections.get(url);
    if (!current) {
      return;
    }
    for (const handler of current.listeners.get(frame.event) ?? []) {
      handler(frame.data);
    }
  }
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
