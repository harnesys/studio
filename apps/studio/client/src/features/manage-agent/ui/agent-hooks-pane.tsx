import type { HookEventName, HookHandler, HooksBinding } from 'harnesys';
import { NATIVE_HOOK_EVENTS } from 'harnesys/domain';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/shared/ui/button';
import { RowHeader, STICKY_PANE_HEADER } from '@/shared/ui/capability-rows';
import { Input } from '@/shared/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';

const HANDLER_TYPES = ['command', 'prompt', 'http'] as const;
type UiHandlerType = (typeof HANDLER_TYPES)[number];

const HANDLER_TYPE_LABELS: Record<UiHandlerType, string> = {
  command: 'Run command',
  prompt: 'Prompt model',
  http: 'Call url',
};

const DEFAULT_HANDLERS: Record<UiHandlerType, () => HookHandler> = {
  command: () => ({ type: 'command', command: '' }),
  prompt: () => ({ type: 'prompt', prompt: '' }),
  http: () => ({ type: 'http', url: '' }),
};

export function AgentHooksPane({
  value,
  onChange,
}: {
  value: HooksBinding[];
  onChange: (next: HooksBinding[]) => void;
}) {
  const [hooks, setHooks] = useState(value);

  function commit(next: HooksBinding[]) {
    setHooks(next);
    onChange(next);
  }

  function patch(index: number, patch: Partial<HooksBinding>) {
    commit(hooks.map((hook, i) => (i === index ? { ...hook, ...patch } : hook)));
  }

  function patchHandler(index: number, handler: HookHandler) {
    patch(index, { handler });
  }

  function switchHandlerType(index: number, next: UiHandlerType) {
    const current = hooks[index]?.handler;
    if (current?.type === next) {
      return;
    }
    patchHandler(index, DEFAULT_HANDLERS[next]());
  }

  function addHook() {
    commit([...hooks, { event: 'UserPromptSubmit', handler: DEFAULT_HANDLERS.command() }]);
  }

  function removeHook(index: number) {
    commit(hooks.filter((_, i) => i !== index));
  }

  return (
    <section className="flex min-w-0 flex-col gap-1" data-testid="agent-hooks-pane">
      <RowHeader
        className={STICKY_PANE_HEADER}
        label="Hooks"
        count={hooks.length}
        description="Handlers on engine seams for every run of this agent."
      >
        <Button type="button" variant="ghost" size="sm" onClick={addHook}>
          <PlusIcon />
          Add hook
        </Button>
      </RowHeader>
      {hooks.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-6 text-center text-muted-foreground text-sm">
          No hooks. Hooks run at engine seams on every run of this agent.
        </p>
      ) : null}
      {hooks.map((hook, index) => (
        <HookRow
          // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional bindings
          key={index}
          hook={hook}
          onEvent={(event) => patch(index, { event })}
          onMatcher={(matcher) => patch(index, { matcher })}
          onHandler={(handler) => patchHandler(index, handler)}
          onHandlerType={(type) => switchHandlerType(index, type)}
          onRemove={() => removeHook(index)}
        />
      ))}
    </section>
  );
}

function HookRow({
  hook,
  onEvent,
  onMatcher,
  onHandler,
  onHandlerType,
  onRemove,
}: {
  hook: HooksBinding;
  onEvent: (event: HookEventName) => void;
  onMatcher: (matcher: string) => void;
  onHandler: (handler: HookHandler) => void;
  onHandlerType: (type: UiHandlerType) => void;
  onRemove: () => void;
}) {
  const uiType = isUiHandlerType(hook.handler.type) ? hook.handler.type : null;
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-2">
      <div className="flex items-center gap-2">
        <EventSelect value={hook.event} onChange={onEvent} />
        <Input
          className="h-8 flex-1 font-mono text-xs"
          placeholder="matcher (optional)"
          value={hook.matcher ?? ''}
          onChange={(event) => onMatcher(event.target.value)}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Remove hook"
          onClick={onRemove}
        >
          <Trash2Icon />
        </Button>
      </div>
      <div className="flex items-center gap-2">
        {uiType ? (
          <Select
            items={HANDLER_TYPES.map((type) => ({ value: type, label: HANDLER_TYPE_LABELS[type] }))}
            value={uiType}
            onValueChange={(next) => {
              if (isUiHandlerType(next)) {
                onHandlerType(next);
              }
            }}
          >
            <SelectTrigger className="h-8 w-36" aria-label="Hook handler type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HANDLER_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {HANDLER_TYPE_LABELS[type]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="font-mono text-muted-foreground text-xs">{hook.handler.type}</span>
        )}
        <HandlerFields handler={hook.handler} disabled={!uiType} onChange={onHandler} />
      </div>
    </div>
  );
}

function HandlerFields({
  handler,
  disabled,
  onChange,
}: {
  handler: HookHandler;
  disabled: boolean;
  onChange: (handler: HookHandler) => void;
}) {
  if (disabled) {
    return <p className="flex-1 text-[11px] text-muted-foreground">Not editable here.</p>;
  }
  if (handler.type === 'command') {
    return (
      <Input
        className="h-8 flex-1 font-mono text-xs"
        placeholder="command"
        value={handler.command}
        onChange={(event) => onChange({ ...handler, command: event.target.value })}
      />
    );
  }
  if (handler.type === 'prompt') {
    return (
      <Input
        className="h-8 flex-1 font-mono text-xs"
        placeholder="prompt"
        value={handler.prompt}
        onChange={(event) => onChange({ ...handler, prompt: event.target.value })}
      />
    );
  }
  if (handler.type === 'http') {
    return (
      <Input
        className="h-8 flex-1 font-mono text-xs"
        placeholder="https://…"
        value={handler.url}
        onChange={(event) => onChange({ ...handler, url: event.target.value })}
      />
    );
  }
  return null;
}

function EventSelect({
  value,
  onChange,
}: {
  value: HookEventName;
  onChange: (event: HookEventName) => void;
}) {
  return (
    <Select
      items={NATIVE_HOOK_EVENTS.map((event) => ({ value: event, label: event }))}
      value={value}
      onValueChange={(next) => {
        if (isHookEventName(next)) {
          onChange(next);
        }
      }}
    >
      <SelectTrigger className="h-8 w-44 font-mono text-xs" aria-label="Hook event">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {NATIVE_HOOK_EVENTS.map((event) => (
          <SelectItem key={event} value={event} className="font-mono text-xs">
            {event}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function isHookEventName(value: string | null): value is HookEventName {
  return typeof value === 'string' && (NATIVE_HOOK_EVENTS as readonly string[]).includes(value);
}

function isUiHandlerType(value: string | null): value is UiHandlerType {
  return typeof value === 'string' && (HANDLER_TYPES as readonly string[]).includes(value);
}
