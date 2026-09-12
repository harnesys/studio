import { DEFAULT_MODE_ID } from '@harnesys/studio-shared';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpIcon, LoaderCircleIcon, SquareIcon, TriangleAlertIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useScheduleStore } from '@/entities/schedule';
import { rollupUsage, useSessionStore } from '@/entities/session';
import { useSelectedAgent, useSelectedThread, useThreadEvents } from '@/features/desk';
import { ModelSelect } from '@/features/manage-agent';
import { pendingHitl, useRunStreamState } from '@/features/send-message';
import { cancelRun, providersQuery } from '@/shared/api';
import { useStudioLocation } from '@/shared/config/location';
import { findModelLabel } from '@/shared/lib/model-label';
import { Button } from '@/shared/ui/button';
import { InputGroup, InputGroupAddon, InputGroupTextarea } from '@/shared/ui/input-group';
import { addComposerFiles } from '../model/add-composer-files';
import { agentEfforts, agentModelVerified, selectedEffort } from '../model/agent-effort';
import { type ComposerMode, composerModeItems, knownMode } from '../model/composer-mode';
import { filesFromClipboard } from '../model/composer-send';
import { executeComposerSlash, submitComposer } from '../model/composer-submit';
import {
  fillUsageCost,
  fillUsageWindow,
  generationUsages,
  modelContextWindow,
  turnGenerationUsages,
} from '../model/model-context';
import { allowedAttachKinds, modelInputModalities } from '../model/model-input';
import { fileFromPastedText } from '../model/paste-as-file';
import { matchSlashCommands } from '../model/slash-commands';
import { handleComposerKeyDown } from '../model/slash-keydown';
import { switchComposerModel } from '../model/switch-composer-model';
import { AttachDraft } from './attach-draft';
import { AttachMenu } from './attach-menu';
import { ContextRing } from './context-ring';
import { EffortSelect } from './effort-select';
import { ModeSelect } from './mode-select';
import { SlashMenu } from './slash-menu';
import { UnverifiedModelCard } from './unverified-model-card';

