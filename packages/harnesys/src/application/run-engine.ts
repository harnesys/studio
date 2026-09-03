import Ajv from 'ajv';
import type { Command } from '../domain/run-result.ts';
import type { JsonSchema } from '../domain/json-schema.ts';
import type { RuntimeState } from '../ports/runtime-state.ts';
import type { SessionEvent } from '../ports/session.ts';
import { type GraphOpts, startGraph } from './graph.ts';
import { canonicalJson } from './graph-edges.ts';
import { eventToSessionEvent } from './run-engine-events.ts';
import { createSessionEventLog } from './run-engine-stream.ts';

export type RunEngineStatus = 'running' | 'needs_input' | 'completed' | 'failed' | 'cancelled';

export type RunEngine = {
  readonly status: RunEngineStatus;
  readonly runId: string;
  start(): Promise<void>;
  recover(): Promise<void>;
  untilIdle(): Promise<void>;
  command(cmd: Command): Promise<void>;
  stream(): AsyncIterable<SessionEvent>;
  output: Promise<{ text: string }>;
  close(): Promise<void>;
};

type AskSource = 'permission' | 'approve' | 'middleware' | 'interrupt' | 'ask_user';

type ActiveInterrupt = {
  interruptId: string;
  schema: JsonSchema;
  nodeId: string;
  source?: AskSource;
};

type QueuedCommand = {
  cmd: Command;
  resolve: () => void;
  reject: (err: unknown) => void;
};

function isTerminal(status: RunEngineStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled';
}

function codedError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

function asAskSource(value: unknown): AskSource {
  if (
    value === 'permission' ||
    value === 'approve' ||
    value === 'middleware' ||
    value === 'interrupt' ||
    value === 'ask_user'
  ) {
    return value;
  }
  return 'interrupt';
}

function resumeSchema(schema: JsonSchema): object {
  if (typeof schema !== 'object' || schema === null) {
    return {};
  }
  const { options: _o, multi: _m, ...rest } = schema as Record<string, unknown>;
  return rest;
}

export type CreateRunEngineArgs = {
  graphOpts: GraphOpts;
  runId: string;
};

export function createRunEngine(args: CreateRunEngineArgs): RunEngine {
  return new RunEngineImpl(args.graphOpts, args.runId);
}

class RunEngineImpl implements RunEngine {
  status: RunEngineStatus = 'running';
  readonly runId: string;
  readonly output: Promise<{ text: string }>;
  private readonly graphOpts: GraphOpts;
  private readonly state: RuntimeState;
  private readonly events = createSessionEventLog();
  private interrupt: ActiveInterrupt | null = null;
  private applied: { interruptId: string; payload: unknown } | null = null;
  private idleWaits: Array<() => void> = [];
  private readonly queue: QueuedCommand[] = [];
  private drainingQueue = false;
  private segmentAbort = new AbortController();
  private outputResolve!: (v: { text: string }) => void;
  private outputSettled = false;
  private started = false;

  constructor(graphOpts: GraphOpts, runId: string) {
    this.graphOpts = graphOpts;
    this.state = graphOpts.state;
    this.runId = runId;
    this.output = new Promise((resolve) => {
      this.outputResolve = resolve;
    });
  }

  private settleOutput(text: string): void {
    if (this.outputSettled) {
      return;
    }
    this.outputSettled = true;
    this.outputResolve({ text });
  }

  private emit(event: SessionEvent): void {
    this.events.emit(event);
  }

  private notifyIdle(): void {
    const waits = this.idleWaits;
    this.idleWaits = [];
    for (const w of waits) {
      w();
    }
  }

  async untilIdle(): Promise<void> {
    if (this.status !== 'running') {
      return;
    }
    await new Promise<void>((resolve) => {
      this.idleWaits.push(resolve);
    });
  }

  async start(): Promise<void> {
    if (this.started) {
      await this.untilIdle();
      return;
    }
    this.started = true;
    this.status = 'running';
    await this.runSegment({ ...this.graphOpts });
  }

  async recover(): Promise<void> {
    if (this.started) {
      return;
    }
    const snap = await this.state.load();
    if (snap?.status !== 'needs_input') {
      await this.start();
      return;
    }
    const cursor = snap.cursor as Record<string, unknown>;
    const raw = cursor.interrupt as Record<string, unknown> | undefined;
    if (!raw?.interruptId) {
      await this.start();
      return;
    }
    this.started = true;
    const schema = (raw.resumeSchema as JsonSchema) ?? {};
    const source = asAskSource(raw.source);
    this.interrupt = {
      interruptId: String(raw.interruptId),
      schema,
      nodeId: String(raw.nodeId ?? ''),
      source,
    };
    this.status = 'needs_input';
    this.emit({
      type: 'ask',
      askId: this.interrupt.interruptId,
      schema,
      source,
      prompt: typeof raw.reason === 'string' ? raw.reason : undefined,
      tool: raw.tool as { name: string; input: unknown; toolCallId: string } | undefined,
    });
    this.notifyIdle();
  }

  private parkAsk(mapped: Extract<SessionEvent, { type: 'ask' }>, nodeId: string, schema: JsonSchema): void {
    this.interrupt = {
      interruptId: mapped.askId,
      schema,
      nodeId,
      source: mapped.source,
    };
    this.status = 'needs_input';
  }

