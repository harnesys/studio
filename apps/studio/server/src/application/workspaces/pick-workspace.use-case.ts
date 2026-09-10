import type { WorkspacePort } from '../../domain/workspace.port.ts';

export type PickWorkspaceResponse = {
  path: string;
};

export type PickWorkspaceInput = {
  execute(): Promise<PickWorkspaceResponse | undefined>;
};

export class PickWorkspaceUseCase implements PickWorkspaceInput {
  constructor(private readonly workspaceFs: WorkspacePort) {}

  async execute(): Promise<PickWorkspaceResponse | undefined> {
    const path = await this.workspaceFs.pick();
    if (!path) {
      return undefined;
    }
    return { path };
  }
}
