import type { StudioLspAdapter } from '../../adapters/lsp/studio-lsp.adapter.ts';
import type { WorkspaceHarnesysRegistry } from '../../adapters/workspace-harnesys.registry.ts';

export type LspWorkspaceRef = {
  cwd: string;
  lsp: StudioLspAdapter;
};

export type LspByWorkspace = (id: string) => LspWorkspaceRef | undefined;

export async function invalidatePluginWorkspaces(
  workspaceHarnesys: WorkspaceHarnesysRegistry,
  workspaceIds: string[],
  lspByWorkspace?: LspByWorkspace,
): Promise<void> {
  await Promise.all(
    workspaceIds.map(async (workspaceId) => {
      await workspaceHarnesys.invalidate(workspaceId);
      const ref = lspByWorkspace?.(workspaceId);
      if (ref) {
        await ref.lsp.invalidateCwd(ref.cwd);
      }
    }),
  );
}
