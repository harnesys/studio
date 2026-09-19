import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { inlineEntityKind, isInlineEntityNode } from './inline-entity-node';

export type ComposerPayload = { text: string; skills: string[] };

export function serializeComposerDoc(doc: ProseMirrorNode): ComposerPayload {
  const skills: string[] = [];
  const blocks: string[] = [];
  doc.forEach((block) => {
    let text = '';
    block.forEach((child) => {
      if (child.isText) {
        text += child.text ?? '';
      } else if (child.type.name === 'hardBreak') {
        text += '\n';
      } else if (isInlineEntityNode(child)) {
        const kind = inlineEntityKind(child);
        const ref = child.attrs.ref as string;
        if (kind === 'skill') {
          if (!skills.includes(ref)) {
            skills.push(ref);
          }
        } else if (kind === 'file') {
          // File mention stays a visible link in the text: the server needs no new field.
          if (text.length > 0 && !text.endsWith(' ')) {
            text += ' ';
          }
          text += `#[${ref}] `;
        }
      }
    });
    blocks.push(text);
  });
  const text = blocks.join('\n').replace(/ {2,}/g, ' ').trim();
  return { text, skills };
}