export function ChatComposer() {
  const agent = useSelectedAgent();
  const thread = useSelectedThread();
  const { workspaceId } = useStudioLocation();
  const events = useThreadEvents(thread?.id ?? null);
  const providers = useQuery(providersQuery).data ?? [];
  const modelId = agent?.modelId;
  const levels = agentEfforts(modelId, providers);
  const streaming = useSessionStore((state) =>
    thread ? Boolean(state.activeRuns[thread.id]) : false,
  );
  const streamState = useRunStreamState(thread?.id ?? null);
  const streamLabel = streaming ? streamStatusLabel(streamState) : null;
  const activeRunId = useSessionStore((state) =>
    thread ? (state.activeRuns[thread.id]?.runId ?? null) : null,
  );
  const hitl = pendingHitl(events);
  const [value, setValue] = useState('');
  const [pending, setPending] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [slashIndex, setSlashIndex] = useState(0);
  const [mode, setMode] = useState<ComposerMode>(DEFAULT_MODE_ID);
  const slashMatches = matchSlashCommands(value);
  const scheduleMode = useScheduleStore((state) => {
    if (thread?.kind !== 'schedule') {
      return null;
    }
    return state.items.find((item) => item.threadId === thread.id)?.modeId ?? null;
  });
  const [effort, setEffort] = useState<string | undefined>(undefined);
  const currentEffort = selectedEffort(levels, effort ?? agent?.effort ?? undefined);
  const verified = agentModelVerified(modelId, providers);
  const disabled = !agent || !thread || sending || streaming || Boolean(hitl);
  const slashOpen = slashMatches.length > 0 && pending.length === 0 && !disabled;
  const contextWindow = modelContextWindow(modelId, providers);
  const usages = generationUsages(events).map((item) => {
    const filled = fillUsageCost(item, modelId, providers);
    return filled ?? item;
  });
  const lastUsage = fillUsageWindow(usages.at(-1) ?? null, contextWindow);
  const runUsage = rollupUsage(
    turnGenerationUsages(events).map((item) => fillUsageCost(item, modelId, providers) ?? item),
  );
  const threadUsage = rollupUsage(usages);
  const inputModalities = modelInputModalities(modelId, providers);
  const allowed = allowedAttachKinds(inputModalities);
  const canSend = value.trim().length > 0 || pending.length > 0;
  let placeholder = 'Select an agent to start a thread';
  if (hitl) {
    if (hitl.source === 'ask_user') {
      placeholder = 'Answer the prompt above…';
    } else {
      placeholder = 'Allow or deny the tool above…';
    }
  } else if (streaming) {
    placeholder = 'Agent is thinking…';
  } else if (agent) {
    placeholder = `Message ${agent.name}…`;
  }

  useEffect(() => {
    const next = selectedEffort(levels, effort ?? agent?.effort ?? undefined);
    if (next !== effort) {
      setEffort(next);
    }
  }, [levels, effort, agent?.effort]);

  const agentModes = agent?.modes ?? [];
  useEffect(() => {
    if (scheduleMode && knownMode(agentModes, scheduleMode)) {
      setMode(scheduleMode);
      return;
    }
    if (thread?.runMode && knownMode(agentModes, thread.runMode)) {
      setMode(thread.runMode);
      return;
    }
    if (agent?.defaultModeId && knownMode(agentModes, agent.defaultModeId)) {
      setMode(agent.defaultModeId);
      return;
    }
    setMode(DEFAULT_MODE_ID);
  }, [thread?.runMode, scheduleMode, agent?.defaultModeId, agentModes]);

  useEffect(() => {
    setSlashIndex(0);
  }, []);

  return (
    <div className="relative mx-auto w-full max-w-3xl px-4 pb-4" data-testid="chat-composer">
      {streamLabel ? (
        <div className="mb-1.5 flex items-center gap-1.5 px-1 font-mono text-[11px] text-muted-foreground">
          <LoaderCircleIcon className="size-3 animate-spin text-live" />
          <span>{streamLabel}</span>
        </div>
      ) : null}
      {slashOpen ? (
        <SlashMenu
          commands={slashMatches}
          activeIndex={slashIndex}
          onHover={setSlashIndex}
          onPick={(command) => {
            if (!thread) {
              return;
            }
            void executeComposerSlash(command, {
              threadId: thread.id,
              disabled,
              setSending,
              setValue,
            });
          }}
        />
      ) : null}
      <InputGroup
        className="h-auto rounded-2xl"
        onDragOver={(event) => {
          event.preventDefault();
        }}
        onDrop={(event) => {
          event.preventDefault();
          addFiles(Array.from(event.dataTransfer.files));
        }}
        onPaste={(event) => {
          const files = filesFromClipboard(event.clipboardData);
          const pasted = fileFromPastedText(
            event.clipboardData.getData('text/plain'),
            pending.map((file) => file.name),
          );
          if (files.length === 0 && !pasted) {
            return;
          }
          event.preventDefault();
          addFiles(pasted ? [...files, pasted] : files);
        }}
      >
        <AttachDraft
          files={pending}
          onRemove={(index) => setPending((list) => list.filter((_, i) => i !== index))}
        />
        <InputGroupTextarea
          value={value}
          disabled={disabled}
          rows={2}
          className="min-h-14 py-3"
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) =>
            handleComposerKeyDown(event, {
              open: slashOpen,
              matches: slashMatches,
              activeIndex: slashIndex,
              streaming,
              setActiveIndex: setSlashIndex,
              clearValue: () => setValue(''),
              fillCommand: (name) => setValue(`/${name}`),
              runCommand: (command) => {
                if (!thread) {
                  return;
                }
                void executeComposerSlash(command, {
                  threadId: thread.id,
                  disabled,
                  setSending,
                  setValue,
                });
              },
              submit,
            })
          }
          placeholder={placeholder}
        />
        <InputGroupAddon align="block-end" className="justify-between gap-2 px-2 pb-2">
          <div className="flex min-w-0 items-center gap-0.5">
            <AttachMenu allowed={allowed} disabled={disabled} onPick={addFiles} />
            <ModeSelect
              modes={composerModeItems(agentModes)}
              value={mode}
              disabled={disabled}
              onChange={setMode}
            />
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <ContextRing
              last={lastUsage}
              run={runUsage}
              thread={threadUsage}
              window={contextWindow}
              disabled={!agent || !thread}
            />
            <ModelSelect
              value={agent?.modelId ?? null}
              disabled={disabled || !agent || !workspaceId}
              size="sm"
              triggerClassName="h-7 max-w-44 border-0 bg-transparent px-1.5 font-mono text-[11px] shadow-none"
              onChange={(next) => {
                if (!agent || !workspaceId || !next) {
                  return;
                }
                switchComposerModel({
                  agent,
                  workspaceId,
                  nextModelId: next,
                  hasEvents: events.length > 0,
                  providers,
                });
              }}
            />
            {currentEffort ? (
              <EffortSelect
                levels={levels}
                value={currentEffort}
                disabled={disabled}
                onChange={setEffort}
              />
            ) : null}
            {verified ? null : (
              <UnverifiedModelCard modelName={findModelLabel(modelId, providers)}>
                <button
                  type="button"
                  className="inline-flex size-7 items-center justify-center text-amber-500 transition-colors hover:text-amber-400 focus-visible:outline-none"
                  data-testid="model-unverified"
                >
                  <TriangleAlertIcon className="size-3.5" />
                </button>
              </UnverifiedModelCard>
            )}
            {streaming ? (
              <Button
                size="icon-xs"
                variant="destructive"
                className="rounded-full"
                onClick={() => {
                  if (!thread) {
                    return;
                  }
                  const runId = activeRunId;
                  useSessionStore.getState().abortRun(thread.id);
                  if (runId) {
                    void cancelRun(runId).catch(() => {});
                  }
                }}
                title="Stop generation"
              >
                <SquareIcon className="size-3 fill-current" />
                <span className="sr-only">Stop</span>
              </Button>
            ) : (
              <Button
                size="icon-xs"
                disabled={disabled || !canSend}
                onClick={submit}
                title={hitl ? 'Ответьте на вопрос агента' : undefined}
              >
                <ArrowUpIcon />
                <span className="sr-only">Send</span>
              </Button>
            )}
          </div>
        </InputGroupAddon>
      </InputGroup>
    </div>
  );

  function addFiles(files: File[]) {
    addComposerFiles(files, inputModalities, setPending);
  }

  function submit() {
    if (!thread) {
      return;
    }
    submitComposer({
      value,
      pending,
      threadId: thread.id,
      effort: currentEffort,
      mode,
      disabled,
      setSending,
      setValue,
      setPending,
    });
  }
}

function streamStatusLabel(state: string | null): string | null {
  switch (state) {
    case 'connecting':
      return 'Connecting…';
    case 'queued':
      return 'Queued…';
    case 'live':
      return 'Agent is working…';
    case 'paused':
      return 'Waiting for input…';
    case 'reconnecting':
      return 'Reconnecting…';
    case 'offline':
      return 'Connection lost';
    default:
      return 'Agent is thinking…';
  }
}
