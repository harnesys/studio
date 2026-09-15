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
import { $insertInlineEntity, InlineEntityNode } from '../model/inline-entity-node';
import { type SkillOption, useComposerSkillOptions } from '../model/skill-source';
import type { SlashCommand } from '../model/slash-commands';
import { type PickerAnchor, SkillPicker } from './picker-menu';
import { createSlashSuggestion, exitSlashSuggestion } from './suggestion-menu';

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
const PICKER_WIDTH = 320;

export const ComposerEditor = forwardRef<ComposerEditorHandle, ComposerEditorProps>(
  function ComposerEditor(props, ref) {
    const latest = useRef(props);
    latest.current = props;
    const placeholderRef = useRef(props.placeholder);
    const [picker, setPicker] = useState<PickerAnchor | null>(null);
    const pickerAt = useRef(0);
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
          onPicker: (_command, at, editor) => {
            const box = editor.view.coordsAtPos(at);
            pickerAt.current = at;
            setPicker({
              left: Math.max(8, Math.min(box.left, window.innerWidth - PICKER_WIDTH - 8)),
              bottom: Math.max(8, window.innerHeight - box.top + 8),
            });
          },
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
              />,
              document.body,
            )
          : null}
      </>
    );
  },
);
