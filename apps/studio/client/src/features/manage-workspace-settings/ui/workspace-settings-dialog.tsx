import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { workspacesQuery } from '@/shared/api';
import { type DialogComponentProps, dialog, patchOverlayOptions } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { DialogFooter } from '@/shared/ui/dialog';

import type { WorkspaceSettingsCategory } from '../model/workspace-settings-nav';
import { WorkspaceSettingsCategoryPanes } from './workspace-settings-category-panes';
import { WorkspaceSettingsNav } from './workspace-settings-nav';

const DIALOG_CLASS =
  'flex min-h-0 h-[min(78vh,48rem)] w-full max-w-4xl sm:max-w-4xl overflow-hidden';

export function openWorkspaceSettingsDialog(workspaceId: string): Promise<void> {
  return dialog
    .open(WorkspaceSettingsDialog, {
      title: 'Workspace settings',
      className: DIALOG_CLASS,
      testId: 'workspace-settings-dialog',
      data: { workspaceId },
    })
    .then(() => undefined);
}

export function WorkspaceSettingsDialog({
  onResolve,
  data,
}: DialogComponentProps<void, { workspaceId: string }>) {
  const workspaceId = data?.workspaceId ?? '';
  const [category, setCategory] = useState<WorkspaceSettingsCategory>('general');
  const workspaces = useQuery(workspacesQuery).data ?? [];
  const workspace = workspaces.find((item) => item.id === workspaceId) ?? null;

  useEffect(() => {
    patchOverlayOptions({
      title: workspace ? `${workspace.name} settings` : 'Workspace settings',
    });
  }, [workspace]);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
      <div className="flex min-h-0 min-w-0 flex-1 gap-4">
        <WorkspaceSettingsNav category={category} onSelect={setCategory} className="pr-1" />
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          {workspace ? (
            <p
              className="mb-2 truncate text-muted-foreground text-xs"
              data-testid="workspace-settings-node"
            >
              {workspace.name} · {workspace.id}
            </p>
          ) : null}
          <WorkspaceSettingsCategoryPanes
            category={category}
            workspaceId={workspaceId}
            onClose={() => onResolve?.()}
          />
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onResolve?.()}>
          Close
        </Button>
      </DialogFooter>
    </div>
  );
}
