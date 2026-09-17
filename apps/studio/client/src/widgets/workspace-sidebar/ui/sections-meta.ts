import { FolderIcon, GitBranchIcon, type LucideIcon, SparkleIcon, ZapIcon } from 'lucide-react';

export type SidebarSectionId = 'agents' | 'explorer' | 'automations' | 'git';

export const SECTION_META: Record<SidebarSectionId, { label: string; icon: LucideIcon }> = {
  agents: { label: 'Agents', icon: SparkleIcon },
  explorer: { label: 'Explorer', icon: FolderIcon },
  automations: { label: 'Automations', icon: ZapIcon },
  git: { label: 'Git', icon: GitBranchIcon },
};
