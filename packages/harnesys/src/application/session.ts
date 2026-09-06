import Ajv from 'ajv';
import type { AgentDefinition } from '../domain/agent-definition.ts';
import type { Attachment, AttachmentKind } from '../domain/attachment.ts';
import type { CapabilityRegistration } from '../domain/capability.ts';
import { codedRunError } from '../domain/errors.ts';
import type { Middleware } from '../domain/middleware.ts';
import type { ArtifactStore, SendFile } from '../ports/artifacts.ts';
import type { ModelsPort, ProviderConfig } from '../ports/models.ts';
import type { PathsConfig } from '../ports/paths.ts';
import type { PermissionMap } from '../ports/permissions.ts';
import type { PendingSessionEvent, RunEventStore } from '../ports/run-event-store.ts';
import type { RunLifecycleStore } from '../ports/run-lifecycle-store.ts';
import type { RunTarget, RunTargets } from '../ports/run-targets.ts';
import type { RuntimeState } from '../ports/runtime-state.ts';
import type { SendInput, SessionHandle } from '../ports/session.ts';
import type { ToolDefinition } from '../ports/tools.ts';
import type { LlmNoteProvider } from './llm-notes.ts';
import { resolvePaths } from './paths.ts';
import { resolvePermissions } from './permissions.ts';
import type { RunClaimer } from './run-claimer.ts';
import type { RunEventFeed } from './run-event-feed.ts';

export type RuntimeContext = {
  models: ProviderConfig[] | ModelsPort;
  toolRegistry: Map<string, ToolDefinition>;
  artifacts?: ArtifactStore;
  middleware?: Middleware[];
  permissions?: PermissionMap;
  paths?: PathsConfig;
  notes?: LlmNoteProvider[];
  capabilityRegistrations: CapabilityRegistration[];
  toolMessages: 'barrier' | 'ordered';
  mergeState?: (key: string, a: unknown, b: unknown) => unknown;
  agents: { resolve: (id: string) => AgentDefinition | undefined };
  lifecycle: RunLifecycleStore;
  events: RunEventStore;
  feed: RunEventFeed;
  instanceId: string;
  claimer?: RunClaimer;
  targets?: RunTargets;
};

export type SessionOpts = {
  state?: RuntimeState;
  permissions?: PermissionMap;
  paths?: PathsConfig;
};

function memoryState(): RuntimeState {
  return {
    sessionId: crypto.randomUUID(),
    load: async () => null,
    commit: async () => {},
    child: () => ({
      sessionId: '',
      load: async () => null,
      commit: async () => {},
      child: () => null as never,
    }),
  };
}

function normalizeSendInput(input: SendInput): {
  text: string;
  attachments?: Attachment[];
  origin?: string;
} {
  if (typeof input === 'string') {
    return { text: input };
  }
  const attachments: Attachment[] = [...(input.attachments ?? [])];
  const pushFiles = (files: SendFile[] | undefined, kind: AttachmentKind): void => {
    if (!files) {
      return;
    }
    for (const file of files) {
      const rawName = file.name ?? ('path' in file ? file.path : '');
      const name = rawName.split(/[\\/]/).at(-1) ?? 'file';
      attachments.push({
        id: crypto.randomUUID(),
        kind,
        name: name || 'file',
        mediaType: file.mediaType ?? '',
        path: 'path' in file ? file.path : '',
      });
    }
  };
  pushFiles(input.images, 'image');
  pushFiles(input.audio, 'audio');
  pushFiles(input.video, 'video');
  pushFiles(input.files, 'file');
  return {
    text: input.text ?? '',
    attachments: attachments.length > 0 ? attachments : undefined,
    origin: input.origin,
  };
}

function toolOperationsOf(registry: Map<string, ToolDefinition>): string[] {
  const ops: string[] = [];
  for (const [, toolDef] of registry) {
    if (toolDef.operations) {
      ops.push(...toolDef.operations);
    }
  }
  return ops;
}

