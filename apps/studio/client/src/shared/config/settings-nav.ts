export const WINDOW_SETTINGS_CATEGORIES = ['profile', 'appearance', 'chat', 'hosts'] as const;

export type WindowSettingsCategory = (typeof WINDOW_SETTINGS_CATEGORIES)[number];

export const WINDOW_SETTINGS_GROUPS = [
  {
    id: 'window',
    label: 'Window',
    items: [
      {
        id: 'profile' as const,
        label: 'Profile',
        description: 'How agents address you in this window.',
      },
      {
        id: 'appearance' as const,
        label: 'Appearance',
        description: 'Theme, scale, and accent.',
      },
      {
        id: 'chat' as const,
        label: 'Chat',
        description: 'Transcript preferences for the desk.',
      },
      {
        id: 'hosts' as const,
        label: 'Hosts',
        description: 'Paired hosts for this window.',
      },
    ],
  },
] as const;
