import './composer-editor.css';

import { Extension } from '@tiptap/core';
import { Document } from '@tiptap/extension-document';
import { HardBreak } from '@tiptap/extension-hard-break';
import { Paragraph } from '@tiptap/extension-paragraph';
import { Text } from '@tiptap/extension-text';
import { Placeholder, UndoRedo } from '@tiptap/extensions';
import { Plugin } from '@tiptap/pm/state';
import { EditorContent, useEditor } from '@tiptap/react';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { type ComposerPayload, serializeComposerDoc } from '../model/composer-doc';
import { InlineEntityNode } from '../model/inline-entity-node';
import type { SlashCommand } from '../model/slash-commands';
import { createSlashSuggestion } from './suggestion-menu';

export type ComposerEditorHandle = {
  getPayload(): ComposerPayload;
  clear(): void;
  focus(): void;
};

export type ComposerEditorProps = {
  placeholder: string;
  disabled: boolean;
  onChange(payload: ComposerPayload): void;
  onSubmit(): void;
  onSlashCommand(command: SlashCommand): void;
  shouldConsumePaste(data: DataTransfer): boolean;
};

const EDITOR_CLASS = 'tiptap w-full px-3 py-3 text-[15px] leading-6 min-h-14 outline-none';

export const ComposerEditor = forwardRef<ComposerEditorHandle, ComposerEditorProps>(
  function ComposerEditor(props, ref) {
    const latest = useRef(props);
    latest.current = props;
    const placeholderRef = useRef(props.placeholder);

    const extensions = useMemo(() => {
      const submitKeymap = Extension.create({
        name: 'composer-submit-keymap',
        addProseMirrorPlugins() {
          return [
            new Plugin({
              props: {
                handleKeyDown(_view, event) {
                  if (
                    event.key !== 'Enter' ||
                    event.shiftKey ||
                    event.isComposing ||
                    event.defaultPrevented ||
                    latest.current.disabled
                  ) {
                    return false;
                  }
                  latest.current.onSubmit();
                  return true;
                },
                handlePaste(_view, event) {
                  return event.clipboardData
                    ? latest.current.shouldConsumePaste(event.clipboardData)
                    : false;
                },
                handleDrop() {
                  return true;
                },
              },
            }),
          ];
        },
      });
      return [
        Document,
        Paragraph,
        Text,
        HardBreak,
        InlineEntityNode,
        UndoRedo,
        Placeholder.configure({
          placeholder: () => placeholderRef.current,
          showOnlyWhenEditable: false,
        }),
        submitKeymap,
        createSlashSuggestion({
          isDisabled: () => latest.current.disabled,
          onExecute: (command) => latest.current.onSlashCommand(command),
        }),
      ];
    }, []);

    const editorProps = useMemo(
      () => ({
        attributes: {
          class: EDITOR_CLASS,
          'data-slot': 'input-group-control',
        },
      }),
      [],
    );

    const editor = useEditor({
      extensions,
      editable: !props.disabled,
      editorProps,
      onUpdate: ({ editor }) => {
        latest.current.onChange(serializeComposerDoc(editor.state.doc));
      },
    });

    useEffect(() => {
      editor.setEditable(!props.disabled);
    }, [props.disabled, editor]);

    useEffect(() => {
      placeholderRef.current = props.placeholder;
      editor.view.dispatch(editor.state.tr);
    }, [props.placeholder, editor]);

    useImperativeHandle(
      ref,
      () => ({
        getPayload: () => serializeComposerDoc(editor.state.doc),
        clear: () => editor.commands.clearContent(),
        focus: () => editor.commands.focus(),
      }),
      [editor],
    );

    return (
      <EditorContent
        editor={editor}
        className={props.disabled ? 'min-w-0 flex-1 opacity-50' : 'min-w-0 flex-1'}
      />
    );
  },
);
