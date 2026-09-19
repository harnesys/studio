import type { PinRecord } from '@harnesys/studio-shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { useEffect, useRef } from 'react';

import type { Agent } from '@/entities/agent';
import { useSessionStore } from '@/entities/session';
import { useSelectedThread } from '@/features/desk';
import {
  confirmDeletePin,
  openAddPinDialog,
  openEditPinDialog,
  type PinDraft,
} from '@/features/manage-agent-memory';
import { agentPinsQuery, agentPinsQueryKey, deleteAgentPin, upsertAgentPin } from '@/shared/api';
import { studioFocusWorkspaceId, useStudioLocation } from '@/shared/config/location';
import { formatDayTime } from '@/shared/lib/format-clock';
import { Button } from '@/shared/ui/button';
import { toast } from '@/shared/ui/toast';

import { Section } from './section';

export function PinsPanel({ agent }: { agent: Agent }) {
  const workspaceId = studioFocusWorkspaceId(useStudioLocation());
  const thread = useSelectedThread();
  const queryClient = useQueryClient();
  const streaming = useSessionStore(
    (state) => thread !== null && Boolean(state.activeRuns[thread.id]),
  );
  const wasStreaming = useRef(streaming);

  const query = useQuery({
    ...agentPinsQuery(workspaceId ?? '', agent.id),
    enabled: Boolean(workspaceId),
  });
  const pins = query.data ?? [];

  useEffect(() => {
    if (wasStreaming.current && !streaming && workspaceId) {
      void queryClient.invalidateQueries({
        queryKey: agentPinsQueryKey(workspaceId, agent.id),
      });
    }
    wasStreaming.current = streaming;
  }, [streaming, workspaceId, agent.id, queryClient]);

  async function invalidate() {
    if (!workspaceId) {
      return;
    }
    await queryClient.invalidateQueries({ queryKey: agentPinsQueryKey(workspaceId, agent.id) });
  }

  const upsert = useMutation({
    mutationFn: (draft: PinDraft) => {
      if (!workspaceId) {
        throw new Error('No workspace');
      }
      return upsertAgentPin(workspaceId, agent.id, draft.key, { text: draft.text });
    },
    onSuccess: async (pin) => {
      await invalidate();
      toast.add({ title: 'Pin saved', description: pin.key });
    },
  });

  const remove = useMutation({
    mutationFn: (key: string) => {
      if (!workspaceId) {
        throw new Error('No workspace');
      }
      return deleteAgentPin(workspaceId, agent.id, key);
    },
    onSuccess: async (_result, key) => {
      await invalidate();
      toast.add({ title: 'Pin deleted', description: key });
    },
  });

  const busy = upsert.isPending || remove.isPending;

  return (
    <Section
      label="Pins"
      hint={streaming ? 'live' : undefined}
      action={
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Add pin"
          className="text-muted-foreground"
          disabled={!workspaceId || busy}
          onClick={() => {
            void openAddPinDialog().then((draft) => {
              if (draft) {
                upsert.mutate(draft);
              }
            });
          }}
        >
          <PlusIcon />
        </Button>
      }
    >
      {!query.isPending && pins.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">No pins yet.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {pins.map((pin) => (
            <PinRow
              key={pin.key}
              pin={pin}
              busy={busy}
              onEdit={() => {
                void openEditPinDialog(pin).then((draft) => {
                  if (draft) {
                    upsert.mutate(draft);
                  }
                });
              }}
              onDelete={() => {
                void confirmDeletePin(pin.key).then((confirmed) => {
                  if (confirmed) {
                    remove.mutate(pin.key);
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

function PinRow({
  pin,
  busy,
  onEdit,
  onDelete,
}: {
  pin: PinRecord;
  busy: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className="group/row flex items-start gap-1 rounded-md px-1.5 py-1.5 hover:bg-muted/50"
      data-testid={`pin-${pin.key}`}
    >
      <div className="min-w-0 flex-1">
        <span className="block truncate font-mono text-[12px]">{pin.key}</span>
        <p className="mt-0.5 line-clamp-3 whitespace-pre-wrap text-[11px] text-foreground/90 leading-snug">
          {pin.text}
        </p>
        <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground/80">
          <span>{pin.source}</span>
          <span>{formatDayTime(pin.updatedAt)}</span>
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-focus-within/row:opacity-100 group-hover/row:opacity-100">
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={`Edit ${pin.key}`}
          disabled={busy}
          onClick={onEdit}
        >
          <PencilIcon />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={`Delete ${pin.key}`}
          disabled={busy}
          onClick={onDelete}
        >
          <Trash2Icon />
        </Button>
      </div>
    </div>
  );
}
