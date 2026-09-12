import type { AgentDefinition } from '../domain/agent-definition.ts';
import type { Attachment } from '../domain/attachment.ts';
import type { Event } from '../domain/snapshot.ts';
import type { Logger } from '../ports/logger.ts';
import { compileOrThrow } from './compile.ts';
import type { GraphOpts } from './graph.ts';
import { abandonForeignSnapshot } from './graph-snap.ts';
import { createHookBus } from './hooks/bus.ts';
import type { HookEmitCtx } from './hooks/emit-hook.ts';
import type { PackRunMap } from './packs/pack-run.ts';
import { attachPackRun, reusePackRun } from './packs/pack-run.ts';
import type { RunEngineDeps, RunTargetOpts } from './run-engine-types.ts';
import { filterToolsForAgent } from './tool-registry.ts';
import { createLoadToolsTool } from './tools/create-load-tools-tool.ts';
import { LOAD_TOOLS_NAME } from './tools/exposure.ts';

type HitlAnswer = {
  interruptId: string;
  payload?: unknown;
  rejected?: boolean;
};

type UserInput = {
  text: string;
  attachments?: Attachment[];
  origin?: string;
  effort?: string;
};

async function findLastAnswer(deps: RunEngineDeps, runId: string): Promise<HitlAnswer | null> {
  const history = await deps.events.tail(runId, 0);
  let last: HitlAnswer | null = null;
  for (const event of history) {
    if (event.type === 'hitl.answer') {
      last = { interruptId: event.interruptId, payload: event.payload, rejected: event.rejected };
    }
  }
  return last;
}

async function findFirstUser(deps: RunEngineDeps, runId: string): Promise<UserInput | null> {
  const history = await deps.events.tail(runId, 0);
  for (const event of history) {
    if (event.type === 'user') {
      return {
        text: event.text,
        attachments: event.attachments,
        origin: event.origin,
        effort: event.effort,
      };
    }
  }
  return null;
}

function withMessageEffort(agent: AgentDefinition, effort: string | undefined): AgentDefinition {
  if (!effort || !agent.model) {
    return agent;
  }
  return {
    ...agent,
    model: { ...agent.model, effort },
  };
}

export type PrepareExecuteGraphOptsArgs = {
  deps: RunEngineDeps;
  opts: RunTargetOpts;
  runId: string;
  signal: AbortSignal;
  packCache: Map<string, PackRunMap>;
  /** Per-run hook buses; segments reuse the bus, terminal run closes it (run-engine). */
  hookCache: Map<string, HookEmitCtx>;
  runLogger: Logger;
  childJournal: (spawnId: string, ev: Event) => void;
};

/** HITL/user lookup, compile, tool registry, packs, hook bus → GraphOpts for one segment. */
export async function prepareExecuteGraphOpts(
  args: PrepareExecuteGraphOptsArgs,
): Promise<GraphOpts> {
  const { deps, opts, runId, signal, packCache, hookCache, runLogger, childJournal } = args;
  const answer = await findLastAnswer(deps, runId);
  if (answer === null) {
    await abandonForeignSnapshot(opts.state, runId);
  }
  const snap = await opts.state.load();
  const firstUser = await findFirstUser(deps, runId);
  const user = answer === null ? firstUser : null;
  const agent = withMessageEffort(opts.agent, firstUser?.effort);
  const plan = compileOrThrow(agent);
  const startNodeId = answer === null ? undefined : snap?.cursor.interrupt?.nodeId;
  const runRegistry = new Map(filterToolsForAgent(opts.toolRegistry ?? deps.toolRegistry, agent));
  runRegistry.set(LOAD_TOOLS_NAME, createLoadToolsTool(runRegistry));
  let packOutputs = opts.packOutputs;
  if (packOutputs !== undefined) {
    // Prebuilt map (oneshot path): tools are attached upstream.
    packCache.set(runId, packOutputs);
  } else {
    const cached = packCache.get(runId);
    if (cached !== undefined) {
      packOutputs = reusePackRun({
        def: agent,
        cached,
        runRegistry,
        fsSkills: opts.skills ?? deps.skills,
        deferredPacks: opts.deferredPacks ?? deps.deferredPacks,
        logger: runLogger,
      });
    } else {
      packOutputs = attachPackRun({
        def: agent,
        registrations: opts.packs ?? deps.packRegistrations ?? [],
        runRegistry,
        fsSkills: opts.skills ?? deps.skills,
        deferredPacks: opts.deferredPacks ?? deps.deferredPacks,
        logger: runLogger,
      });
      packCache.set(runId, packOutputs);
    }
  }
  const cwd = opts.paths?.cwd ?? '';
  let hooksEmit = opts.hooksEmit;
  if (hooksEmit === undefined) {
    const cached = hookCache.get(runId);
    if (cached !== undefined) {
      hooksEmit = cached;
    } else {
      const bindings = [...(deps.hooks ?? []), ...(opts.hooks ?? [])];
      if (bindings.length > 0) {
        // envBase — шов хоста (E2): HARNESSYS_PLUGIN_OPTION_* составляются хостом.
        hooksEmit = {
          bus: createHookBus({ bindings, ctx: { cwd, projectDir: cwd, envBase: {} } }),
          sessionId: opts.state.sessionId,
          runId,
          agentId: agent.id,
          threadId: opts.state.sessionId,
          cwd,
          permissionMode: '',
        };
        hookCache.set(runId, hooksEmit);
      }
    }
  }
  return {
    agent,
    input: answer === null ? (user ?? snap?.initialInput ?? null) : null,
    // Ввод уже записан в лог жизненным циклом (SessionHandle.send):
    // граф не должен коммитить user.message второй раз.
    inputRecorded: answer === null && user !== null,
    state: opts.state,
    permissions: opts.permissions,
    paths: opts.paths,
    artifacts: deps.artifacts,
    models: deps.models,
    toolRegistry: runRegistry,
    plan,
    toolMessages: deps.toolMessages,
    mergeState: deps.mergeState,
    signal,
    startNodeId,
    notes: opts.notes,
    skills: opts.skills ?? deps.skills,
    packOutputs,
    hooks: hooksEmit,
    agents: deps.agents,
    outputHint: startNodeId === undefined ? undefined : (snap?.cursor.interrupt?.output ?? null),
    rejected: answer?.rejected === true,
    resumePayload: answer?.payload,
    resumeInterruptId: answer?.interruptId,
    childJournal,
    logger: runLogger,
  };
}
