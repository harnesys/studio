import { useState } from 'react';
import { Button } from '@/shared/ui/button';
import { InputGroupAddon, InputGroupTextarea } from '@/shared/ui/input-group';
import { toast } from '@/shared/ui/toast';

import { rejectAsk, respondToAsk } from '../model/hitl-actions';
import type { PendingHitl } from '../model/pending-hitl';
import { usePlanApplyStore } from '../model/plan-apply';
import { HitlShell } from './hitl-shell';

type ProposeItem = { title?: string; description?: string };

function proposeItems(pending: PendingHitl): ProposeItem[] {
  const input = pending.tool?.input;
  if (!input || typeof input !== 'object') {
    return [];
  }
  const items = (input as { items?: unknown }).items;
  return Array.isArray(items) ? (items as ProposeItem[]) : [];
}

function proposeOverview(pending: PendingHitl): string {
  const input = pending.tool?.input;
  if (!input || typeof input !== 'object') {
    return '';
  }
  const overview = (input as { overview?: unknown }).overview;
  return typeof overview === 'string' ? overview.trim() : '';
}

export function PlanProposalCard({
  pending,
  threadId,
}: {
  pending: PendingHitl;
  threadId: string;
}) {
  const [busy, setBusy] = useState(false);
  const [revising, setRevising] = useState(false);
  const [text, setText] = useState('');
  const items = proposeItems(pending);
  const overview = proposeOverview(pending);
  const arm = usePlanApplyStore((state) => state.arm);

  const approve = async () => {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      await respondToAsk(threadId, pending.askId, { action: 'approve' });
      arm(threadId);
    } catch (error) {
      toast.add({
        title: 'Could not approve plan',
        description: error instanceof Error ? error.message : 'Approve failed',
      });
    } finally {
      setBusy(false);
    }
  };

  const sendRevisions = async () => {
    const trimmed = text.trim();
    if (busy || !trimmed) {
      return;
    }
    setBusy(true);
    try {
      await respondToAsk(threadId, pending.askId, { action: 'revise', text: trimmed });
    } catch (error) {
      toast.add({
        title: 'Could not send revisions',
        description: error instanceof Error ? error.message : 'Revise failed',
      });
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      await rejectAsk(threadId, pending.askId, 'Plan proposal cancelled');
    } catch (error) {
      toast.add({
        title: 'Could not cancel',
        description: error instanceof Error ? error.message : 'Cancel failed',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <HitlShell>
      <div className="flex flex-col gap-2 px-3 pt-2.5">
        <div className="flex flex-col gap-0.5">
          <p className="font-medium text-sm">Plan ready for review</p>
          <p className="text-[11px] text-muted-foreground">
            Approve saves this plan to the Inspector. Apply afterwards starts execution.
          </p>
        </div>
        {overview ? (
          <p className="line-clamp-3 text-[12px] text-muted-foreground leading-snug">{overview}</p>
        ) : null}
        {items.length > 0 ? (
          <ol className="list-decimal space-y-0.5 pl-4 text-[12px] leading-snug">
            {items.map((item, index) => (
              <li
                key={`${item.title?.trim() || 'untitled'}:${item.description?.trim() || ''}`}
                className="text-foreground"
              >
                {item.title?.trim() || `Step ${index + 1}`}
              </li>
            ))}
          </ol>
        ) : null}
      </div>

      {revising ? (
        <>
          <InputGroupTextarea
            id="plan-propose-revisions"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="What should change in the plan?"
            disabled={busy}
            rows={2}
            className="min-h-0 py-1.5 text-sm"
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && text.trim()) {
                event.preventDefault();
                void sendRevisions();
              }
            }}
          />
          <InputGroupAddon align="block-end" className="justify-end gap-1 px-2 pb-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              className="h-7"
              onClick={() => {
                setRevising(false);
                setText('');
              }}
            >
              Back
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={busy || !text.trim()}
              className="h-7"
              onClick={() => void sendRevisions()}
            >
              Send revisions
            </Button>
          </InputGroupAddon>
        </>
      ) : (
        <InputGroupAddon align="block-end" className="justify-end gap-1 px-2 pb-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy}
            className="h-7"
            onClick={() => void cancel()}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            className="h-7"
            onClick={() => setRevising(true)}
          >
            Request changes
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={busy}
            className="h-7"
            onClick={() => void approve()}
          >
            Approve
          </Button>
        </InputGroupAddon>
      )}
    </HitlShell>
  );
}
