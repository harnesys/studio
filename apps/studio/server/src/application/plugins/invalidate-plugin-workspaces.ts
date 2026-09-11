import type { WorkspaceHarnesysRegistry } from '../../adapters/workspace-harnesys.registry.ts';

export async function invalidatePluginWorkspaces(
  workspaceHarnesys: WorkspaceHarnesysRegistry,
  workspaceIds: string[],
): Promise<void> {
  await Promise.all(workspaceIds.map((workspaceId) => workspaceHarnesys.invalidate(workspaceId)));
}
