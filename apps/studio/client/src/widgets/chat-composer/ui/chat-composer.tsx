import { DEFAULT_MODE_ID } from '@harnesys/studio-shared';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpIcon, LoaderCircleIcon, SquareIcon, TriangleAlertIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useScheduleStore } from '@/entities/schedule';
import { useSessionStore } from '@/entities/session';
import { useSelectedAgent, useSelectedThread, useThreadEvents } from '@/features/desk';
import { ModelSelect } from '@/features/manage-agent';
import { pendingHitl, useRunStreamState } from '@/features/send-message';
import { cancelRun, providersQuery } from '@/shared/api';
import { studioFocusWorkspaceId, useStudioLocation } from '@/shared/config/location';
import { findModelLabel } from '@/shared/lib/model-label';
import { Button } from '@/shared/ui/button';
import { InputGroup, InputGroupAddon } from '@/shared/ui/input-group';
import { Kbd } from '@/shared/ui/kbd';
import { addComposerFiles } from '../model/add-composer-files';
import {
  agentDefaultEffort,
  agentEfforts,
  agentModelVerified,
  selectedEffort,
} from '../model/agent-effort';
import { composerUsage } from '../model/composer-context';
import type { ComposerPayload } from '../model/composer-doc';
import { type ComposerMode, composerModeItems, knownMode } from '../model/composer-mode';
import { filesFromClipboard } from '../model/composer-send';
import { executeComposerSlash, submitComposer } from '../model/composer-submit';
import { useComposerFileOptions } from '../model/file-source';
import { modelContextWindow } from '../model/model-context';
import { allowedAttachKinds, modelInputModalities } from '../model/model-input';
import { fileFromPastedText } from '../model/paste-as-file';
import type { SlashCommand } from '../model/slash-commands';
import { switchComposerModel } from '../model/switch-composer-model';
import { AttachDraft } from './attach-draft';
import { AttachMenu } from './attach-menu';
import { ComposerEditor, type ComposerEditorHandle } from './composer-editor';
import { ContextRing } from './context-ring';
import { EffortSelect } from './effort-select';
import { ModeSelect } from './mode-select';
import { UnverifiedModelCard } from './unverified-model-card';

export function ChatComposer() {
  const agent = useSelectedAgent();
  const thread = useSelectedThread();
  const workspaceId = studioFocusWorkspaceId(useStudioLocation());
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
  // Draft text lives in the editor; React keeps only sendability so typing never re-renders.
  const [hasText, setHasText] = useState(false);
  const [pending, setPending] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [mode, setMode] = useState<ComposerMode>(DEFAULT_MODE_ID);
  const editorRef = useRef<ComposerEditorHandle>(null);
  const scheduleMode = useScheduleStore((state) => {
    if (thread?.kind !== 'schedule') {
      return null;
    }
    return state.items.find((item) => item.threadId === thread.id)?.modeId ?? null;
  });
  const [effort, setEffort] = useState<string | undefined>(undefined);
  const modelDefaultEffort = agentDefaultEffort(modelId, providers);
  const currentEffort = selectedEffort(
    levels,
    effort ?? agent?.effort ?? undefined,
    modelDefaultEffort,
  );
  const verified = agentModelVerified(modelId, providers);
  const disabled = !agent || !thread || sending || streaming || Boolean(hitl);
  const contextWindow = modelContextWindow(modelId, providers);
  const usage = composerUsage(events, modelId, providers, contextWindow);
  const inputModalities = modelInputModalities(modelId, providers);
  const allowed = allowedAttachKinds(inputModalities);
  const pendingNames = useMemo(() => pending.map((file) => file.name), [pending]);
  const fileOptions = useComposerFileOptions(thread?.id ?? null, pendingNames);
  const canSend = hasText || pending.length > 0;
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
    const next = selectedEffort(levels, effort ?? agent?.effort ?? undefined, modelDefaultEffort);
    if (next !== effort) {
      setEffort(next);
    }
  }, [levels, effort, agent?.effort, modelDefaultEffort]);

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

  return (
    <div className="relative mx-auto w-full max-w-3xl px-4 pb-3" data-testid="chat-composer">
      {streamLabel ? (
        <div className="mb-1.5 flex items-center gap-1.5 px-1 font-mono text-[11px] text-muted-foreground">
          <LoaderCircleIcon className="size-3 animate-spin text-live" />
          <span>{streamLabel}</span>
        </div>
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
        <ComposerEditor
          ref={editorRef}
          disabled={disabled}
          placeholder={placeholder}
          fileOptions={fileOptions.options}
          onChange={handleDraftChange}
          onSubmit={submit}
          onSlashCommand={runSlashCommand}
          shouldConsumePaste={pasteIsHandled}
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
              last={usage.last}
              run={usage.run}
              thread={usage.thread}
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
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 pt-2 font-mono text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Kbd>Control</Kbd>+<Kbd>Enter</Kbd>
          <span>send</span>
        </span>
        <span className="inline-flex items-center gap-1">
          <Kbd>/</Kbd>
          <span>commands</span>
        </span>
        <span className="inline-flex items-center gap-1">
          <Kbd>#</Kbd>
          <span>attachments</span>
        </span>
        <span className="inline-flex items-center gap-1">
          <Kbd>@</Kbd>
          <span>agent mention</span>
        </span>
      </div>
    </div>
  );

  function handleDraftChange(next: ComposerPayload) {
    const nextHasText = next.text.trim().length > 0;
    setHasText((prev) => (prev === nextHasText ? prev : nextHasText));
  }

  function addFiles(files: File[]) {
    const accepted = addComposerFiles(files, inputModalities, setPending);
    for (const file of accepted) {
      editorRef.current?.insertFileMention(file.name);
    }
  }

  function submit() {
    if (!thread) {
      return;
    }
    submitComposer({
      payload: editorRef.current?.getPayload() ?? { text: '', skills: [] },
      pending,
      threadId: thread.id,
      effort: currentEffort,
      mode,
      disabled,
      setSending,
      clear: () => editorRef.current?.clear(),
      setPending,
    });
  }

  function runSlashCommand(command: SlashCommand) {
    if (!thread) {
      return;
    }
    void executeComposerSlash(command, {
      threadId: thread.id,
      disabled,
      setSending,
    });
  }

  function pasteIsHandled(data: DataTransfer) {
    return (
      filesFromClipboard(data).length > 0 ||
      Boolean(
        fileFromPastedText(
          data.getData('text/plain'),
          pending.map((file) => file.name),
        ),
      )
    );
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
