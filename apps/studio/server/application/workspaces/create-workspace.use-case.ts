import { defaultAgentCompaction, defaultAgentMemory } from '../../../shared/types.ts';
import type { AgentRepository } from '../../domain/agent.port.ts';
import { ValidationError } from '../../domain/studio.error.ts';
import type { WorkspacePort, WorkspaceRepository } from '../../domain/workspace.port.ts';

export type CreateWorkspaceRequest = {
  path?: string;
  name?: string;
};

export type CreateWorkspaceResponse = {
  workspace: { id: string; name: string; path: string; createdAt: string };
};

export type CreateWorkspaceInput = {
  execute(request: CreateWorkspaceRequest): Promise<CreateWorkspaceResponse>;
};

export class CreateWorkspaceUseCase implements CreateWorkspaceInput {
  constructor(
    private readonly workspaces: WorkspaceRepository,
    private readonly agents: AgentRepository,
    private readonly workspaceFs: WorkspacePort,
    private readonly home: string,
  ) {}

  async execute(request: CreateWorkspaceRequest): Promise<CreateWorkspaceResponse> {
    const trimmedPath = request.path?.trim();
    const trimmedName = request.name?.trim();
    if (!trimmedPath && !trimmedName) {
      throw new ValidationError('path or name is required');
    }

    let targetPath: string;
    let name: string;
    if (trimmedPath) {
      const status = await this.workspaceFs.inspect(trimmedPath);
      if (!status.exists) {
        throw new ValidationError('path is not a directory');
      }
      targetPath = trimmedPath;
      name = trimmedName ?? basename(trimmedPath) ?? 'Workspace';
    } else {
      name = trimmedName as string;
      targetPath = joinWorkspacePath(this.home, name);
      await this.workspaceFs.ensureDir(targetPath);
    }

    const now = new Date().toISOString();
    const workspace = this.workspaces.insert({
      id: crypto.randomUUID(),
      name,
      path: targetPath,
      createdAt: now,
    });
    this.agents.insert({
      id: crypto.randomUUID(),
      workspaceId: workspace.id,
      name: 'default',
      modelId: null,
      role: 'Operator',
      instructions: '',
      effort: null,
      generation: null,
      toolOutput: null,
      compaction: defaultAgentCompaction(),
      memory: defaultAgentMemory(),
      skills: [],
      mcpServers: [],
      tools: [],
      createdAt: now,
      updatedAt: now,
    });
    return { workspace };
  }
}

function basename(path: string): string | undefined {
  return path.split(/[/\\]/).filter(Boolean).at(-1);
}

function joinWorkspacePath(home: string, name: string): string {
  const slug = name.replace(/[/\\]/g, '-').replace(/^\.+/, '').trim() || 'workspace';
  return `${home}/workspaces/${slug}`;
}
