import type { WorkspaceMcpConfigServer } from '@studio/shared';

import { alert, dialog } from '@/shared/services/overlay';

import { AddMcpServerDialog, EditMcpServerDialog } from '../ui/mcp-dialogs';

export function openAddMcpServerDialog() {
  return dialog.open(AddMcpServerDialog, {
    title: 'Add MCP server',
    description: 'Writes an entry into workspace `.studio/mcp.json`.',
    className: 'sm:max-w-lg',
    testId: 'add-mcp-server-dialog',
  });
}

export function openEditMcpServerDialog(server: WorkspaceMcpConfigServer) {
  return dialog.open(EditMcpServerDialog, {
    title: 'Edit MCP server',
    description: `Update ${server.serverId} in \`.studio/mcp.json\`.`,
    className: 'sm:max-w-lg',
    testId: 'edit-mcp-server-dialog',
    data: { server },
  });
}

export function confirmDeleteMcpServer(serverId: string) {
  return alert.confirm({
    title: `Delete ${serverId}?`,
    description: 'Removes this server from `.studio/mcp.json`.',
    confirmText: 'Delete',
    variant: 'destructive',
    testId: 'delete-mcp-server-dialog',
  });
}
