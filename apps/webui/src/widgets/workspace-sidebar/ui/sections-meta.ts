import {
  FolderTreeIcon,
  GitBranchIcon,
  type LucideIcon,
  SparkleIcon,
  SquareTerminalIcon,
  ZapIcon,
} from 'lucide-react';

export type SidebarSectionId = 'agents' | 'explorer' | 'automations' | 'git' | 'terminal';

export const SECTION_META: Record<SidebarSectionId, { label: string; icon: LucideIcon }> = {
  agents: { label: 'Agents', icon: SparkleIcon },
  // explorer: { label: 'Explorer', icon: ListTreeIcon },
  explorer: { label: 'Explorer', icon: FolderTreeIcon },
  automations: { label: 'Automations', icon: ZapIcon },
  git: { label: 'Git', icon: GitBranchIcon },
  terminal: { label: 'Terminal', icon: SquareTerminalIcon },
};
