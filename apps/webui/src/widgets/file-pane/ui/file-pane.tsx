import { openFileKind, useWorkspaceOpenFiles } from '@/features/open-file';
import { studioFocusWorkspaceId, useStudioLocation } from '@/shared/config/location';
import { MediaPreview } from './media-preview';
import { TextEditor } from './text-editor';

export function FilePane() {
  const workspaceId = studioFocusWorkspaceId(useStudioLocation());
  const { tabs, activePath } = useWorkspaceOpenFiles(workspaceId);
  const active = tabs.find((tab) => tab.path === activePath) ?? null;

  if (!workspaceId || !active) {
    return null;
  }

  const kind = openFileKind(active.path);

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col" data-testid="file-pane">
      {kind === 'text' ? (
        <TextEditor workspaceId={workspaceId} path={active.path} dirty={active.dirty} />
      ) : null}
      {kind === 'image' || kind === 'pdf' ? (
        <MediaPreview workspaceId={workspaceId} path={active.path} kind={kind} />
      ) : null}
      {kind === 'unsupported' ? (
        <div className="flex flex-1 items-center justify-center px-4 text-muted-foreground text-sm">
          Preview is not available for this file type
        </div>
      ) : null}
    </section>
  );
}
