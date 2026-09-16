import './composer-editor.css';

import { Extension } from '@tiptap/core';
import { Document } from '@tiptap/extension-document';
import { HardBreak } from '@tiptap/extension-hard-break';
import { Paragraph } from '@tiptap/extension-paragraph';
import { Text } from '@tiptap/extension-text';
import { Placeholder, UndoRedo } from '@tiptap/extensions';
import { Plugin } from '@tiptap/pm/state';
import { EditorContent, useEditor } from '@tiptap/react';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { type ComposerPayload, serializeComposerDoc } from '../model/composer-doc';
import { fileItems } from '../model/composer-providers';
import { isValidEntityRef } from '../model/entity-kinds';
import type { FileOption } from '../model/file-source';
import { $insertInlineEntity, InlineEntityNode } from '../model/inline-entity-node';
import { type SkillOption, useComposerSkillOptions } from '../model/skill-source';
import type { SlashCommand } from '../model/slash-commands';
import { createFileSuggestion, exitFileSuggestion, insertFileChip } from './file-suggestion-menu';
import { type PickerAnchor, SkillPicker } from './picker-menu';
import { createSlashSuggestion, exitSlashSuggestion } from './suggestion-menu';

export type ComposerEditorHandle = {
  getPayload(): ComposerPayload;
  clear(): void;
  focus(): void;
  insertFileMention(ref: string): void;
};

export type ComposerEditorProps = {
  placeholder: string;
  disabled: boolean;
  fileOptions: FileOption[];
  onChange(payload: ComposerPayload): void;
  onSubmit(): void;
  onSlashCommand(command: SlashCommand): void;
  shouldConsumePaste(data: DataTransfer): boolean;
};

const EDITOR_CLASS = 'tiptap w-full px-3 py-3 text-[15px] leading-6 min-h-14 outline-none';
const PICKER_WIDTH = 320;

export const ComposerEditor = forwardRef<ComposerEditorHandle, ComposerEditorProps>(
  function ComposerEditor(props, ref) {
    const latest = useRef(props);
    latest.current = props;
    const placeholderRef = useRef(props.placeholder);
    const [picker, setPicker] = useState<PickerAnchor | null>(null);
    const pickerAt = useRef(0);
    const pickerToken = useRef('');
    const skills = useComposerSkillOptions();

    const closePicker = useCallback(() => setPicker(null), []);

    const extensions = useMemo(() => {
      const submitKeymap = Extension.create({
        name: 'composer-submit-keymap',
        priority: 90,
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
                handleDrop(_view, event) {
                  // Files stay with the InputGroup drop handler; text/link drops go to ProseMirror.
                  return event.dataTransfer?.types.includes('Files') ?? false;
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
          onPicker: (_command, at, editor, consumed) => {
            const box = editor.view.coordsAtPos(at);
            pickerAt.current = at;
            pickerToken.current = consumed;
            setPicker({
              left: Math.max(8, Math.min(box.left, window.innerWidth - PICKER_WIDTH - 8)),
              bottom: Math.max(8, window.innerHeight - box.top + 8),
            });
          },
        }),
        createFileSuggestion({
          isDisabled: () => latest.current.disabled,
          // Suggestion must never break typing: on any failure show no items.
          getItems: (query) => safeFileItems(query, latest.current.fileOptions),
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
      onBlur: () => closePicker(),
      onUpdate: ({ editor }) => {
        latest.current.onChange(serializeComposerDoc(editor.state.doc));
      },
    });

    useEffect(() => {
      editor.setEditable(!props.disabled);
      if (props.disabled) {
        exitSlashSuggestion(editor.view);
        exitFileSuggestion(editor.view);
        closePicker();
      }
    }, [props.disabled, editor, closePicker]);

    useEffect(() => {
      placeholderRef.current = props.placeholder;
      editor.view.dispatch(editor.state.tr);
    }, [props.placeholder, editor]);

    const pickSkill = useCallback(
      (option: SkillOption) => {
        const at = pickerAt.current;
        $insertInlineEntity(editor, at, { kind: 'skill', ref: option.name });
        editor
          .chain()
          .insertContentAt(at + 1, ' ')
          .focus()
          .run();
        closePicker();
      },
      [editor, closePicker],
    );

    // Spec §3: Esc closes the picker and restores the token text it consumed.
    const escPicker = useCallback(() => {
      const token = pickerToken.current;
      if (token) {
        editor.chain().focus().insertContentAt(pickerAt.current, token).run();
      }
      closePicker();
    }, [editor, closePicker]);

    const insertFileMention = useCallback(
      (mentionRef: string) => {
        if (latest.current.disabled || !isValidEntityRef('file', mentionRef)) {
          return;
        }
        insertFileChip(editor, editor.state.selection.from, mentionRef);
      },
      [editor],
    );

    useImperativeHandle(
      ref,
      () => ({
        getPayload: () => serializeComposerDoc(editor.state.doc),
        clear: () => editor.commands.clearContent(),
        focus: () => editor.commands.focus(),
        insertFileMention,
      }),
      [editor, insertFileMention],
    );

    return (
      <>
        <EditorContent
          editor={editor}
          className={props.disabled ? 'min-w-0 flex-1 opacity-50' : 'min-w-0 flex-1'}
        />
        {picker
          ? createPortal(
              <SkillPicker
                options={skills.options}
                loading={skills.loading}
                anchor={picker}
                onPick={pickSkill}
                onClose={closePicker}
                onEsc={escPicker}
              />,
              document.body,
            )
          : null}
      </>
    );
  },
);

function safeFileItems(query: string, options: FileOption[] | undefined): FileOption[] {
  try {
    return fileItems(query, options ?? []);
  } catch {
    return [];
  }
}
