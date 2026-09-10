import type { WorkspaceHarnesysRegistry } from '../../adapters/workspace-harnesys.registry.ts';
import { NotFoundError } from '../../domain/studio.error.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';
import type {
  GetWorkspaceMcpConfigInput,
  GetWorkspaceMcpConfigResponse,
} from './get-workspace-mcp-config.use-case.ts';

export type ReloadWorkspaceMcpRequest = {
  workspaceId: string;
};

export type ReloadWorkspaceMcpResponse = GetWorkspaceMcpConfigResponse;

export type ReloadWorkspaceMcpInput = {
  execute(request: ReloadWorkspaceMcpRequest): Promise<ReloadWorkspaceMcpResponse>;
};

export class ReloadWorkspaceMcpUseCase implements ReloadWorkspaceMcpInput {
  constructor(
    private readonly workspaces: WorkspaceRepository,
    private readonly workspaceHarnesys: WorkspaceHarnesysRegistry,
    private readonly getConfig: GetWorkspaceMcpConfigInput,
  ) {}

  async execute(request: ReloadWorkspaceMcpRequest): Promise<ReloadWorkspaceMcpResponse> {
    const workspace = this.workspaces.findById(request.workspaceId);
    if (!workspace) {
      throw new NotFoundError('workspace not found');
    }
    await this.workspaceHarnesys.invalidate(workspace.id);
    return this.getConfig.execute(request);
  }
}
