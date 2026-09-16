import type { NodeViewProps } from '@tiptap/core';
import { NodeViewWrapper } from '@tiptap/react';
import { ZapIcon } from 'lucide-react';
import { isValidEntityRef } from '../model/entity-kinds';

export function EntityChipView(props: NodeViewProps) {
  const { ref } = props.node.attrs;
  if (!isValidEntityRef('skill', ref)) {
    return null;
  }
  return (
    <NodeViewWrapper
      as="span"
      className="inline-flex h-5 items-center gap-1 rounded-md border border-border bg-secondary px-1.5 align-middle font-medium text-[11px] leading-none"
    >
      <ZapIcon className="size-3 text-muted-foreground" />
      {ref}
    </NodeViewWrapper>
  );
}
