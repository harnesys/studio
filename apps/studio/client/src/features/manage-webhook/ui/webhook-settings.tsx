import { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAgentStore } from '@/entities/agent';
import type { Webhook, WebhookStatus } from '@/entities/webhook';
import {
  toClientWebhook,
  useWebhookStore,
  WEBHOOK_STATUSES,
  webhookStatusLabel,
} from '@/entities/webhook';
import { updateWebhookRecord } from '@/shared/api';
import { formatDayTime } from '@/shared/lib/format-clock';
import { Button } from '@/shared/ui/button';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/shared/ui/field';
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

type WebhookDraft = {
  name: string;
  status: WebhookStatus;
  targetAgentId: string;
  detail: string;
  endpoint: string;
};

export function WebhookSettings({ webhook: item }: { webhook: Webhook }) {
  const agents = useAgentStore(
    useShallow((state) => state.items.filter((agent) => agent.workspaceId === item.workspaceId)),
  );
  const [draft, setDraft] = useState<WebhookDraft>(() => draftFrom(item));
  const [saved, setSaved] = useState(false);
  const dirty = isDirty(item, draft);

  useEffect(() => {
    setDraft(draftFrom(item));
    setSaved(false);
  }, [item]);

  return (
    <div
      className="flex w-full max-w-xl flex-col gap-8 px-8 py-8"
      data-testid={`webhook-settings-${item.id}`}
    >
      <div className="flex flex-col gap-1">
        <p className="font-medium text-[11px] text-muted-foreground uppercase tracking-[0.08em]">
          Webhook
        </p>
        <h1 className="font-medium text-lg tracking-tight">{item.name}</h1>
        <p className="text-muted-foreground text-sm">{item.detail}</p>
      </div>

      <FieldGroup className="gap-4">
        <Field>
          <FieldLabel htmlFor="webhook-name">Name</FieldLabel>
          <Input
            id="webhook-name"
            value={draft.name}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          />
        </Field>
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
        <Field>
          <FieldLabel htmlFor="webhook-agent">Target agent</FieldLabel>
          <Select
            items={agents.map((agent) => ({ value: agent.id, label: agent.name }))}
            value={draft.targetAgentId}
            onValueChange={(value) => {
              if (typeof value === 'string') {
                setDraft({ ...draft, targetAgentId: value });
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
          <FieldLabel htmlFor="webhook-endpoint">Endpoint</FieldLabel>
          <Input
            id="webhook-endpoint"
            value={draft.endpoint}
            onChange={(event) => setDraft({ ...draft, endpoint: event.target.value })}
            className="font-mono"
          />
          <FieldDescription>
            {item.lastFiredAt
              ? `Last fired ${formatDayTime(item.lastFiredAt)}`
              : 'Has not fired yet.'}
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="webhook-detail">Notes</FieldLabel>
          <Textarea
            id="webhook-detail"
            value={draft.detail}
            onChange={(event) => setDraft({ ...draft, detail: event.target.value })}
          />
        </Field>
      </FieldGroup>

      <div className="flex items-center gap-3">
        <Button
          disabled={!dirty || draft.name.trim().length === 0}
          onClick={() => {
            void (async () => {
              const record = await updateWebhookRecord(item.workspaceId, item.id, draft);
              useWebhookStore.getState().upsert(toClientWebhook(record));
              setSaved(true);
            })();
          }}
        >
          Save webhook
        </Button>
        {saved && !dirty ? <span className="text-muted-foreground text-xs">Saved</span> : null}
      </div>
    </div>
  );
}

function draftFrom(item: Webhook): WebhookDraft {
  return {
    name: item.name,
    status: item.status,
    targetAgentId: item.targetAgentId,
    detail: item.detail,
    endpoint: item.endpoint,
  };
}

function isDirty(item: Webhook, draft: WebhookDraft): boolean {
  return (
    draft.name !== item.name ||
    draft.status !== item.status ||
    draft.targetAgentId !== item.targetAgentId ||
    draft.detail !== item.detail ||
    draft.endpoint !== item.endpoint
  );
}
