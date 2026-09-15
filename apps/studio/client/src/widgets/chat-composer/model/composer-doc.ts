import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { isInlineEntityNode } from './inline-entity-node';

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
        const ref = child.attrs.ref as string;
        if (!skills.includes(ref)) {
          skills.push(ref);
        }
      }
    });
    blocks.push(text);
  });
  const text = blocks.join('\n').replace(/ {2,}/g, ' ').trim();
  return { text, skills };
}
