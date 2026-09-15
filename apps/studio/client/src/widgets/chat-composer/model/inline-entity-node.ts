import type { Editor } from '@tiptap/core';
import { Node } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { EntityChipView } from '../ui/entity-chip-view';
import type { EntityKind } from './entity-kinds';
import { isValidEntityRef } from './entity-kinds';

export type InlineEntityAttrs = { kind: EntityKind; ref: string };

export const INLINE_ENTITY_TYPE = 'inlineEntity';

export const InlineEntityNode = Node.create<InlineEntityAttrs>({
  name: INLINE_ENTITY_TYPE,
  group: 'inline',
  inline: true,
  atom: true,
  addAttributes() {
    return {
      kind: {
        default: 'skill',
        parseHTML: (element) => element.getAttribute('data-inline-entity'),
        validate: (value): asserts value is EntityKind => {
          if (value !== 'skill') {
            throw new Error(`inlineEntity: unknown entity kind ${String(value)}`);
          }
        },
        rendered: false,
      },
      ref: {
        parseHTML: (element) => element.getAttribute('data-entity-ref'),
        validate: (value): void => {
          if (typeof value !== 'string' || !isValidEntityRef('skill', value)) {
            throw new Error('inlineEntity: invalid entity ref');
          }
        },
        rendered: false,
      },
    };
  },
  parseHTML() {
    return [{ tag: 'span[data-inline-entity]' }];
  },
  renderHTML({ node }) {
    return ['span', { 'data-inline-entity': node.attrs.kind, 'data-entity-ref': node.attrs.ref }];
  },
  renderText({ node }) {
    return node.attrs.ref;
  },
  addNodeView() {
    return ReactNodeViewRenderer(EntityChipView);
  },
});

export function $insertInlineEntity(editor: Editor, at: number, attrs: InlineEntityAttrs): void {
  editor.chain().focus().insertContentAt(at, { type: INLINE_ENTITY_TYPE, attrs }).run();
}

export function isInlineEntityNode(node: ProseMirrorNode): boolean {
  if (node.type.name !== INLINE_ENTITY_TYPE) {
    return false;
  }
  const kind = node.attrs.kind;
  const ref = node.attrs.ref;
  return kind === 'skill' && isValidEntityRef(kind, ref);
}
