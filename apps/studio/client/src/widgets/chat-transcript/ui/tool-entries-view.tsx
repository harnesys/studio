import { FileCodeIcon, FileIcon, FolderIcon } from 'lucide-react';

import { cn } from '@/shared/lib/utils';
import { ExpandableScroll } from '@/shared/ui/expandable-scroll';
import type { EntriesDetail, GrepDetail, GrepMatchItem, ListEntryItem } from '../model/tool-output';

export function ToolEntriesView({ detail }: { detail: EntriesDetail }) {
  return (
    <div className="ml-4 overflow-hidden rounded-md font-mono text-[12px] leading-5">
      <ExpandableScroll>
        <div className="space-y-0.5 p-1.5">
          {detail.items.length === 0 ? (
            <div className="py-2 text-center text-[12px] text-muted-foreground">
              No entries found
            </div>
          ) : (
            detail.items.map((item, idx) => <EntryRow key={`${item.name}-${idx}`} item={item} />)
          )}
        </div>
      </ExpandableScroll>
    </div>
  );
}

function EntryRow({ item }: { item: ListEntryItem }) {
  const isDir = item.type === 'dir';
  return (
    <div className="flex items-center justify-between rounded px-2 py-0.5 transition-colors hover:bg-muted/60">
      <div className="flex min-w-0 items-center gap-2 truncate">
        {isDir ? (
          <FolderIcon className="size-3.5 shrink-0 text-chart-5" />
        ) : (
          <FileIcon className="size-3.5 shrink-0 text-muted-foreground" />
        )}
        <span
          className={cn('truncate', isDir ? 'font-medium text-foreground' : 'text-foreground/85')}
        >
          {item.name}
        </span>
      </div>
      {item.size !== undefined && item.size > 0 ? (
        <span className="shrink-0 pl-2 font-mono text-[10.5px] text-muted-foreground/70">
          {formatBytes(item.size)}
        </span>
      ) : null}
    </div>
  );
}

export function ToolGrepView({ detail }: { detail: GrepDetail }) {
  const grouped = groupMatchesByFile(detail.matches);

  return (
    <div className="ml-4 overflow-hidden rounded-md font-mono text-[12px] leading-5">
      <ExpandableScroll>
        <div className="divide-y divide-border/30">
          {grouped.length === 0 ? (
            <div className="p-3 text-center text-[12px] text-muted-foreground">
              No matches found
            </div>
          ) : (
            grouped.map(({ file, items }) => (
              <div key={file} className="py-1">
                <div className="flex items-center gap-1.5 px-3 py-0.5 font-medium text-[11.5px] text-foreground/90">
                  <FileCodeIcon className="size-3 shrink-0 text-muted-foreground" />
                  <span className="truncate">{file}</span>
                </div>
                <div className="space-y-0.5">
                  {items.map((item, idx) => (
                    <div
                      key={`${item.line}-${idx}`}
                      className="flex items-start gap-2 px-3 py-0.5 transition-colors hover:bg-muted/60"
                    >
                      <span className="w-8 shrink-0 select-none text-right font-mono text-[11px] text-muted-foreground/60">
                        {item.line}
                      </span>
                      <span className="min-w-0 flex-1 whitespace-pre font-mono text-[11.5px] text-foreground/85">
                        {item.text}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </ExpandableScroll>
    </div>
  );
}

function groupMatchesByFile(matches: GrepMatchItem[]): { file: string; items: GrepMatchItem[] }[] {
  const map = new Map<string, GrepMatchItem[]>();
  for (const m of matches) {
    const list = map.get(m.file) ?? [];
    list.push(m);
    map.set(m.file, list);
  }
  return Array.from(map.entries()).map(([file, items]) => ({ file, items }));
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
