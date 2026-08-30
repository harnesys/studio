import { useQuery } from '@tanstack/react-query';
import { FileIcon, FolderIcon, FolderOpenIcon } from 'lucide-react';
import { useIdeStore, useIdeTabs } from '@/features/ide';
import { openFileKind, openWorkspaceFile } from '@/features/open-file';
import { listWorkspaceFiles } from '@/shared/api/files';
import { useStudioLocation } from '@/shared/config/location';
import {
  CategoryLanding,
  CategoryLandingDescription,
  CategoryLandingEyebrow,
  CategoryLandingList,
  CategoryLandingListItem,
  CategoryLandingSection,
  CategoryLandingTitle,
} from '@/shared/ui/category-landing';
import { FileTypeIcon } from '@/shared/ui/file-type-icon';
import { MediaPreview, TextEditor } from '@/widgets/file-pane';

export function FilesMain() {
  const { workspaceId } = useStudioLocation();
  const { tabs, activeId } = useIdeTabs(workspaceId);
  const activeTab = tabs.find((t) => t.id === activeId && t.kind === 'file') ?? null;

  if (!workspaceId) {
    return null;
  }

  if (activeTab?.path) {
    const kind = openFileKind(activeTab.path);
    return (
      <div className="flex h-full min-h-0 flex-1 flex-col" data-testid="files-main">
        <div className="flex min-h-0 flex-1 flex-col">
          {kind === 'text' ? (
            <TextEditor
              workspaceId={workspaceId}
              path={activeTab.path}
              dirty={Boolean(activeTab.dirty)}
            />
          ) : null}
          {kind === 'image' || kind === 'pdf' ? (
            <MediaPreview workspaceId={workspaceId} path={activeTab.path} kind={kind} />
          ) : null}
          {kind === 'unsupported' ? (
            <div className="flex flex-1 items-center justify-center px-4 text-muted-foreground text-sm">
              Preview is not available
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  // if any file tabs exist but none active is file (e.g., other kind active), still show empty for /files route
  return <FilesEmpty workspaceId={workspaceId} />;
}

function FilesEmpty({ workspaceId }: { workspaceId: string }) {
  const filesQuery = useQuery({
    queryKey: ['workspace-files', workspaceId],
    queryFn: () => listWorkspaceFiles(workspaceId),
    enabled: Boolean(workspaceId),
  });
  const entries = filesQuery.data ?? [];
  const files = entries.filter((e) => e.kind === 'file').slice(0, 12);
  const dirs = entries.filter((e) => e.kind === 'dir').slice(0, 6);

  return (
    <CategoryLanding data-testid="files-empty">
      <CategoryLandingEyebrow>FILES</CategoryLandingEyebrow>
      <CategoryLandingTitle>Workspace files</CategoryLandingTitle>
      <CategoryLandingDescription>
        Pick a file in the sidebar or double-click to open. Files now open without selecting an
        agent and live on the workspace.
      </CategoryLandingDescription>

      {entries.length === 0 && !filesQuery.isLoading ? (
        <CategoryLandingSection label="Empty">
          <p className="rounded-lg border border-dashed px-3 py-3 text-muted-foreground text-sm">
            Empty workspace. Create a file from the Files section in the sidebar.
          </p>
        </CategoryLandingSection>
      ) : null}

      {files.length > 0 ? (
        <CategoryLandingSection label="Recent files" icon={<FileIcon className="size-3" />}>
          <CategoryLandingList>
            {files.map((item) => (
              <CategoryLandingListItem
                key={item.name}
                icon={<FileTypeIcon name={item.name} className="opacity-70" />}
                title={item.name}
                subtitle="file"
                onClick={() => {
                  openWorkspaceFile(workspaceId, item.name);
                  useIdeStore.getState().openFile(workspaceId, item.name);
                }}
              />
            ))}
          </CategoryLandingList>
        </CategoryLandingSection>
      ) : null}

      {dirs.length > 0 ? (
        <CategoryLandingSection label="Folders" icon={<FolderIcon className="size-3" />}>
          <CategoryLandingList>
            {dirs.map((item) => (
              <CategoryLandingListItem
                key={item.name}
                icon={<FolderOpenIcon className="size-3.5 text-live/70" />}
                title={item.name}
                subtitle="folder"
                onClick={() => {
                  // expand in sidebar — focus files surface already
                }}
              />
            ))}
          </CategoryLandingList>
        </CategoryLandingSection>
      ) : null}
    </CategoryLanding>
  );
}
