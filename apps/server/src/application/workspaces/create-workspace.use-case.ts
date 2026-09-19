import { appendFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { writeWorkspaceMcpJson } from '../../adapters/mcp-json.adapter.ts';
import { ValidationError } from '../../domain/studio.error.ts';
import type { WorkspacePort, WorkspaceRepository } from '../../domain/workspace.port.ts';
import type { NodeRegistry } from '../nodes/node-registry.ts';
export type CreateWorkspaceRequest = {
  path?: string;
  name?: string;
};
export type CreateWorkspaceResponse = {
  workspace: {
    id: string;
    name: string;
    path: string;
    createdAt: string;
  };
};
export type CreateWorkspaceInput = {
  execute(request: CreateWorkspaceRequest): Promise<CreateWorkspaceResponse>;
};
export class CreateWorkspaceUseCase implements CreateWorkspaceInput {
  constructor(
    private readonly nodes: NodeRegistry,
    private readonly workspaceFs: WorkspacePort,
    private readonly home: string,
    private readonly workspaces: WorkspaceRepository,
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
    const node = this.nodes.create({ name, path: targetPath });
    writeWorkspaceMcpJson(targetPath, {});
    await ensureHarnesysIgnored(targetPath);
    const createdAt = this.workspaces.findById(node.id)?.createdAt ?? new Date().toISOString();
    return {
      workspace: {
        id: node.id,
        name: node.name,
        path: node.path,
        createdAt,
      },
    };
  }
}
async function ensureHarnesysIgnored(workspacePath: string): Promise<void> {
  const gitignore = join(workspacePath, '.gitignore');
  let lines: string[] = [];
  try {
    lines = (await readFile(gitignore, 'utf8')).split(/\r?\n/);
  } catch {
    lines = [];
  }
  if (lines.includes('.harnesys/')) {
    return;
  }
  const needsNewline = lines.length > 0 && lines[lines.length - 1] !== '';
  await appendFile(gitignore, `${needsNewline ? '\n' : ''}.harnesys/\n`, 'utf8');
}
function basename(path: string): string | undefined {
  return path.split(/[/\\]/).filter(Boolean).at(-1);
}
function joinWorkspacePath(home: string, name: string): string {
  const slug = name.replace(/[/\\]/g, '-').replace(/^\.+/, '').trim() || 'workspace';
  return `${home}/workspaces/${slug}`;
}
