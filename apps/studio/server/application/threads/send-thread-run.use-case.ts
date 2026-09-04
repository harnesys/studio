import type { Attachment, SendFile, SendInput } from 'harnesys';
import type { AcceptedRunResponse, ThreadPlanRecord } from '../../../shared/types.ts';
import type { ThreadRuntimeRegistry } from '../../adapters/thread-runtime.registry.ts';
import { isRunMode, type RunMode } from '../../adapters/tool-confirm-policy.ts';
import type { WorkspaceHarnesysRegistry } from '../../adapters/workspace-harnesys.registry.ts';
import type { AgentRepository } from '../../domain/agent.port.ts';
import type { AttachmentRepository } from '../../domain/attachment.port.ts';
import type { DeskEventsPort } from '../../domain/desk-events.port.ts';
import type { LlmModelRepository, LlmProviderRepository } from '../../domain/llm-provider.port.ts';
import { NotFoundError, RunConflictError, ValidationError } from '../../domain/studio.error.ts';
import type { ThreadRepository } from '../../domain/thread.port.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';
import type { GetThreadPlanInput } from '../plans/get-thread-plan.use-case.ts';
import { kindFromMediaType } from './attachment-kind.ts';
import type { GetThreadInput } from './get-thread.use-case.ts';
import { PLAN_MODE_PROMPT, planFollowPrompt } from './plan-mode-prompt.ts';
import { publishDeskThread } from './publish-desk-thread.ts';

export type SendThreadRunRequest = {
  threadId: string;
  text?: string;
  attachmentIds?: string[];
  mode?: RunMode;
  origin?: string;
  foldHistory?: unknown[];
  clientEventId?: string;
};

export type SendThreadRunInput = {
  execute(request: SendThreadRunRequest): Promise<AcceptedRunResponse>;
};

export type SendThreadRunDeps = {
  threads: ThreadRepository;
  agents: AgentRepository;
  models: LlmModelRepository;
  providers: LlmProviderRepository;
  workspaces: WorkspaceRepository;
  attachments: AttachmentRepository;
  workspaceHarnesys: WorkspaceHarnesysRegistry;
  registry: ThreadRuntimeRegistry;
  deskEvents: DeskEventsPort;
  getThread: GetThreadInput;
  getThreadPlan?: GetThreadPlanInput;
};

export class SendThreadRunUseCase implements SendThreadRunInput {
  private readonly threads: ThreadRepository;
  private readonly agents: AgentRepository;
  private readonly models: LlmModelRepository;
  private readonly providers: LlmProviderRepository;
  private readonly workspaces: WorkspaceRepository;
  private readonly attachments: AttachmentRepository;
  private readonly workspaceHarnesys: WorkspaceHarnesysRegistry;
  private readonly registry: ThreadRuntimeRegistry;
  private readonly deskEvents: DeskEventsPort;
  private readonly getThread: GetThreadInput;
  private readonly getThreadPlan: GetThreadPlanInput | undefined;

  constructor(deps: SendThreadRunDeps) {
    this.threads = deps.threads;
    this.agents = deps.agents;
    this.models = deps.models;
    this.providers = deps.providers;
    this.workspaces = deps.workspaces;
    this.attachments = deps.attachments;
    this.workspaceHarnesys = deps.workspaceHarnesys;
    this.registry = deps.registry;
    this.deskEvents = deps.deskEvents;
    this.getThread = deps.getThread;
    this.getThreadPlan = deps.getThreadPlan;
  }

