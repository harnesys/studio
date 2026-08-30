import type { MemoryRecord, SemanticScope } from '@studio/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import type { Agent } from '@/entities/agent';
import { useSessionStore } from '@/entities/session';
import { useSelectedThread } from '@/features/desk';
import {
  confirmDeleteSemantic,
  openAddSemanticDialog,
  openEditSemanticDialog,
  type SemanticDraft,
} from '@/features/manage-agent-memory';
import { agentSemanticQuery, deleteAgentSemantic, upsertAgentSemantic } from '@/shared/api';
import { useStudioLocation } from '@/shared/config/location';
import { formatDayTime } from '@/shared/lib/format-clock';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { toast } from '@/shared/ui/toast';
import { ToggleGroup, ToggleGroupItem } from '@/shared/ui/toggle-group';

import { Section } from './section';

export function SemanticPanel({ agent }: { agent: Agent }) {
  const { workspaceId } = useStudioLocation();
  const thread = useSelectedThread();
  const queryClient = useQueryClient();
  const [scope, setScope] = useState<SemanticScope | 'all'>('all');
  const streaming = useSessionStore(
    (state) => thread !== null && Boolean(state.activeRuns[thread.id]),
  );
  const wasStreaming = useRef(streaming);

  const filterScope = scope === 'all' ? undefined : scope;
  const query = useQuery({
    ...agentSemanticQuery(workspaceId ?? '', agent.id, { scope: filterScope }),
    enabled: Boolean(workspaceId),
  });
  const rows = query.data ?? [];

  useEffect(() => {
    if (wasStreaming.current && !streaming && workspaceId) {
      void queryClient.invalidateQueries({
        queryKey: ['workspaces', workspaceId, 'agents', agent.id, 'semantic'],
      });
    }
    wasStreaming.current = streaming;
  }, [streaming, workspaceId, agent.id, queryClient]);

  async function invalidate() {
    if (!workspaceId) {
      return;
    }
    await queryClient.invalidateQueries({
      queryKey: ['workspaces', workspaceId, 'agents', agent.id, 'semantic'],
    });
  }

  const save = useMutation({
    mutationFn: async (draft: SemanticDraft) => {
      if (!workspaceId) {
        throw new Error('No workspace');
      }
      const threadId = draft.threadId ?? thread?.id;
      if (draft.scope === 'session' && !threadId) {
        throw new Error('Select a thread for session memory');
      }
      if (draft.id) {
        await deleteAgentSemantic(workspaceId, agent.id, draft.id);
      }
      return upsertAgentSemantic(workspaceId, agent.id, {
        scope: draft.scope,
        text: draft.text,
        ...(draft.key ? { key: draft.key } : {}),
        ...(draft.scope === 'session' && threadId ? { threadId } : {}),
      });
    },
    onSuccess: async (row) => {
      await invalidate();
      toast.add({ title: 'Memory saved', description: row.key ?? row.scope });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => {
      if (!workspaceId) {
        throw new Error('No workspace');
      }
      return deleteAgentSemantic(workspaceId, agent.id, id);
    },
    onSuccess: async () => {
      await invalidate();
      toast.add({ title: 'Memory deleted' });
    },
  });

  const busy = save.isPending || remove.isPending;

  return (
    <Section label="Semantic" hint={streaming ? 'live' : undefined}>
      <div className="mb-1.5 flex items-center gap-1">
        <ToggleGroup
          variant="outline"
          spacing={0}
          size="sm"
          value={[scope]}
          onValueChange={(value) => {
            const next = value[0];
            if (next === 'all' || next === 'session' || next === 'long') {
              setScope(next);
            }
          }}
        >
          <ToggleGroupItem value="all" className="min-w-[44px] text-[11px]">
            all
          </ToggleGroupItem>
          <ToggleGroupItem value="long" className="min-w-[44px] text-[11px]">
            long
          </ToggleGroupItem>
          <ToggleGroupItem value="session" className="min-w-[44px] text-[11px]">
            session
          </ToggleGroupItem>
        </ToggleGroup>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto h-7 text-muted-foreground"
          disabled={!workspaceId || busy}
          onClick={() => {
            const initial = scope === 'all' ? 'long' : scope;
            void openAddSemanticDialog(initial).then((draft) => {
              if (draft) {
                save.mutate(draft);
              }
            });
          }}
        >
          <PlusIcon />
          Add
        </Button>
      </div>
      {!query.isPending && rows.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">No semantic rows.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {rows.map((row) => (
            <SemanticRow
              key={row.id}
              row={row}
              busy={busy}
              onEdit={() => {
                void openEditSemanticDialog(row).then((draft) => {
                  if (draft) {
                    save.mutate(draft);
                  }
                });
              }}
              onDelete={() => {
                const label = row.key ?? row.id.slice(0, 8);
                void confirmDeleteSemantic(label).then((confirmed) => {
                  if (confirmed) {
                    remove.mutate(row.id);
                  }
                });
              }}
            />
          ))}
        </div>
      )}
    </Section>
  );
}

function SemanticRow({
  row,
  busy,
  onEdit,
  onDelete,
}: {
  row: MemoryRecord;
  busy: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className="flex items-start gap-1.5 rounded-md px-1.5 py-1.5 hover:bg-muted/50"
      data-testid={`semantic-${row.id}`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <Badge variant="outline" className="px-1.5 py-0 font-mono text-[10px]">
            {row.scope}
          </Badge>
          <Badge variant="secondary" className="px-1.5 py-0 font-normal text-[10px]">
            {row.source}
          </Badge>
          {row.key ? (
            <span className="truncate font-mono text-[11px] text-muted-foreground">{row.key}</span>
          ) : null}
        </div>
        <p className="mt-0.5 line-clamp-3 whitespace-pre-wrap text-[11px] text-foreground/90 leading-snug">
          {row.text}
        </p>
        <p className="text-[10px] text-muted-foreground">{formatDayTime(row.updatedAt)}</p>
      </div>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Edit memory"
        disabled={busy}
        onClick={onEdit}
      >
        <PencilIcon />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Delete memory"
        disabled={busy}
        onClick={onDelete}
      >
        <Trash2Icon />
      </Button>
    </div>
  );
}