export function createSession(
  agent: AgentDefinition | string,
  opts: SessionOpts,
  ctx: RuntimeContext,
): SessionHandle {
  const state = opts.state ?? memoryState();
  const def = typeof agent !== 'string' ? agent : ctx.agents.resolve(agent);
  if (!def) {
    throw new Error(`agent "${agent}" not found`);
  }
  const targets: RunTargets = ctx.targets ?? {
    resolve: (threadId: string): Promise<RunTarget | null> => {
      if (threadId !== state.sessionId) {
        return Promise.resolve(null);
      }
      return Promise.resolve({
        state,
        agent: def,
        permissions: resolvePermissions(
          toolOperationsOf(ctx.toolRegistry),
          opts.permissions,
          ctx.permissions,
        ),
        paths: resolvePaths(def.paths, ctx.paths, opts.paths),
        notes: ctx.notes,
        capabilities: ctx.capabilityRegistrations,
      });
    },
  };

  return {
    async send(input, sendOpts) {
      const threadId = state.sessionId;
      const active = await ctx.lifecycle.activeByThread(threadId);
      if (active !== null) {
        if (active.status === 'needs_input') {
          throw codedRunError('pending_ask', `thread ${threadId} waits for input`);
        }
        throw codedRunError(
          'thread_busy',
          `thread ${threadId} already has active run ${active.runId}`,
        );
      }
      const runId = crypto.randomUUID();
      const normalized = normalizeSendInput(input);
      const userEvent = {
        type: 'user',
        text: normalized.text,
        attachments: normalized.attachments,
        origin: normalized.origin,
        clientEventId: sendOpts?.clientEventId,
      } as PendingSessionEvent;
      await ctx.lifecycle.create({ runId, threadId }, [userEvent]);
      ctx.claimer?.kick();
      return { runId };
    },

    async respond(runId, askId, payload, respondOpts) {
      const rec = await ctx.lifecycle.get(runId);
      if (rec === null) {
        throw codedRunError('unknown_run', `run ${runId} not found`);
      }
      if (rec.status === 'completed') {
        throw codedRunError('run_terminal', `run ${runId} is terminal`);
      }
      if (rec.status !== 'needs_input') {
        throw codedRunError('already_resumed', `run ${runId} is ${rec.status}`);
      }
      if (rec.interruptId !== askId) {
        throw codedRunError('unknown_interrupt', `run ${runId} has no interrupt ${askId}`);
      }
      const target = await targets.resolve(rec.threadId);
      const schema = (await target?.state.load())?.cursor.interrupt?.resumeSchema;
      if (schema !== undefined) {
        const ajv = new Ajv({ strict: false });
        if (!ajv.validate(schema as object, payload)) {
          throw codedRunError(
            'resume_validation_failed',
            `resume payload validation failed: ${ajv.errorsText()}`,
          );
        }
      }
      const answer = {
        type: 'hitl.answer',
        interruptId: askId,
        payload,
        clientEventId: respondOpts?.clientEventId,
      } as PendingSessionEvent;
      await ctx.lifecycle.transition(runId, rec.leaseEpoch, {
        from: 'needs_input',
        to: 'queued',
        interruptId: null,
        events: [answer],
      });
      ctx.claimer?.kick();
    },

    async reject(runId, askId, rejectOpts) {
      const rec = await ctx.lifecycle.get(runId);
      if (rec === null) {
        throw codedRunError('unknown_run', `run ${runId} not found`);
      }
      if (rec.status === 'completed') {
        throw codedRunError('run_terminal', `run ${runId} is terminal`);
      }
      if (rec.status !== 'needs_input') {
        throw codedRunError('already_resumed', `run ${runId} is ${rec.status}`);
      }
      if (rec.interruptId !== askId) {
        throw codedRunError('unknown_interrupt', `run ${runId} has no interrupt ${askId}`);
      }
      const answer = {
        type: 'hitl.answer',
        interruptId: askId,
        rejected: true,
        note: rejectOpts?.note,
        clientEventId: rejectOpts?.clientEventId,
      } as PendingSessionEvent;
      await ctx.lifecycle.transition(runId, rec.leaseEpoch, {
        from: 'needs_input',
        to: 'queued',
        interruptId: null,
        events: [answer],
      });
      ctx.claimer?.kick();
    },

    async cancel(runId) {
      const rec = await ctx.lifecycle.get(runId);
      if (rec === null) {
        throw codedRunError('unknown_run', `run ${runId} not found`);
      }
      const cancelled = {
        type: 'run.cancelled',
        reason: 'run cancelled',
      } as PendingSessionEvent;
      await ctx.lifecycle.transition(runId, rec.leaseEpoch, {
        from: rec.status,
        to: 'cancelled',
        events: [cancelled],
      });
    },

    subscribe(runId, fromSeq) {
      return ctx.feed.subscribe(runId, fromSeq ?? 0);
    },

    runOf(runId) {
      return ctx.lifecycle.get(runId);
    },

    activeRun(threadId) {
      return ctx.lifecycle.activeByThread(threadId);
    },
  };
}
