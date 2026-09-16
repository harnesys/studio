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
import { forwardRef, useCallback, useImperativeHandle, useState } from 'react';
import type { FileOption, FileOptionSource } from '../model/file-source';
import { $insertInlineEntity } from '../model/inline-entity-node';

export const fileSuggestionKey = new PluginKey('composer-file');

export function exitFileSuggestion(view: EditorView): void {
  exitSuggestion(view, fileSuggestionKey);
}

export type FileSuggestionOptions = {
  isDisabled(): boolean;
  getItems(query: string): FileOption[];
};

export type FileSuggestionMenuHandle = {
  onKeyDown(event: KeyboardEvent): boolean;
};

export type FileSuggestionMenuProps = {
  items: FileOption[];
  onSelect(option: FileOption): void;
};

export function createFileSuggestion(options: FileSuggestionOptions) {
  return Extension.create({
    name: 'composer-file-suggestion',
    addProseMirrorPlugins() {
      return [
        Suggestion<FileOption, FileOption>({
          pluginKey: fileSuggestionKey,
          editor: this.editor,
          char: '#',
          allowedPrefixes: [' '],
          placement: 'top-start',
          offset: { mainAxis: 8 },
          floatingUi: { strategy: 'fixed' },
          allow: () => !options.isDisabled(),
          shouldShow: ({ query }) => !options.isDisabled() && options.getItems(query).length > 0,
          items: ({ query }) => options.getItems(query),
          command: ({ editor, range, props }) => {
            editor.chain().focus().deleteRange(range).run();
            insertFileChip(editor, range.from, props.ref);
          },
          render: () => createFileMenuRenderer(),
        }),
      ];
    },
  });
}

export function insertFileChip(editor: Editor, at: number, ref: string): void {
  $insertInlineEntity(editor, at, { kind: 'file', ref });
  editor
    .chain()
    .insertContentAt(at + 1, ' ')
    .focus()
    .run();
}

function createFileMenuRenderer() {
  let component: ReactRenderer<FileSuggestionMenuHandle, FileSuggestionMenuProps> | null = null;
  let unmount: (() => void) | null = null;

  const destroy = () => {
    unmount?.();
    component?.destroy();
    component = null;
    unmount = null;
  };

  return {
    onStart: (props: SuggestionProps<FileOption, FileOption>) => {
      destroy();
      component = new ReactRenderer(FileSuggestionMenu, {
        editor: props.editor,
        props: { items: props.items, onSelect: props.command },
        className: 'z-50',
      });
      unmount = props.mount(component.element);
    },
    onUpdate: (props: SuggestionProps<FileOption, FileOption>) => {
      component?.updateProps({ items: props.items, onSelect: props.command });
    },
    onKeyDown: (props: SuggestionKeyDownProps) => component?.ref?.onKeyDown(props.event) ?? false,
    onExit: destroy,
  };
}

export const FileSuggestionMenu = forwardRef<FileSuggestionMenuHandle, FileSuggestionMenuProps>(
  function FileSuggestionMenu({ items, onSelect }, ref) {
    const [active, setActive] = useState(0);
    const safeActive = active < items.length ? active : 0;

    const scrollActiveIntoView = useCallback((node: HTMLLIElement | null) => {
      node?.scrollIntoView({ block: 'nearest' });
    }, []);

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
        className="w-max max-w-[min(48rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-md"
        data-testid="file-suggestion-menu"
      >
        <ul className="max-h-56 overflow-y-auto py-1">
          {items.map((option, index) => {
            const isActive = index === safeActive;
            const { name, dir } = splitRef(option.ref);
            return (
              <li
                key={`${option.source}:${option.ref}`}
                ref={isActive ? scrollActiveIntoView : undefined}
              >
                <button
                  type="button"
                  title={option.ref}
                  className={`flex w-full items-start gap-3 rounded-md px-3 py-2 text-left text-sm ${
                    isActive ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/60'
                  }`}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => onSelect(option)}
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate font-medium font-mono text-xs">{name}</span>
                    {dir ? (
                      <span className="truncate text-muted-foreground text-xs">{dir}</span>
                    ) : null}
                  </div>
                  <span className="shrink-0 rounded-md border border-border bg-secondary px-1.5 font-mono text-[10px] text-muted-foreground leading-4">
                    {sourceLabel(option.source)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    );
  },
);

function splitRef(ref: string): { name: string; dir: string } {
  const slash = ref.lastIndexOf('/');
  if (slash < 0) {
    return { name: ref, dir: '' };
  }
  return { name: ref.slice(slash + 1), dir: ref.slice(0, slash) };
}

function sourceLabel(source: FileOptionSource): string {
  switch (source) {
    case 'upload':
      return 'upload';
    case 'attachment':
      return 'thread file';
    case 'workspace':
      return 'workspace';
  }
}

type MenuKeydownState = {
  items: FileOption[];
  active: number;
  onSelect(option: FileOption): void;
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
