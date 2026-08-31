import { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { useAgentStore } from '@/entities/agent';
import { useScheduleStore } from '@/entities/schedule';
import { useThreadStore } from '@/entities/thread';
import type { Webhook, WebhookStatus } from '@/entities/webhook';
import { useWebhookStore, WEBHOOK_STATUSES, webhookStatusLabel } from '@/entities/webhook';
import { useDeskStore } from '@/features/desk';
import type { IdeTab } from '@/features/ide';
import { openFileKind } from '@/features/open-file';
import { HitlPrompt } from '@/features/send-message';
import { formatDayTime } from '@/shared/lib/format-clock';
import { Button } from '@/shared/ui/button';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { ScrollArea } from '@/shared/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';
import { Textarea } from '@/shared/ui/textarea';
import { ChatComposer } from '@/widgets/chat-composer';
import { ThreadPanel } from '@/widgets/chat-transcript';
import { MediaPreview, TextEditor } from '@/widgets/file-pane';
import { ScheduleSettings } from '@/widgets/schedules-list';

export function IdeTabContent({ tab, workspaceId }: { tab: IdeTab; workspaceId: string }) {
  const hydratedWorkspaceId = useDeskStore((state) => state.hydratedWorkspaceId);
  const isHydrating = Boolean(workspaceId && hydratedWorkspaceId !== workspaceId);

  if (tab.kind === 'thread' && tab.threadId && tab.agentId) {
    const agent = useAgentStore.getState().items.find((a) => a.id === tab.agentId) ?? null;
    const thread = useThreadStore.getState().byId(tab.threadId);
    if (isHydrating) {
      return null;
    }
    if (!agent || !thread) {
      return (
        <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
          Thread not found
        </div>
      );
    }
    return (
      <div className="flex min-h-0 flex-1 flex-col" data-testid="ide-thread">
        <div className="min-h-0 flex-1">
          <ThreadPanel threadId={thread.id} agent={agent} />
        </div>
        <HitlPrompt />
        <ChatComposer />
      </div>
    );
  }
  if (tab.kind === 'file' && tab.path) {
    const kind = openFileKind(tab.path);
    return (
      <div className="flex min-h-0 flex-1 flex-col" data-testid="ide-file">
        {kind === 'text' ? (
          <TextEditor workspaceId={workspaceId} path={tab.path} dirty={Boolean(tab.dirty)} />
        ) : null}
        {kind === 'image' || kind === 'pdf' ? (
          <MediaPreview workspaceId={workspaceId} path={tab.path} kind={kind} />
        ) : null}
        {kind === 'unsupported' ? (
          <div className="flex flex-1 items-center justify-center px-4 text-muted-foreground text-sm">
            Preview is not available
          </div>
        ) : null}
      </div>
    );
  }
  if (tab.kind === 'schedule' && tab.scheduleId) {
    const schedule = useScheduleStore.getState().items.find((s) => s.id === tab.scheduleId);
    if (isHydrating) {
      return null;
    }
    if (!schedule) {
      return (
        <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
          Schedule not found
        </div>
      );
    }
    return (
      <ScrollArea className="min-h-0 flex-1">
        <ScheduleSettings schedule={schedule} />
      </ScrollArea>
    );
  }
  if (tab.kind === 'webhook' && tab.webhookId) {
    const webhook = useWebhookStore.getState().items.find((w) => w.id === tab.webhookId);
    if (isHydrating) {
      return null;
    }
    if (!webhook) {
      return (
        <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
          Webhook not found
        </div>
      );
    }
    return <WebhookDetail webhook={webhook} />;
  }
  return null;
}

function WebhookDetail({ webhook }: { webhook: Webhook }) {
  const agents = useAgentStore(
    useShallow((state) => state.items.filter((a) => a.workspaceId === webhook.workspaceId)),
  );
  const [draft, setDraft] = useState(() => draftFrom(webhook));
  const [saved, setSaved] = useState(false);
  const dirty = isDirty(webhook, draft);
  useEffect(() => {
    setDraft(draftFrom(webhook));
    setSaved(false);
  }, [webhook]);
  return (
    <div
      className="flex w-full max-w-xl flex-col gap-8 px-8 py-8"
      data-testid={`webhook-settings-${webhook.id}`}
    >
      <div className="flex flex-col gap-1">
        <p className="font-medium text-[11px] text-muted-foreground uppercase tracking-[0.08em]">
          Webhook
        </p>
        <h1 className="font-medium text-lg tracking-tight">{webhook.name}</h1>
        <p className="text-muted-foreground text-sm">{webhook.detail}</p>
      </div>
      <FieldGroup className="gap-4">
        <Field>
          <FieldLabel htmlFor="wh-name">Name</FieldLabel>
          <Input
            id="wh-name"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </Field>
        <Field>
          <FieldLabel>Status</FieldLabel>
          <Select
            items={WEBHOOK_STATUSES.map((s) => ({ value: s, label: webhookStatusLabel(s) }))}
            value={draft.status}
            onValueChange={(v) => {
              if (v === 'active' || v === 'paused' || v === 'failed') {
                setDraft({ ...draft, status: v });
              }
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {WEBHOOK_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {webhookStatusLabel(s)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel>Target agent</FieldLabel>
          <Select
            items={agents.map((a) => ({ value: a.id, label: a.name }))}
            value={draft.targetAgentId}
            onValueChange={(v) => {
              if (typeof v === 'string') {
                setDraft({ ...draft, targetAgentId: v });
              }
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {agents.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel>Endpoint</FieldLabel>
          <Input
            value={draft.endpoint}
            onChange={(e) => setDraft({ ...draft, endpoint: e.target.value })}
            className="font-mono"
          />
          <FieldDescription>
            {webhook.lastFiredAt
              ? `Last fired ${formatDayTime(webhook.lastFiredAt)}`
              : 'Has not fired yet.'}
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel>Notes</FieldLabel>
          <Textarea
            value={draft.detail}
            onChange={(e) => setDraft({ ...draft, detail: e.target.value })}
          />
        </Field>
      </FieldGroup>
      <div className="flex items-center gap-3">
        <Button
          disabled={!dirty || draft.name.trim().length === 0}
          onClick={() => {
            useWebhookStore.getState().update(webhook.id, draft);
            setSaved(true);
          }}
        >
          Save webhook
        </Button>
        {saved && !dirty ? <span className="text-muted-foreground text-xs">Saved</span> : null}
      </div>
    </div>
  );
}

function draftFrom(w: Webhook) {
  return {
    name: w.name,
    status: w.status as WebhookStatus,
    targetAgentId: w.targetAgentId,
    detail: w.detail,
    endpoint: w.endpoint,
  };
}

function isDirty(w: Webhook, d: ReturnType<typeof draftFrom>) {
  return (
    d.name !== w.name ||
    d.status !== w.status ||
    d.targetAgentId !== w.targetAgentId ||
    d.detail !== w.detail ||
    d.endpoint !== w.endpoint
  );
}
