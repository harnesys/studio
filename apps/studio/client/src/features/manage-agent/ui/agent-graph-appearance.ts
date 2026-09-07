import {
  ArrowRightLeftIcon,
  CirclePlayIcon,
  FlagIcon,
  GitBranchIcon,
  type LucideIcon,
  PauseCircleIcon,
  PuzzleIcon,
  Redo2Icon,
  SparklesIcon,
  SquarePenIcon,
  WrenchIcon,
} from 'lucide-react';

import type { GraphNodeGroup } from '../model/agent-graph-catalog';
import { specByType } from '../model/agent-graph-catalog';

const TYPE_ICONS: Record<string, LucideIcon> = {
  'core:start': CirclePlayIcon,
  'core:end': FlagIcon,
  'llm:generate': SparklesIcon,
  'tool:call': WrenchIcon,
  'control:assign': SquarePenIcon,
  'control:spawn': GitBranchIcon,
  'control:handoff': ArrowRightLeftIcon,
  'control:goto': Redo2Icon,
  'control:interrupt': PauseCircleIcon,
};

export type GraphTypeTint = {
  iconWrap: string;
  label: string;
  handle: string;
};

const GROUP_TINT: Record<GraphNodeGroup, GraphTypeTint> = {
  core: {
    iconWrap: 'bg-muted text-muted-foreground',
    label: 'text-muted-foreground',
    handle: '!bg-muted-foreground',
  },
  llm: {
    iconWrap: 'bg-secondary text-foreground',
    label: 'text-foreground/70',
    handle: '!bg-foreground/50',
  },
  tool: {
    iconWrap: 'bg-[color-mix(in_oklab,var(--chart-2)_22%,transparent)] text-[color:var(--chart-2)]',
    label: 'text-[color:var(--chart-2)]',
    handle: '!bg-[color:var(--chart-2)]',
  },
  control: {
    iconWrap:
      'bg-[color-mix(in_oklab,var(--sidebar-ring)_20%,transparent)] text-[color:var(--sidebar-ring)]',
    label: 'text-[color:var(--sidebar-ring)]',
    handle: '!bg-[color:var(--sidebar-ring)]',
  },
};

export function graphTypeIcon(type: string): LucideIcon {
  return TYPE_ICONS[type] ?? PuzzleIcon;
}

export function graphTypeTint(type: string): GraphTypeTint {
  const group = specByType(type)?.group ?? 'core';
  return GROUP_TINT[group];
}
