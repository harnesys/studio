import type { Modality, ThreadAttachment } from '@harnesys/studio-shared';
import { resolveModel } from 'harnesys';
import type { AgentRepository } from '../../domain/agent.port.ts';
import type { AttachmentRepository } from '../../domain/attachment.port.ts';
import type { AttachmentsPort } from '../../domain/attachments.port.ts';
import type { LlmModelRepository } from '../../domain/llm-provider.port.ts';
import { NotFoundError, ValidationError } from '../../domain/studio.error.ts';
import type { ThreadRepository } from '../../domain/thread.port.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';
import { kindFromMediaType, MAX_ATTACHMENT_BYTES, modelAccepts } from './attachment-kind.ts';
import { attachmentRelPath, sanitizeFileName } from './studio-files.ts';

export type CreateThreadAttachmentRequest = {
  threadId: string;
  name: string;
  mediaType: string;
  bytes: Uint8Array;
};

export type CreateThreadAttachmentInput = {
  execute(request: CreateThreadAttachmentRequest): Promise<ThreadAttachment>;
};

export type CreateThreadAttachmentDeps = {
  threads: ThreadRepository;
  agents: AgentRepository;
  models: LlmModelRepository;
  workspaces: WorkspaceRepository;
  attachments: AttachmentRepository;
  attachmentsFs: AttachmentsPort;
};

export class CreateThreadAttachmentUseCase implements CreateThreadAttachmentInput {
  private readonly threads: ThreadRepository;
  private readonly agents: AgentRepository;
  private readonly models: LlmModelRepository;
  private readonly workspaces: WorkspaceRepository;
  private readonly attachments: AttachmentRepository;
  private readonly attachmentsFs: AttachmentsPort;

  constructor(deps: CreateThreadAttachmentDeps) {
    this.threads = deps.threads;
    this.agents = deps.agents;
    this.models = deps.models;
    this.workspaces = deps.workspaces;
    this.attachments = deps.attachments;
    this.attachmentsFs = deps.attachmentsFs;
  }

  async execute(request: CreateThreadAttachmentRequest): Promise<ThreadAttachment> {
    if (request.bytes.byteLength === 0) {
      throw new ValidationError('attachment is empty');
    }
    if (request.bytes.byteLength > MAX_ATTACHMENT_BYTES) {
      throw new ValidationError('attachment is larger than 20 MB');
    }
    const thread = this.threads.findById(request.threadId);
    if (!thread) {
      throw new NotFoundError('thread not found');
    }
    const agent = this.agents.findById(thread.agentId);
    if (!agent?.modelId) {
      throw new ValidationError('agent has no model');
    }
    const model = this.models.findById(agent.modelId);
    if (!model) {
      throw new NotFoundError('model not found');
    }
    const workspace = this.workspaces.findById(thread.workspaceId);
    if (!workspace) {
      throw new NotFoundError('workspace not found');
    }
    const kind = kindFromMediaType(request.mediaType);
    const resolved = resolveModel(model.metadata as never);
    if (
      !modelAccepts(
        resolved.architecture?.input_modalities as Modality[] | undefined,
        kind,
        request.mediaType,
        request.name,
      )
    ) {
      throw new ValidationError(`model does not accept ${kind}`);
    }
    const id = crypto.randomUUID();
    const fileName = sanitizeFileName(request.name);
    const relPath = attachmentRelPath(request.threadId, id, fileName);
    await this.attachmentsFs.put({
      workspacePath: workspace.path,
      threadId: request.threadId,
      id,
      bytes: request.bytes,
      fileName,
    });
    this.attachments.insert({
      id,
      threadId: request.threadId,
      entryId: null,
      name: request.name,
      mediaType: request.mediaType,
      path: relPath,
      bytes: request.bytes.byteLength,
      kind,
      createdAt: new Date().toISOString(),
    });
    return {
      id,
      kind,
      name: request.name,
      mediaType: request.mediaType,
      path: relPath,
    };
  }
}
