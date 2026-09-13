import { CpuIcon, FolderIcon, GitBranchIcon, type LucideIcon, ZapIcon } from 'lucide-react';

export type SidebarSectionId = 'agents' | 'explorer' | 'automations' | 'git';

export const SECTION_META: Record<SidebarSectionId, { label: string; icon: LucideIcon }> = {
  agents: { label: 'Agents', icon: CpuIcon },
  explorer: { label: 'Explorer', icon: FolderIcon },
  automations: { label: 'Automations', icon: ZapIcon },
  git: { label: 'Git', icon: GitBranchIcon },
};