  private async runSegment(opts: GraphOpts): Promise<void> {
    this.segmentAbort = new AbortController();
    const iter = startGraph({ ...opts, signal: this.segmentAbort.signal });
    let terminalFromGraph = false;
    try {
      for await (const ev of iter) {
        const mapped = eventToSessionEvent(ev);
        if (!mapped) {
          continue;
        }
        this.emit(mapped);
        if (mapped.type === 'ask') {
          const snap = await this.state.load();
          const stored = (snap?.cursor as Record<string, unknown> | undefined)?.interrupt as
            | Record<string, unknown>
            | undefined;
          const nodeId = typeof stored?.nodeId === 'string' ? stored.nodeId : '';
          const schema = (stored?.resumeSchema as JsonSchema | undefined) ?? mapped.schema;
          this.parkAsk(mapped, nodeId, schema);
        }
        if (mapped.type === 'done' || mapped.type === 'error') {
          terminalFromGraph = true;
        }
      }
      if (this.status === 'needs_input') {
        return;
      }
      await this.finishFromSnapshot(terminalFromGraph);
    } catch (err) {
      this.status = 'failed';
      this.emit({
        type: 'error',
        code: String((err as { code?: string }).code ?? 'run_failed'),
        message: (err as Error).message ?? 'run failed',
      });
      this.settleOutput('');
    } finally {
      this.notifyIdle();
      void this.drainQueue();
    }
  }

  private async finishFromSnapshot(terminalFromGraph: boolean): Promise<void> {
    const snap = await this.state.load();
    const finalStatus = snap?.status ?? 'completed';
    if (finalStatus === 'needs_input') {
      this.status = 'needs_input';
      return;
    }
    if (finalStatus === 'completed') {
      this.status = 'completed';
      const msgs = (snap?.state as Record<string, unknown> | undefined)?.messages;
      const lastText =
        Array.isArray(msgs) && msgs.length > 0
          ? String((msgs[msgs.length - 1] as Record<string, unknown>)?.content ?? '')
          : '';
      if (!terminalFromGraph) {
        this.emit({ type: 'done', text: lastText || undefined });
      }
      this.settleOutput(lastText);
      return;
    }
    this.status = finalStatus === 'cancelled' ? 'cancelled' : 'failed';
    if (!terminalFromGraph) {
      this.emit({
        type: 'error',
        code: finalStatus === 'cancelled' ? 'cancelled' : String(finalStatus),
        message: finalStatus === 'cancelled' ? 'run cancelled' : `run failed: ${finalStatus}`,
      });
    }
    this.settleOutput('');
  }

  private launchSegment(opts: GraphOpts): void {
    void this.runSegment(opts);
  }

  private async apply(cmd: Command): Promise<void> {
    if (cmd.type === 'cancel') {
      this.segmentAbort.abort();
      this.status = 'cancelled';
      this.emit({ type: 'error', code: 'cancelled', message: 'run cancelled' });
      this.settleOutput('');
      this.notifyIdle();
      return;
    }

    if (this.applied && this.applied.interruptId === cmd.interruptId) {
      if (cmd.type === 'resume' && canonicalJson(this.applied.payload) === canonicalJson(cmd.payload)) {
        return;
      }
      throw codedError('already_resumed', 'interrupt already resumed with different payload');
    }

    if (!this.interrupt || this.interrupt.interruptId !== cmd.interruptId) {
      return;
    }

    const snap = await this.state.load();
    const stored = (snap?.cursor as Record<string, unknown> | undefined)?.interrupt as
      | Record<string, unknown>
      | undefined;
    const startNodeId =
      this.interrupt.nodeId || (typeof stored?.nodeId === 'string' ? stored.nodeId : undefined);

    if (cmd.type === 'reject') {
      if (this.interrupt.source === 'approve') {
        await this.apply({
          type: 'resume',
          interruptId: cmd.interruptId,
          payload: { approved: false, reason: cmd.note },
        });
        return;
      }
      this.interrupt = null;
      this.status = 'running';
      this.launchSegment({
        ...this.graphOpts,
        startNodeId,
        rejected: true,
        resumePayload: undefined,
        signal: this.segmentAbort.signal,
      });
      return;
    }

    const schema = resumeSchema(this.interrupt.schema);
    const ajv = new Ajv({ strict: false });
    const valid = ajv.validate(schema, cmd.payload);
    if (!valid) {
      this.emit({
        type: 'error',
        code: 'resume_validation_failed',
        message: ajv.errorsText(),
      });
      throw codedError('resume_validation_failed', `resume payload validation failed: ${ajv.errorsText()}`);
    }

    this.applied = { interruptId: cmd.interruptId, payload: cmd.payload };
    this.interrupt = null;
    this.status = 'running';
    this.emit({ type: 'resumed' });
    this.launchSegment({
      ...this.graphOpts,
      resumePayload: cmd.payload,
      startNodeId,
      rejected: false,
      signal: this.segmentAbort.signal,
    });
  }

  private async drainQueue(): Promise<void> {
    if (this.drainingQueue) {
      return;
    }
    this.drainingQueue = true;
    try {
      while (this.queue.length > 0) {
        const next = this.queue[0];
        if (!next) {
          break;
        }
        if (next.cmd.type !== 'cancel' && this.status === 'running') {
          break;
        }
        this.queue.shift();
        if (isTerminal(this.status) && next.cmd.type !== 'cancel') {
          next.resolve();
          continue;
        }
        try {
          await this.apply(next.cmd);
          next.resolve();
        } catch (err) {
          next.reject(err);
        }
      }
    } finally {
      this.drainingQueue = false;
    }
  }

  command(cmd: Command): Promise<void> {
    return new Promise((resolve, reject) => {
      this.queue.push({ cmd, resolve, reject });
      void this.drainQueue();
    });
  }

  stream(): AsyncIterable<SessionEvent> {
    return this.events.stream(() => isTerminal(this.status));
  }

  async close(): Promise<void> {
    this.segmentAbort.abort();
  }
}
