import { type Editor, Extension } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { ReactRenderer } from '@tiptap/react';
import {
  exitSuggestion,
  Suggestion,
  type SuggestionKeyDownProps,
  type SuggestionProps,
} from '@tiptap/suggestion';
import { forwardRef, useImperativeHandle, useState } from 'react';
import { commandItems } from '../model/composer-providers';
import type { SlashCommand } from '../model/slash-commands';

export const slashSuggestionKey = new PluginKey('composer-slash');

export function exitSlashSuggestion(view: EditorView): void {
  exitSuggestion(view, slashSuggestionKey);
}

export type SlashSuggestionOptions = {
  isDisabled(): boolean;
  onExecute(command: SlashCommand): void;
  onPicker(command: SlashCommand, at: number, editor: Editor): void;
};

export type SuggestionMenuHandle = {
  onKeyDown(event: KeyboardEvent): boolean;
};

export type SuggestionMenuProps = {
  items: SlashCommand[];
  onSelect(command: SlashCommand): void;
};

export function createSlashSuggestion(options: SlashSuggestionOptions) {
  return Extension.create({
    name: 'composer-slash-suggestion',
    addProseMirrorPlugins() {
      return [
        Suggestion<SlashCommand, SlashCommand>({
          pluginKey: slashSuggestionKey,
          editor: this.editor,
          char: '/',
          allowedPrefixes: [' '],
          placement: 'top-start',
          offset: { mainAxis: 8 },
          floatingUi: { strategy: 'fixed' },
          allow: () => !options.isDisabled(),
          shouldShow: ({ query }) => !options.isDisabled() && commandItems(query).length > 0,
          items: ({ query }) => commandItems(query),
          command: ({ editor, range, props }) => {
            editor.chain().focus().deleteRange(range).run();
            if (props.outcome.type === 'picker') {
              options.onPicker(props, range.from, editor);
            } else {
              options.onExecute(props);
            }
          },
          render: () => createSlashMenuRenderer(),
        }),
      ];
    },
  });
}

function createSlashMenuRenderer() {
  let component: ReactRenderer<SuggestionMenuHandle, SuggestionMenuProps> | null = null;
  let unmount: (() => void) | null = null;

  const destroy = () => {
    unmount?.();
    component?.destroy();
    component = null;
    unmount = null;
  };

  return {
    onStart: (props: SuggestionProps<SlashCommand, SlashCommand>) => {
      destroy();
      component = new ReactRenderer(SuggestionMenu, {
        editor: props.editor,
        props: { items: props.items, onSelect: props.command },
        className: 'z-50',
      });
      unmount = props.mount(component.element);
    },
    onUpdate: (props: SuggestionProps<SlashCommand, SlashCommand>) => {
      component?.updateProps({ items: props.items, onSelect: props.command });
    },
    onKeyDown: (props: SuggestionKeyDownProps) => component?.ref?.onKeyDown(props.event) ?? false,
    onExit: destroy,
  };
}

export const SuggestionMenu = forwardRef<SuggestionMenuHandle, SuggestionMenuProps>(
  function SuggestionMenu({ items, onSelect }, ref) {
    const [active, setActive] = useState(0);
    const safeActive = active < items.length ? active : 0;

    useImperativeHandle(
      ref,
      () => ({
        onKeyDown: (event) =>
          handleMenuKeyDown(event, { items, active: safeActive, onSelect, setActive }),
      }),
      [items, safeActive, onSelect],
    );

    return (
      <div
        className="w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-md"
        data-testid="suggestion-menu"
      >
        <ul className="max-h-56 overflow-y-auto py-1">
          {items.map((command, index) => {
            const isActive = index === safeActive;
            return (
              <li key={command.name}>
                <button
                  type="button"
                  className={`flex w-full items-start gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                    isActive ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/60'
                  }`}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => onSelect(command)}
                >
                  <span className="font-medium font-mono text-xs">/{command.name}</span>
                  <span className="text-muted-foreground text-xs">{command.description}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    );
  },
);

type MenuKeydownState = {
  items: SlashCommand[];
  active: number;
  onSelect(command: SlashCommand): void;
  setActive(update: (index: number) => number): void;
};

function handleMenuKeyDown(event: KeyboardEvent, state: MenuKeydownState): boolean {
  const { items, active, onSelect, setActive } = state;
  if (event.isComposing) {
    return false;
  }
  if (event.key === 'ArrowDown' && items.length > 0) {
    setActive((index) => (index + 1) % items.length);
    return true;
  }
  if (event.key === 'ArrowUp' && items.length > 0) {
    setActive((index) => (index - 1 + items.length) % items.length);
    return true;
  }
  if (event.key === 'Enter' && !event.shiftKey) {
    const picked = items[active] ?? items[0];
    if (picked) {
      onSelect(picked);
    }
    return true;
  }
  return false;
}