  async execute(request: SendThreadRunRequest): Promise<AcceptedRunResponse> {
    const thread = this.threads.findById(request.threadId);
    if (!thread) {
      throw new NotFoundError('thread not found');
    }

    const agentRow = this.agents.findById(thread.agentId);
    if (!agentRow) {
      throw new NotFoundError('agent not found');
    }
    if (!agentRow.modelId) {
      throw new ValidationError('agent has no model');
    }

    const model = this.models.findById(agentRow.modelId);
    if (!model) {
      throw new NotFoundError('model not found');
    }
    const provider = this.providers.findById(model.providerId);
    if (!provider) {
      throw new NotFoundError('provider not found');
    }

    const workspace = this.workspaces.findById(thread.workspaceId);
    if (!workspace) {
      throw new NotFoundError('workspace not found');
    }

    const input = buildSendInput(request, this.attachments, request.threadId);
    const runMode = resolveRunMode(request.mode);
    input.text = await this.decorateText(request.threadId, runMode, input.text);

    const hx = await this.workspaceHarnesys.get(workspace);
    const handle = await this.registry.threadOf(thread.id, hx, agentRow.id, workspace.path);
    const clientEventId = request.clientEventId ?? crypto.randomUUID();
    try {
      const { runId } = await handle.send(input, { clientEventId });
      this.publishThread(thread.id);
      return { runId, status: 'queued' as const };
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === 'pending_ask') {
        const active = await handle.activeRun(thread.id);
        throw new RunConflictError({ pendingAskId: active?.interruptId, runId: active?.runId });
      }
      if (code === 'thread_busy') {
        const active = await handle.activeRun(thread.id);
        throw new RunConflictError({ runId: active?.runId });
      }
      throw error;
    }
  }

  /** Injects plan-mode contract or the active-plan reminder into the outgoing text. */
  private async decorateText(
    threadId: string,
    runMode: RunMode,
    text: string | undefined,
  ): Promise<string | undefined> {
    if (runMode === 'plan') {
      return text ? `${PLAN_MODE_PROMPT}\n\n${text}` : PLAN_MODE_PROMPT;
    }
    if (!this.getThreadPlan) {
      return text;
    }
    let plan: ThreadPlanRecord | null = null;
    try {
      plan = await this.getThreadPlan.execute({ threadId });
    } catch {
      return text;
    }
    if (!plan || plan.status === 'completed' || plan.status === 'cancelled') {
      return text;
    }
    const next =
      plan.items.find((item) => item.status === 'in_progress') ??
      plan.items.find((item) => item.status === 'pending');
    if (!next) {
      return text;
    }
    const reminder = planFollowPrompt(plan, next);
    return text ? `${reminder}\n\n${text}` : reminder;
  }
  private publishThread(threadId: string): void {
    publishDeskThread(this.getThread, this.deskEvents, threadId);
  }
}

function resolveRunMode(mode: RunMode | undefined): RunMode {
  if (mode && isRunMode(mode)) {
    return mode;
  }
  return 'ask';
}

type SendInputObject = Exclude<SendInput, string>;

function buildSendInput(
  request: SendThreadRunRequest,
  attachments: AttachmentRepository,
  threadId: string,
): SendInputObject {
  const files: SendFile[] = [];
  const images: SendFile[] = [];
  const audio: SendFile[] = [];
  const video: SendFile[] = [];
  const atts: Attachment[] = [];

  for (const id of request.attachmentIds ?? []) {
    const att = attachments.findById(id);
    if (!att || att.threadId !== threadId || att.entryId) {
      continue;
    }
    const file: SendFile = {
      name: att.name,
      mediaType: att.mediaType,
      path: att.path,
    };
    const kind = kindFromMediaType(att.mediaType);
    atts.push({ id: att.id, kind, name: att.name, mediaType: att.mediaType, path: att.path });
    if (kind === 'image') {
      images.push(file);
    } else if (kind === 'audio') {
      audio.push(file);
    } else if (kind === 'video') {
      video.push(file);
    } else {
      files.push(file);
    }
  }

  if (!request.text && images.length + audio.length + video.length + files.length === 0) {
    throw new ValidationError('empty message');
  }

  return {
    text: request.text,
    images: images.length ? images : undefined,
    audio: audio.length ? audio : undefined,
    video: video.length ? video : undefined,
    files: files.length ? files : undefined,
    attachments: atts.length ? atts : undefined,
    origin: request.origin,
  } as SendInputObject;
}
