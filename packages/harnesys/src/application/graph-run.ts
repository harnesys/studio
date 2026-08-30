import type { RunResult } from '../domain/run-result.ts';
import type { Event } from '../domain/snapshot.ts';
import type { GraphOpts } from './graph.ts';
import { startGraph } from './graph.ts';

export async function runGraph(opts: GraphOpts): Promise<RunResult> {
  let last: Event | undefined;
  for await (const ev of startGraph(opts)) {
    last = ev;
  }
  void last;
  const snap = await opts.state.load();
  const state = (snap?.state as Record<string, unknown>) ?? {};
  const runId = snap?.runId ?? crypto.randomUUID();
  const status = snap?.status ?? 'completed';
  const usage = {
    steps: snap?.cursor?.budget?.steps ?? 0,
    tokens: snap?.cursor?.budget?.tokens ?? 0,
  };
  if (status === 'completed') {
    const msgs = state.messages;
    return {
      status: 'completed',
      runId,
      output: Array.isArray(msgs) && msgs.length > 0 ? msgs[msgs.length - 1] : state,
      state,
      usage,
    } as RunResult;
  }
  if (status === 'budget_exceeded') {
    return {
      status: 'budget_exceeded',
      runId,
      error: { code: 'budget_exceeded', message: 'budget exceeded' },
      state,
      usage,
    } as RunResult;
  }
  return {
    status: 'failed',
    runId,
    error: { code: status, message: `run failed: ${status}` },
    state,
    usage,
  } as RunResult;
}
