import {
  ActivityIcon,
  BoxesIcon,
  CpuIcon,
  DatabaseIcon,
  FolderGit2Icon,
  FolderIcon,
  HardDriveIcon,
  type LucideIcon,
  PackageIcon,
  PuzzleIcon,
  ServerIcon,
  SlidersHorizontalIcon,
} from 'lucide-react';
export type WorkspaceSettingsGroupId = 'workspace' | 'capabilities' | 'data';
export type WorkspaceSettingsCategory =
  | 'general'
  | 'providers'
  | 'skills'
  | 'mcp'
  | 'plugins'
  | 'lsp'
  | 'tools'
  | 'mode-presets'
  | 'memory'
  | 'git'
  | 'exports';
export type WorkspaceSettingsNavItem = {
  id: WorkspaceSettingsCategory;
  label: string;
  icon: LucideIcon;
};
export type WorkspaceSettingsNavGroup = {
  id: WorkspaceSettingsGroupId;
  label: string;
  items: WorkspaceSettingsNavItem[];
};
export const WORKSPACE_SETTINGS_GROUPS: WorkspaceSettingsNavGroup[] = [
  {
    id: 'workspace',
    label: 'Workspace',
    items: [{ id: 'general', label: 'General', icon: FolderIcon }],
  },
  {
    id: 'capabilities',
    label: 'Capabilities',
    items: [
      { id: 'providers', label: 'Providers', icon: CpuIcon },
      { id: 'skills', label: 'Skills', icon: PuzzleIcon },
      { id: 'mcp', label: 'MCP', icon: ServerIcon },
      { id: 'plugins', label: 'Plugins', icon: BoxesIcon },
      { id: 'lsp', label: 'LSP', icon: ActivityIcon },
      { id: 'tools', label: 'Packages', icon: PackageIcon },
      { id: 'mode-presets', label: 'Mode presets', icon: SlidersHorizontalIcon },
    ],
  },
  {
    id: 'data',
    label: 'Data',
    items: [
      { id: 'memory', label: 'Memory', icon: DatabaseIcon },
      { id: 'git', label: 'Git', icon: FolderGit2Icon },
      { id: 'exports', label: 'Exports', icon: HardDriveIcon },
    ],
  },
];
