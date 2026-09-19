import {
  createRunEventBus,
  InMemoryRunEventStore,
  InMemoryRunLifecycleStore,
} from '../adapters/in-memory-run-store.ts';
import type { Attachment } from '../domain/attachment.ts';
import { codedRunError } from '../domain/errors.ts';
import type { JsonSchema } from '../domain/json-schema.ts';
import type { RunResult } from '../domain/run-result.ts';
import type { PendingSessionEvent } from '../ports/run-event-store.ts';
import type { RuntimeState } from '../ports/runtime-state.ts';
import type { GraphOpts } from './graph.ts';
import { createRunEngine } from './run-engine.ts';
import { createRunEventFeed } from './run-event-feed.ts';

function inputToUserEvent(input: unknown): PendingSessionEvent {
  if (typeof input === 'string') {
    return { type: 'user', text: input } as PendingSessionEvent;
  }
  const rec = (input ?? {}) as Record<string, unknown>;
  return {
    type: 'user',
    text: typeof rec.text === 'string' ? rec.text : '',
    attachments: Array.isArray(rec.attachments) ? (rec.attachments as Attachment[]) : undefined,
    origin: typeof rec.origin === 'string' ? rec.origin : undefined,
    effort: typeof rec.effort === 'string' ? rec.effort : undefined,
  } as PendingSessionEvent;
}
export async function runGraph(opts: GraphOpts): Promise<RunResult> {
  if (
    opts.resumePayload !== undefined ||
    opts.rejected === true ||
    opts.startNodeId !== undefined
  ) {
    throw codedRunError('resume_removed', 'runGraph resume removed: use SessionHandle.respond');
  }
  const events = new InMemoryRunEventStore();
  const lifecycle = new InMemoryRunLifecycleStore(events);
  const feed = createRunEventFeed({ events, lifecycle, bus: createRunEventBus() });
  const threadId = opts.state.sessionId;
  const loaded = await opts.state.load();
  const runId = loaded?.runId ?? crypto.randomUUID();
  await lifecycle.create({ runId, threadId }, [inputToUserEvent(opts.input)]);
  const claimed = await lifecycle.claim(runId, 'oneshot', 15000);
  if (claimed === null) {
    throw Object.assign(new Error(`run ${runId} was not claimed`), { code: 'claim_failed' });
  }
  const engine = createRunEngine({
    lifecycle,
    events,
    feed,
    instanceId: 'oneshot',
    models: opts.models,
    toolRegistry: opts.toolRegistry,
    toolMessages: opts.toolMessages,
    mergeState: opts.mergeState,
    artifacts: opts.artifacts,
    packRegistrations: [...(opts.packOutputs?.values() ?? [])].map((e) => e.reg),
    agents: opts.agents,
    logger: opts.logger,
  });
  await engine.execute(runId, {
    state: opts.state,
    agent: opts.agent,
    permissions: opts.permissions,
    paths: opts.paths,
    notes: opts.notes,
    capabilitySet: opts.capabilitySet,
    universe: opts.universe,
    skills: opts.skills,
    hooksEmit: opts.hooks,
  });
  for (let i = 0; i < 200; i += 1) {
    const rec = await lifecycle.get(runId);
    if (rec === null || (rec.status !== 'running' && rec.status !== 'queued')) {
      break;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }
  return resultFromState(opts.state, runId);
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
  if (status === 'needs_input' || status === 'waiting') {
    const cursor = snap?.cursor as Record<string, unknown> | undefined;
    const interrupt = cursor?.interrupt as
      | {
          interruptId: string;
          reason: string;
          resumeSchema: JsonSchema;
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
  if (status === 'timed_out') {
    return {
      status: 'timed_out',
      runId: id,
      error: { code: 'map_timeout', message: 'run timed out' },
      state: rec,
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
