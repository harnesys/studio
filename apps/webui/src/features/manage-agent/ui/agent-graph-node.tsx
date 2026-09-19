import { Handle, type NodeProps, Position } from '@xyflow/react';
import { memo } from 'react';
import { cn } from '@/shared/lib/utils';
import { specByType } from '../model/agent-graph-catalog';
import type { AgentGraphFlowNode } from '../model/agent-graph-document';
import { graphTypeIcon, graphTypeTint } from './agent-graph-appearance';

function AgentGraphNodeInner({ id, data, selected }: NodeProps<AgentGraphFlowNode>) {
  const { spec, rankdir } = data;
  const catalog = specByType(spec.type);
  const ports = catalog?.ports ?? { in: true, out: true };
  const isStart = spec.type === 'core:start';
  const isEnd = spec.type === 'core:end';
  const showTarget = ports.in && !isStart;
  const showSource = ports.out && !isEnd;
  const targetPosition = rankdir === 'LR' ? Position.Left : Position.Top;
  const sourcePosition = rankdir === 'LR' ? Position.Right : Position.Bottom;
  const tint = graphTypeTint(spec.type);
  const Icon = graphTypeIcon(spec.type);
  return (
    <div
      className={cn(
        'flex min-w-[148px] max-w-[176px] items-center gap-2 rounded-md border border-border bg-popover px-1.5 py-1 shadow-sm',
        selected && 'ring-1 ring-sidebar-ring',
      )}
    >
      {showTarget ? (
        <Handle
          type="target"
          position={targetPosition}
          className={cn('!size-1.5 !border-0', tint.handle)}
        />
      ) : null}
      <span
        className={cn(
          'flex size-6 shrink-0 items-center justify-center rounded-[6px]',
          tint.iconWrap,
        )}
      >
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-[12px] leading-4">{id}</p>
        <p className={cn('truncate font-mono text-[10px] leading-3', tint.label)}>
          {catalog?.label ?? spec.type}
        </p>
      </div>
      {showSource ? (
        <Handle
          type="source"
          position={sourcePosition}
          className={cn('!size-1.5 !border-0', tint.handle)}
        />
      ) : null}
    </div>
  );
}
export const AgentGraphNode = memo(AgentGraphNodeInner);
