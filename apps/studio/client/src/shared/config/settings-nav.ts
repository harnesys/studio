export const SETTINGS_CATEGORIES = [
  'profile',
  'appearance',
  'chat',
  'providers',
  'skills',
  'mcp',
  'tools',
  'memory',
  'git',
  'exports',
] as const;

export type SettingsCategory = (typeof SETTINGS_CATEGORIES)[number];

export const SETTINGS_GROUPS = [
  {
    id: 'basics',
    label: 'Basics',
    items: [
      {
        id: 'profile' as const,
        label: 'Profile',
        description: 'How agents address you in threads.',
      },
      {
        id: 'appearance' as const,
        label: 'Appearance',
        description: 'Theme, scale, and accent for this workspace.',
      },
      {
        id: 'chat' as const,
        label: 'Chat',
        description: 'Transcript preferences, statistics, and display options.',
      },
    ],
  },
  {
    id: 'capabilities',
    label: 'Capabilities',
    items: [
      {
        id: 'providers' as const,
        label: 'Providers',
        description: 'LLM connections and the models attached to them.',
      },
      {
        id: 'skills' as const,
        label: 'Skills',
        description: 'Workspace skill packs under `.agents/skills`.',
      },
      {
        id: 'mcp' as const,
        label: 'MCP',
        description: 'Model Context Protocol servers in `.studio/mcp.json`.',
      },
      {
        id: 'tools' as const,
        label: 'Tools',
        description: 'What agents may run without asking again.',
      },
    ],
  },
  {
    id: 'data',
    label: 'Data',
    items: [
      {
        id: 'memory' as const,
        label: 'Memory',
        description: 'Knowledge roots and workspace index for agent recall.',
      },
      {
        id: 'git' as const,
        label: 'Git',
        description: 'Workspace branch, remote and file decorations.',
      },
      {
        id: 'exports' as const,
        label: 'Exports',
        description: 'Transcripts, evals, and audit dumps.',
      },
    ],
  },
] as const;
