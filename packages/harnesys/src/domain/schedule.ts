export const PERMISSION_MODES = ['ask', 'auto', 'dont_ask', 'bypass'] as const;
export type PermissionMode = (typeof PERMISSION_MODES)[number];

export const SCHEDULE_HISTORIES = ['none', 'last', 'all'] as const;
export type ScheduleHistory = (typeof SCHEDULE_HISTORIES)[number];
