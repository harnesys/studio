import type { RunResult } from '../domain/run-result.ts';
import type { RuntimeState } from '../ports/runtime-state.ts';
import type { GraphOpts } from './graph.ts';
import { createRunEngine } from './run-engine.ts';

export async function runGraph(opts: GraphOpts): Promise<RunResult> {
  const loaded = await opts.state.load();
  const runId = loaded?.runId ?? crypto.randomUUID();
  const engine = createRunEngine({ graphOpts: opts, runId });
  if (loaded?.status === 'needs_input' && (opts.resumePayload !== undefined || opts.rejected)) {
    await engine.recover();
    if (opts.rejected) {
      const interrupt = interruptFrom(loaded);
      await engine.command({ type: 'reject', interruptId: interrupt });
    } else {
      const interrupt = interruptFrom(loaded);
      await engine.command({
        type: 'resume',
        interruptId: interrupt,
        payload: opts.resumePayload,
      });
    }
    await engine.untilIdle();
  } else {
    await engine.start();
  }
  return resultFromState(opts.state, runId);
}

function interruptFrom(loaded: { cursor?: unknown }): string {
  const cursor = loaded.cursor as Record<string, unknown> | undefined;
  const interrupt = cursor?.interrupt as Record<string, unknown> | undefined;
  return typeof interrupt?.interruptId === 'string' ? interrupt.interruptId : '';
}

export async function resultFromState(state: RuntimeState, runId: string): Promise<RunResult> {
  const snap = await state.load();
  const rec = (snap?.state as Record<string, unknown>) ?? {};
  const id = snap?.runId ?? runId;
  const status = snap?.status ?? 'completed';
  const usage = {
    steps: snap?.cursor?.budget?.steps ?? 0,
    tokens: snap?.cursor?.budget?.tokens ?? 0,
  };
  if (status === 'completed') {
    const msgs = rec.messages;
    return {
      status: 'completed',
      runId: id,
      output: Array.isArray(msgs) && msgs.length > 0 ? msgs[msgs.length - 1] : rec,
      state: rec,
      usage,
    };
  }
  if (status === 'budget_exceeded') {
    return {
      status: 'budget_exceeded',
      runId: id,
      error: { code: 'budget_exceeded', message: 'budget exceeded' },
      state: rec,
      usage,
    };
  }
  if (status === 'needs_input') {
    const cursor = snap?.cursor as Record<string, unknown> | undefined;
    const interrupt = cursor?.interrupt as
      | {
          interruptId: string;
          reason: string;
          resumeSchema: unknown;
          nodeId: string;
        }
      | undefined;
    return {
      status: 'needs_input',
      runId: id,
      interrupt: interrupt ?? { interruptId: '', reason: 'unknown', resumeSchema: {}, nodeId: '' },
      usage,
    };
  }
  if (status === 'cancelled') {
    return { status: 'cancelled', runId: id, state: rec, usage };
  }
  return {
    status: 'failed',
    runId: id,
    error: { code: status, message: `run failed: ${status}` },
    state: rec,
    usage,
  };
}
