import { Handle, type NodeProps, Position } from '@xyflow/react';
import { memo } from 'react';

import { cn } from '@/shared/lib/utils';
import { specByType } from '../model/agent-graph-catalog';
import type { AgentGraphFlowNode } from '../model/agent-graph-document';

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

  return (
    <div
      className={cn(
        'min-w-[180px] max-w-[220px] rounded-md border border-border bg-popover px-2.5 py-2 shadow-sm',
        selected && 'bg-sidebar-accent text-sidebar-accent-foreground ring-2 ring-sidebar-ring',
      )}
    >
      {showTarget ? (
        <Handle
          type="target"
          position={targetPosition}
          className="!size-2 !border-border !bg-muted-foreground"
        />
      ) : null}
      <div className="flex min-w-0 flex-col gap-1">
        <span className="truncate font-medium text-sm leading-tight">{id}</span>
        <span
          className={cn(
            'w-fit rounded-md px-1.5 py-0.5 font-mono text-[11px]',
            spec.type.startsWith('control:')
              ? 'bg-[color-mix(in_oklab,var(--sidebar-ring)_18%,transparent)] text-[color:var(--sidebar-ring)]'
              : 'bg-muted text-muted-foreground',
          )}
        >
          {spec.type}
        </span>
      </div>
      {showSource ? (
        <Handle
          type="source"
          position={sourcePosition}
          className="!size-2 !border-border !bg-muted-foreground"
        />
      ) : null}
    </div>
  );
}

export const AgentGraphNode = memo(AgentGraphNodeInner);
