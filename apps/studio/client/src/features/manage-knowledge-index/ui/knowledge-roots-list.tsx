import type { KnowledgeRootRecord } from '@harnesys/studio-shared';
import { PlusIcon, Trash2Icon } from 'lucide-react';

import {
  confirmDeleteKnowledgeRoot,
  openAddKnowledgeRootDialog,
} from '@/features/manage-knowledge-roots';
import { Button } from '@/shared/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/shared/ui/empty';
import { Switch } from '@/shared/ui/switch';

type KnowledgeRootsListProps = {
  roots: KnowledgeRootRecord[];
  loading?: boolean;
  busy?: boolean;
  disabled?: boolean;
  onUpsert: (body: { path: string; enabled: boolean }) => void;
  onRemove: (path: string) => void;
};

export function KnowledgeRootsList({
  roots,
  loading,
  busy,
  disabled,
  onUpsert,
  onRemove,
}: KnowledgeRootsListProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-8 items-center gap-1">
        <p className="font-medium text-sm">Roots</p>
        <div className="ml-auto">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            disabled={disabled || busy}
            onClick={() => {
              void openAddKnowledgeRootDialog().then((draft) => {
                if (!draft) {
                  return;
                }
                onUpsert({ path: draft.path, enabled: draft.enabled ?? true });
              });
            }}
          >
            <PlusIcon />
            Add root
          </Button>
        </div>
      </div>

      {loading ? <p className="text-muted-foreground text-sm">Loading roots…</p> : null}
      {!loading && roots.length === 0 ? (
        <Empty className="min-h-0 border-0 py-6">
          <EmptyHeader>
            <EmptyTitle>No knowledge roots</EmptyTitle>
            <EmptyDescription>
              Add a relative path (e.g. `docs`) or enable entire workspace.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}
      {!loading && roots.length > 0 ? (
        <div className="flex flex-col gap-1">
          {roots.map((root) => (
            <div
              key={root.path}
              className="flex min-h-9 items-center gap-2 rounded-md px-2 py-2 hover:bg-muted/50"
              data-testid={`knowledge-root-${root.path}`}
            >
              <span className="min-w-0 flex-1 truncate font-mono text-sm">{root.path}</span>
              <Switch
                checked={root.enabled}
                disabled={busy || disabled}
                aria-label={`Enable ${root.path}`}
                onCheckedChange={(enabled) =>
                  onUpsert({ path: root.path, enabled: Boolean(enabled) })
                }
              />
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground"
                disabled={busy || disabled}
                aria-label={`Remove ${root.path}`}
                onClick={() => {
                  void confirmDeleteKnowledgeRoot(root.path).then((ok) => {
                    if (!ok) {
                      return;
                    }
                    onRemove(root.path);
                  });
                }}
              >
                <Trash2Icon />
              </Button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
