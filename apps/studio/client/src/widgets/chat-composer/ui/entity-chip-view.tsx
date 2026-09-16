import type { NodeViewProps } from '@tiptap/core';
import { NodeViewWrapper } from '@tiptap/react';
import { FileIcon, ZapIcon } from 'lucide-react';
import type { EntityKind } from '../model/entity-kinds';
import { isValidEntityRef } from '../model/entity-kinds';

export function EntityChipView(props: NodeViewProps) {
  const kind = props.node.attrs.kind as EntityKind;
  const { ref } = props.node.attrs;
  if ((kind !== 'skill' && kind !== 'file') || !isValidEntityRef(kind, ref)) {
    return null;
  }
  const Icon = kind === 'file' ? FileIcon : ZapIcon;
  return (
    <NodeViewWrapper
      as="span"
      className="inline-flex h-5 max-w-60 items-center gap-1 rounded-md border border-border bg-secondary px-1.5 align-middle font-medium text-[11px] leading-none"
      title={kind === 'file' ? `#${ref}` : ref}
    >
      <Icon className="size-3 shrink-0 text-muted-foreground" />
      <span className="truncate">{ref}</span>
    </NodeViewWrapper>
  );
}
