import { useState } from 'react';

import type { Agent } from '@/entities/agent';
import { useThreadStore } from '@/entities/thread';
import {
  useWebhookStore,
  WEBHOOK_STATUSES,
  type Webhook,
  webhookStatusLabel,
} from '@/entities/webhook';
import type { DialogComponentProps } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { DialogFooter } from '@/shared/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';
import { Textarea } from '@/shared/ui/textarea';
import { draftFrom, emptyWebhookDraft, type WebhookFormDraft } from '../model/webhook-draft';

export type WebhookConfigData = {
  agents: Agent[];
  workspaceId: string;
  webhook: Webhook | null;
};

const NEW_THREAD_VALUE = 'new';

export function WebhookConfigDialog({
  onResolve,
  data,
}: DialogComponentProps<WebhookFormDraft, WebhookConfigData>) {
  const agents = data?.agents ?? [];
  const workspaceId = data?.workspaceId ?? '';
  const webhook = data?.webhook ?? null;
  const [draft, setDraft] = useState<WebhookFormDraft>(() =>
    webhook ? draftFrom(webhook) : emptyWebhookDraft(agents),
  );
  const webhooks = useWebhookStore((state) => state.items);
  const threads = useThreadStore((state) => state.items);
  const freeThreads = threads.filter(
    (thread) =>
      thread.workspaceId === workspaceId &&
      thread.agentId === draft.targetAgentId &&
      !webhooks.some((item) => item.threadId === thread.id && item.id !== webhook?.id),
  );
  const threadItems = webhook
    ? [
        ...freeThreads.map((thread) => ({
          value: thread.id,
          label: thread.title.trim() || 'Untitled',
        })),
        ...(draft.threadId && !freeThreads.some((thread) => thread.id === draft.threadId)
          ? [{ value: draft.threadId, label: 'Current thread' }]
          : []),
      ]
    : [
        { value: NEW_THREAD_VALUE, label: 'New thread' },
        ...freeThreads.map((thread) => ({
          value: thread.id,
          label: thread.title.trim() || 'Untitled',
        })),
      ];
  const canSave = draft.name.trim().length > 0 && agents.length > 0;

  return (
    <>
      <FieldGroup>
        <Field data-invalid={draft.name.trim().length === 0 || undefined}>
          <FieldLabel htmlFor="webhook-name">Name</FieldLabel>
          <Input
            id="webhook-name"
            value={draft.name}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            placeholder="GitHub pull request"
            aria-invalid={draft.name.trim().length === 0 || undefined}
          />
        </Field>
        {webhook ? (
          <Field>
            <FieldLabel htmlFor="webhook-status">Status</FieldLabel>
            <Select
              items={WEBHOOK_STATUSES.map((status) => ({
                value: status,
                label: webhookStatusLabel(status),
              }))}
              value={draft.status}
              onValueChange={(value) => {
                if (value === 'active' || value === 'paused' || value === 'failed') {
                  setDraft({ ...draft, status: value });
                }
              }}
            >
              <SelectTrigger id="webhook-status" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {WEBHOOK_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {webhookStatusLabel(status)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        ) : null}
        <Field>
          <FieldLabel htmlFor="webhook-agent">Target agent</FieldLabel>
          <Select
            items={agents.map((agent) => ({ value: agent.id, label: agent.name }))}
            value={draft.targetAgentId}
            onValueChange={(value) => {
              if (typeof value === 'string') {
                setDraft({
                  ...draft,
                  targetAgentId: value,
                  threadId: undefined,
                });
              }
            }}
          >
            <SelectTrigger id="webhook-agent" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {agents.map((agent) => (
                  <SelectItem key={agent.id} value={agent.id}>
                    {agent.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="webhook-thread">Thread</FieldLabel>
          <Select
            items={threadItems}
            value={draft.threadId ?? NEW_THREAD_VALUE}
            onValueChange={(value) => {
              if (typeof value === 'string') {
                setDraft({ ...draft, threadId: value === NEW_THREAD_VALUE ? undefined : value });
              }
            }}
          >
            <SelectTrigger id="webhook-thread" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {threadItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="webhook-detail">Notes</FieldLabel>
          <Textarea
            id="webhook-detail"
            value={draft.detail}
            onChange={(event) => setDraft({ ...draft, detail: event.target.value })}
            placeholder="What this webhook triggers"
            className="min-h-24"
          />
        </Field>
      </FieldGroup>
      <DialogFooter>
        <Button variant="outline" onClick={() => onResolve?.()}>
          Cancel
        </Button>
        <Button disabled={!canSave} onClick={() => onResolve?.(draft)}>
          Save
        </Button>
      </DialogFooter>
    </>
  );
}
