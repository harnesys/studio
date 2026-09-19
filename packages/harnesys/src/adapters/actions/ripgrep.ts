import {
  DEFAULT_GREP_MAX_CHARS,
  DEFAULT_GREP_TIMEOUT_MS,
  MAX_GREP_LINE_CHARS,
} from '../../constants.ts';
export type RipgrepRow = {
  file: string;
  line: number;
  text: string;
};
export type RipgrepRun = {
  rows: RipgrepRow[];
  truncated: boolean;
  timedOut: boolean;
};
type RipgrepOptions = {
  cwd: string;
  env?: Record<string, string>;
  limit: number;
  budgetChars?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
};
type RipgrepProcess = Bun.Subprocess<'ignore', 'pipe', 'pipe'>;
type RipgrepState = {
  truncated: boolean;
  timedOut: boolean;
  stopped: boolean;
  stop(): void;
};
const STDERR_CAPTURE_CHARS = 8 * 1024;
const MAX_JSON_RECORD_CHARS = 1024 * 1024;
const KILL_DRAIN_TIMEOUT_MS = 1000;
let rgPathPromise: Promise<string | null> | undefined;
export function resolveRipgrep(env?: Record<string, string>): Promise<string | null> {
  if (rgPathPromise === undefined) {
    rgPathPromise = Promise.resolve(
      Bun.which('rg', env?.PATH === undefined ? undefined : { PATH: env.PATH }),
    );
  }
  return rgPathPromise;
}
export async function runRipgrep(args: string[], opts: RipgrepOptions): Promise<RipgrepRun> {
  const rg = await resolveRipgrep(opts.env);
  if (rg === null) {
    throw new Error('ripgrep binary not found');
  }
  const { proc, state, dispose } = spawnRipgrep(rg, args, opts);
  const stderrPromise = readCappedStream(proc.stderr, STDERR_CAPTURE_CHARS).catch(() => '');
  const { rows, truncated } = await readMatchRows(proc, state, opts);
  dispose();
  const exitCode = await Promise.race([proc.exited, drainDelay()]);
  const stderrText = await stderrPromise;
  if (opts.signal?.aborted) {
    throw new Error('grep aborted');
  }
  if (!state.stopped && exitCode !== 0 && exitCode !== 1) {
    const reason = stderrText.trim().slice(0, 500) || 'no stderr';
    throw new Error(`ripgrep exited with ${exitCode}: ${reason}`);
  }
  return { rows, truncated: truncated || state.timedOut, timedOut: state.timedOut };
}
function spawnRipgrep(
  rg: string,
  args: string[],
  opts: RipgrepOptions,
): {
  proc: RipgrepProcess;
  state: RipgrepState;
  dispose(): void;
} {
  const proc = Bun.spawn([rg, ...args], {
    cwd: opts.cwd,
    env: opts.env,
    stdout: 'pipe',
    stderr: 'pipe',
    stdin: 'ignore',
  });
  const state: RipgrepState = {
    truncated: false,
    timedOut: false,
    stopped: false,
    stop(): void {
      if (state.stopped) {
        return;
      }
      state.stopped = true;
      try {
        proc.kill();
      } catch {}
    },
  };
  const timer = setTimeout(() => {
    state.timedOut = true;
    state.stop();
  }, opts.timeoutMs ?? DEFAULT_GREP_TIMEOUT_MS);
  const onAbort = (): void => state.stop();
  if (opts.signal?.aborted) {
    state.stop();
  } else {
    opts.signal?.addEventListener('abort', onAbort, { once: true });
  }
  return {
    proc,
    state,
    dispose(): void {
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onAbort);
    },
  };
}
type PendingRows = {
  file: string;
  rows: RipgrepRow[];
  chars: number;
};
type RowSink = {
  rows: RipgrepRow[];
  chars: number;
};
type RowBudget = {
  limit: number;
  chars: number;
};
type RowBuffers = {
  pending: PendingRows | null;
  truncated: boolean;
  budget: RowBudget;
};
async function readMatchRows(
  proc: RipgrepProcess,
  state: RipgrepState,
  opts: RipgrepOptions,
): Promise<{
  rows: RipgrepRow[];
  truncated: boolean;
}> {
  const sink: RowSink = { rows: [], chars: 0 };
  const buffers: RowBuffers = {
    pending: null,
    truncated: false,
    budget: { limit: opts.limit, chars: opts.budgetChars ?? DEFAULT_GREP_MAX_CHARS },
  };
  try {
    for await (const raw of iterateJsonLines(proc.stdout)) {
      if (state.stopped) {
        break;
      }
      const record = parseRecord(raw);
      if (record === undefined) {
        continue;
      }
      if (acceptRecord(record, sink, buffers)) {
        state.stop();
        break;
      }
    }
  } catch (error) {
    if (!state.stopped) {
      throw error;
    }
  }
  flushPending(sink, buffers.pending);
  return { rows: sink.rows, truncated: buffers.truncated };
}
function flushPending(sink: RowSink, pending: PendingRows | null): void {
  if (pending === null) {
    return;
  }
  sink.rows.push(...pending.rows);
  sink.chars += pending.chars;
}
function acceptRecord(record: RipgrepJsonRecord, sink: RowSink, buffers: RowBuffers): boolean {
  if (record.type === 'end') {
    if (typeof record.data?.binary_offset === 'number') {
      buffers.pending = null;
    } else {
      flushPending(sink, buffers.pending);
      buffers.pending = null;
    }
    return false;
  }
  const row = matchRow(record);
  if (row === undefined) {
    return false;
  }
  if (buffers.pending === null || buffers.pending.file !== row.file) {
    flushPending(sink, buffers.pending);
    buffers.pending = { file: row.file, rows: [], chars: 0 };
  }
  const pending = buffers.pending;
  const cost = row.text.length + row.file.length + 16;
  pending.rows.push(row);
  pending.chars += cost;
  if (
    sink.rows.length + pending.rows.length > buffers.budget.limit ||
    sink.chars + pending.chars > buffers.budget.chars
  ) {
    pending.rows.pop();
    pending.chars -= cost;
    buffers.truncated = true;
    return true;
  }
  return false;
}
async function* iterateJsonLines(stream: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  let discarding = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      let chunk = decoder.decode(value, { stream: true });
      if (discarding) {
        const nl = chunk.indexOf('\n');
        if (nl === -1) {
          continue;
        }
        chunk = chunk.slice(nl + 1);
        discarding = false;
        pending = '';
      }
      pending += chunk;
      let nl = pending.indexOf('\n');
      while (nl !== -1) {
        yield pending.slice(0, nl);
        pending = pending.slice(nl + 1);
        nl = pending.indexOf('\n');
      }
      if (pending.length > MAX_JSON_RECORD_CHARS) {
        discarding = true;
        pending = '';
      }
    }
  } finally {
    reader.cancel().catch(() => undefined);
  }
}
export function clipGrepLine(text: string, maxChars: number = MAX_GREP_LINE_CHARS): string {
  const clean = text.replace(/[\r\n]+$/, '');
  if (clean.length <= maxChars) {
    return clean;
  }
  const clipped = clean.slice(0, maxChars);
  const last = clipped.charCodeAt(clipped.length - 1);
  const safe = last >= 0xd800 && last <= 0xdbff ? clipped.slice(0, -1) : clipped;
  return `${safe}...`;
}
type RipgrepJsonRecord = {
  type?: string;
  data?: {
    path?: {
      text?: string;
    };
    lines?: {
      text?: string;
    };
    line_number?: number;
    binary_offset?: number;
  };
};
function parseRecord(raw: string): RipgrepJsonRecord | undefined {
  if (raw.length === 0) {
    return undefined;
  }
  try {
    return JSON.parse(raw) as RipgrepJsonRecord;
  } catch {
    return undefined;
  }
}
function matchRow(record: RipgrepJsonRecord): RipgrepRow | undefined {
  const pathText = record.data?.path?.text;
  const lineText = record.data?.lines?.text;
  if (record.type !== 'match' || pathText === undefined || lineText === undefined) {
    return undefined;
  }
  return {
    file: pathText,
    line: record.data?.line_number ?? 0,
    text: clipGrepLine(lineText),
  };
}
async function readCappedStream(
  stream: ReadableStream<Uint8Array>,
  capChars: number,
): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = '';
  while (text.length <= capChars) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    text += decoder.decode(value, { stream: true });
  }
  reader.cancel().catch(() => undefined);
  return text;
}
function drainDelay(): Promise<null> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(null), KILL_DRAIN_TIMEOUT_MS);
  });
}
