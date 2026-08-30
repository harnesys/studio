import type { RunResult } from '../domain/run-result.ts';
import type { Event } from '../domain/snapshot.ts';
import { evalExpr } from './expr-eval.ts';
import type { GraphOpts } from './graph.ts';
import { startGraph } from './graph.ts';

export async function runGraph(opts: GraphOpts): Promise<RunResult> {
  let _last: Event | undefined;
  for await (const ev of startGraph(opts)) {
    _last = ev;
  }
  const snap = await opts.state.load();
  const state = (snap?.state as Record<string, unknown>) ?? {};
  const runId = snap?.runId ?? crypto.randomUUID();
  const status = snap?.status ?? 'completed';
  if (status === 'completed') {
    let out: unknown = null;
    const endId = Object.entries(opts.plan.nodes).find(([, n]) => n.type === 'core:end')?.[0];
    if (endId) {
      const en = opts.plan.nodes[endId] as { type: 'core:end'; output?: string };
      if (en.output) {
        try {
          out = evalExpr(en.output, { input: opts.input, state, output: null, resume: null });
        } catch {
          out = null;
        }
      }
    }
    return {
      status: 'completed',
      runId,
      output: out ?? state.messages ?? null,
      state,
      usage: { steps: snap?.cursor?.budget?.steps ?? 0, tokens: snap?.cursor?.budget?.tokens ?? 0 },
    } as RunResult;
  }
  if (status === 'budget_exceeded') {
    return {
      status: 'budget_exceeded',
      runId,
      error: { code: 'budget_exceeded', message: 'budget exceeded' },
      state,
      usage: { steps: 0, tokens: 0 },
    } as RunResult;
  }
  if (status === 'failed') {
    return {
      status: 'failed',
      runId,
      error: { code: 'no_matching_edge', message: 'no matching edge' },
      state,
      usage: { steps: 0, tokens: 0 },
    } as RunResult;
  }
  return {
    status: 'completed',
    runId,
    output: state,
    state,
    usage: { steps: 0, tokens: 0 },
  } as RunResult;
}
