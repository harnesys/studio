import { useState } from 'react';

import type { Agent } from '@/entities/agent';
import type { WebhookDraft } from '@/entities/webhook';
import { type DialogComponentProps, dialog } from '@/shared/services/overlay';
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

export function openCreateWebhookDialog(agents: Agent[]) {
  return dialog.open(CreateWebhookDialog, {
    title: 'New webhook',
    description: 'Add an inbound webhook. You can finish the details on its page.',
    className: 'sm:max-w-md',
    testId: 'create-webhook-dialog',
    data: { agents },
  });
}

export function CreateWebhookDialog({
  onResolve,
  data,
}: DialogComponentProps<WebhookDraft, { agents: Agent[] }>) {
  const agents = data?.agents ?? [];
  const [draft, setDraft] = useState<WebhookDraft>(() => emptyDraft(agents));

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
        <Field>
          <FieldLabel htmlFor="webhook-agent">Agent</FieldLabel>
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
      </FieldGroup>
      <DialogFooter>
        <Button variant="outline" onClick={() => onResolve?.()}>
          Cancel
        </Button>
        <Button
          disabled={draft.name.trim().length === 0 || agents.length === 0}
          onClick={() => onResolve?.(draft)}
        >
          Create webhook
        </Button>
      </DialogFooter>
    </>
  );
}

function emptyDraft(agents: Agent[]): WebhookDraft {
  return {
    name: '',
    targetAgentId: agents[0]?.id ?? '',
  };
}
