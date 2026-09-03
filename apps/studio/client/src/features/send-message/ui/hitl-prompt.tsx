import { type ReactNode, useEffect, useState } from 'react';

import { useSessionStore } from '@/entities/session';
import { useSelectedThread, useThreadEvents } from '@/features/desk';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { InputGroup, InputGroupAddon, InputGroupTextarea } from '@/shared/ui/input-group';
import { Label } from '@/shared/ui/label';
import { Markdown } from '@/shared/ui/markdown';
import { RadioGroup, RadioGroupItem } from '@/shared/ui/radio-group';
import { toast } from '@/shared/ui/toast';

import { respondToAsk } from '../model/hitl-actions';
import { type PendingHitl, pendingHitl } from '../model/pending-hitl';
import { resumePausedThread } from '../model/resume-paused';
import { summarizeToolInput } from '../model/tool-input-summary';
import { HitlPreview } from './hitl-preview';

export function HitlPrompt() {
  const thread = useSelectedThread();
  const events = useThreadEvents(thread?.id ?? null);
  const streaming = useSessionStore((state) =>
    thread ? Boolean(state.activeRuns[thread.id]) : false,
  );
  const pending = pendingHitl(events);

  useEffect(() => {
    if (pending && !streaming && thread?.id) {
      void resumePausedThread(thread.id).catch(() => {});
    }
  }, [pending, streaming, thread?.id]);

  if (!pending || !streaming) {
    return null;
  }

  const isConfirm = pending.source === 'permission' || pending.source === 'approve';

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-2" data-testid="hitl-prompt">
      {isConfirm ? (
        <ConfirmCard pending={pending} threadId={thread?.id ?? ''} />
      ) : (
        <AskCard pending={pending} threadId={thread?.id ?? ''} />
      )}
    </div>
  );
}

