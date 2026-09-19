import { useQuery } from '@tanstack/react-query';
import { FileIcon } from 'lucide-react';
import { getGitFileStatus, gitFileStatusQueryKey } from '@/shared/api/git';
import { FileTypeIcon } from '@/shared/ui/file-type-icon';
import { ScrollArea } from '@/shared/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/shared/ui/tabs';

type FileTab = {
  path: string;
  dirty?: boolean;
  workspaceId: string;
};
export function FileInspector({ width, file }: { width: number; file: FileTab }) {
  const gitQuery = useQuery({
    queryKey: gitFileStatusQueryKey(file.workspaceId),
    queryFn: () => getGitFileStatus(file.workspaceId),
    enabled: Boolean(file.workspaceId),
  });
  const gitStatus = gitQuery.data?.map?.[file.path];
  const basename = file.path.split('/').pop() ?? file.path;
  return (
    <aside
      className="flex h-svh shrink-0 flex-col self-stretch bg-background"
      style={{ width }}
      data-testid="file-inspector"
    >
      <div className="flex h-11 shrink-0 items-center px-3">
        <Tabs value="inspector" className="min-w-0 flex-1 gap-0">
          <TabsList className="h-8 w-full">
            <TabsTrigger
              value="inspector"
              className="flex-1 text-xs"
              data-testid="file-inspector-tab"
            >
              Inspector
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-5 px-3 py-3 pb-8">
          <section className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <FileTypeIcon name={file.path} className="size-5 shrink-0" />
              <span className="truncate font-medium text-sm">{basename}</span>
              {file.dirty ? (
                <span className="size-2 shrink-0 rounded-full bg-live" title="Unsaved" />
              ) : null}
            </div>
            <p className="break-all font-mono text-[11px] text-muted-foreground">{file.path}</p>
            <div className="flex flex-wrap gap-2 pt-1">
              <span className="rounded-md border bg-muted px-2 py-1 font-mono text-[11px]">
                {file.dirty ? 'Unsaved changes' : 'Saved'}
              </span>
              {gitStatus ? (
                <span className="rounded-md border bg-muted px-2 py-1 font-mono text-[11px]">
                  git: {String(gitStatus).slice(0, 20)}
                </span>
              ) : (
                <span className="rounded-md border bg-muted px-2 py-1 font-mono text-[11px] text-muted-foreground">
                  git: —
                </span>
              )}
            </div>
          </section>
          <section className="flex flex-col gap-2">
            <h3 className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.12em]">
              Details
            </h3>
            <div className="rounded-lg border p-3 text-xs leading-relaxed">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <FileIcon className="size-3.5" />
                <span>File inspector</span>
              </div>
              <p className="pt-2 text-muted-foreground">
                Editing {basename}. Right sidebar shows only Inspector for files.
              </p>
            </div>
          </section>
        </div>
      </ScrollArea>
    </aside>
  );
}
