import type { AcceptedRunResponse } from '@harnesys/studio-shared';
import { type AgentMode, effectiveMode, resolveModeId } from '@harnesys/studio-shared';
import type { Attachment, SendFile, SendInput } from 'harnesys';
import type { ThreadRuntimeRegistry } from '../../adapters/thread-runtime.registry.ts';
import type { WorkspaceHarnesysRegistry } from '../../adapters/workspace-harnesys.registry.ts';
import { AUTO_THREAD_TITLE_MAX_CHARS } from '../../config/constants.ts';
import type { AgentRepository } from '../../domain/agent.port.ts';
import type { AttachmentRepository } from '../../domain/attachment.port.ts';
import type { DeskEventsPort } from '../../domain/desk-events.port.ts';
import type { LlmModelRepository, LlmProviderRepository } from '../../domain/llm-provider.port.ts';
import { NotFoundError, RunConflictError, ValidationError } from '../../domain/studio.error.ts';
import type { Thread, ThreadRepository } from '../../domain/thread.port.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';
import { kindFromMediaType } from './attachment-kind.ts';
import { DEFAULT_THREAD_TITLE } from './create-thread.use-case.ts';
import type { GetThreadInput } from './get-thread.use-case.ts';
import { escapeXml } from './plan-mode-prompt.ts';
import { publishDeskThread } from './publish-desk-thread.ts';
import { runModeFields } from './thread.helpers.ts';

export type SendThreadRunRequest = {
  threadId: string;
  text?: string;
  effort?: string;
  attachmentIds?: string[];
  mode?: string;
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
    // Chain: body mode > thread metadata > agent default > ask; membership in
    // the agent's modes is checked by the resolver.
    const runModeId = resolveModeId({
      bodyMode: request.mode ?? null,
      threadMode: runModeFields(thread).runMode ?? null,
      defaultModeId: agentRow.defaultModeId ?? null,
      modes: agentRow.modes,
    });
    this.threads.setRunMode(thread.id, runModeId);
    input.text = decorateText(effectiveMode(agentRow.modes, runModeId), request.text);

    const hx = await this.workspaceHarnesys.get(workspace);
    const handle = await this.registry.threadOf(thread.id, hx, agentRow.id, workspace.path);
    const clientEventId = request.clientEventId ?? crypto.randomUUID();
    try {
      const { runId } = await handle.send(input, { clientEventId });
      this.deriveTitle(thread, request.text);
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

  private deriveTitle(thread: Thread, text: string | undefined): void {
    if (thread.kind !== 'chat' || thread.title !== DEFAULT_THREAD_TITLE) {
      return;
    }
    const title = deriveThreadTitle(text ?? '');
    if (title) {
      this.threads.updateTitle(thread.id, title);
    }
  }

  private publishThread(threadId: string): void {
    publishDeskThread(this.getThread, this.deskEvents, threadId);
  }
}

/** Mode instructions + skills ride as an XML block ahead of the user text. */
function modeInstructionsBlock(mode: AgentMode): string | undefined {
  const skills = (mode.skills ?? []).map((s) => s.trim()).filter(Boolean);
  if (!mode.instructions?.trim() && skills.length === 0) {
    return undefined;
  }
  const parts = [
    mode.instructions?.trim()
      ? `<instructions>${escapeXml(mode.instructions.trim())}</instructions>`
      : null,
    skills.length > 0
      ? `<mode-skills>Before working in this mode, call load_skill for each: ${skills.join(', ')}.</mode-skills>`
      : null,
  ].filter(Boolean);
  return `<mode id="${mode.id}" name="${escapeXml(mode.name)}">\n${parts.join('\n')}\n</mode>`;
}

function decorateText(mode: AgentMode, text: string | undefined): string | undefined {
  const block = modeInstructionsBlock(mode);
  if (!block) {
    return text;
  }
  return text ? `${block}\n\n${text}` : block;
}

function deriveThreadTitle(text: string): string {
  const compact = text.trim().replace(/\s+/g, ' ');
  if (!compact) {
    return '';
  }
  if (compact.length <= AUTO_THREAD_TITLE_MAX_CHARS) {
    return compact;
  }
  return `${compact.slice(0, AUTO_THREAD_TITLE_MAX_CHARS).trimEnd()}…`;
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
    effort: request.effort,
    images: images.length ? images : undefined,
    audio: audio.length ? audio : undefined,
    video: video.length ? video : undefined,
    files: files.length ? files : undefined,
    attachments: atts.length ? atts : undefined,
    origin: request.origin,
  } as SendInputObject;
}