function ConfirmCard({ pending, threadId }: { pending: PendingHitl; threadId: string }) {
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  const name = pending.tool?.name ?? 'tool';
  let inputStr = '';
  if (pending.tool?.input != null) {
    inputStr =
      typeof pending.tool.input === 'string'
        ? pending.tool.input
        : JSON.stringify(pending.tool.input);
  }
  const summary = summarizeToolInput(name, inputStr);
  const pathLine = summary.lines.find((line) => line.label === 'path')?.value;
  const detailLines = summary.lines.filter((line) => line.label !== 'path');

  const decide = async (allow: boolean) => {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      await respondToAsk(threadId, pending.askId, {
        approved: allow,
        reason: allow ? undefined : reason.trim() || undefined,
      });
    } catch (error) {
      toast.add({
        title: allow ? 'Could not allow' : 'Could not deny',
        description: error instanceof Error ? error.message : 'Confirm failed',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <HitlShell>
      <div className="flex flex-col gap-1 px-3 pt-2.5">
        <div className="flex min-w-0 items-baseline gap-2">
          <p className="shrink-0 font-medium text-sm">Allow {summary.title}?</p>
          {pathLine ? (
            <p className="min-w-0 truncate font-mono text-[11px] text-muted-foreground">
              {pathLine}
            </p>
          ) : null}
        </div>
        {detailLines.length > 0 ? (
          <p className="truncate font-mono text-[11px] text-muted-foreground">
            {detailLines.map((line) => `${line.label} ${line.value}`).join(' · ')}
          </p>
        ) : null}
        {summary.preview ? <HitlPreview preview={summary.preview} /> : null}
        {!pathLine && !detailLines.length && !summary.preview ? (
          <p className="text-[11px] text-muted-foreground">No input parameters.</p>
        ) : null}
      </div>

      <InputGroupTextarea
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Deny reason (optional)"
        disabled={busy}
        rows={1}
        className="min-h-0 py-1.5 text-sm"
      />

      <InputGroupAddon align="block-end" className="justify-end gap-1 px-2 pb-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={busy}
          className="h-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => void decide(false)}
        >
          Deny
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={busy}
          className="h-7"
          onClick={() => void decide(true)}
        >
          Allow
        </Button>
      </InputGroupAddon>
    </HitlShell>
  );
}

function AskCard({ pending, threadId }: { pending: PendingHitl; threadId: string }) {
  const schema = pending.schema as Record<string, unknown> | undefined;
  const options = (schema?.options as Array<{ id: string; label: string }>) ?? [];
  const multi = Boolean(schema?.multi);
  const [selected, setSelected] = useState<string[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const toggle = (id: string) => {
    setSelected((prev) => {
      if (multi) {
        return prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id];
      }
      return prev.includes(id) ? [] : [id];
    });
  };

  const submit = async () => {
    if (busy) {
      return;
    }
    const trimmed = text.trim();
    const payload: Record<string, unknown> = {};
    if (selected.length > 0) {
      payload.optionIds = selected;
    }
    if (trimmed) {
      payload.text = trimmed;
    }
    if (!payload.optionIds && !payload.text) {
      return;
    }
    setBusy(true);
    try {
      await respondToAsk(threadId, pending.askId, payload);
    } catch (error) {
      toast.add({
        title: 'Could not answer',
        description: error instanceof Error ? error.message : 'Answer failed',
      });
    } finally {
      setBusy(false);
    }
  };

  const canSubmit = selected.length > 0 || text.trim().length > 0;

  return (
    <HitlShell>
      <div className="flex flex-col gap-1 px-3 pt-2.5">
        {pending.prompt ? <Markdown text={pending.prompt} className="px-0 text-sm" /> : null}
        {options.length > 0 &&
          (multi ? (
            <div className="flex flex-col gap-0.5 py-0.5">
              {options.map((option) => {
                const active = selected.includes(option.id);
                return (
                  <button
                    key={option.id}
                    type="button"
                    disabled={busy}
                    onClick={() => toggle(option.id)}
                    className={cn(
                      'flex items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm transition-colors',
                      active ? 'bg-muted text-foreground' : 'hover:bg-muted/60',
                    )}
                  >
                    <span
                      className={cn(
                        'flex size-3.5 shrink-0 items-center justify-center rounded-sm border text-[9px]',
                        active ? 'border-foreground bg-foreground text-background' : 'border-input',
                      )}
                    >
                      {active ? '✓' : null}
                    </span>
                    {option.label}
                  </button>
                );
              })}
            </div>
          ) : (
            <RadioGroup
              value={selected[0] ?? ''}
              disabled={busy}
              onValueChange={(value) => {
                if (typeof value === 'string') {
                  setSelected(value ? [value] : []);
                }
              }}
              className="gap-0.5 py-0.5"
            >
              {options.map((option) => (
                <Label
                  key={option.id}
                  htmlFor={`hitl-opt-${option.id}`}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 font-normal transition-colors',
                    selected[0] === option.id ? 'bg-muted' : 'hover:bg-muted/60',
                  )}
                >
                  <RadioGroupItem
                    id={`hitl-opt-${option.id}`}
                    value={option.id}
                    className="data-checked:border-live data-checked:bg-live data-checked:text-white dark:data-checked:bg-live"
                  />
                  <span className="text-sm">{option.label}</span>
                </Label>
              ))}
            </RadioGroup>
          ))}
      </div>

      <InputGroupTextarea
        id="hitl-ask-custom"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={options.length > 0 ? 'Or type your own answer…' : 'Your answer…'}
        disabled={busy}
        rows={1}
        className="min-h-0 py-1.5 text-sm"
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && canSubmit) {
            event.preventDefault();
            void submit();
          }
        }}
      />

      <InputGroupAddon align="block-end" className="justify-end gap-1 px-2 pb-2">
        <Button
          type="button"
          size="sm"
          disabled={busy || !canSubmit}
          className="h-7"
          onClick={() => void submit()}
        >
          Submit
        </Button>
      </InputGroupAddon>
    </HitlShell>
  );
}

function HitlShell({ children }: { children: ReactNode }) {
  return <InputGroup className="h-auto rounded-2xl">{children}</InputGroup>;
}
