import type { ThreadKind } from '@studio/shared';

export type Thread = {
  id: string;
  agentId: string;
  originAgentId: string;
  workspaceId?: string;
  title: string;
  kind: ThreadKind;
  parentThreadId?: string | null;
  forkAt?: string | null;
  updatedAt: string;
  unread: boolean;
  pinned?: boolean;
  /** Live run known from the last full record. Drives stream reconnect without refetch. */
  activeRunId?: string | null;
};

// Dev-only fixture kept for visual inspection. Production stores start empty
// and only fill via `hydrateDesk` or `useThreadStore.create`.
export const seedThreads: Thread[] = [
  {
    id: '03000000-0000-4000-8000-000000000001',
    agentId: '02000000-0000-4000-8000-000000000001',
    originAgentId: '02000000-0000-4000-8000-000000000001',
    title: 'Auth refresh token flow',
    kind: 'chat',
    updatedAt: '2026-08-16T14:12:00.000Z',
    unread: false,
  },
  {
    id: '03000000-0000-4000-8000-000000000002',
    agentId: '02000000-0000-4000-8000-000000000001',
    originAgentId: '02000000-0000-4000-8000-000000000001',
    title: 'CI flake on deploy-preview',
    kind: 'chat',
    updatedAt: '2026-08-16T10:44:00.000Z',
    unread: true,
  },
  {
    id: '03000000-0000-4000-8000-000000000003',
    agentId: '02000000-0000-4000-8000-000000000001',
    originAgentId: '02000000-0000-4000-8000-000000000001',
    title: 'Onboarding checklist',
    kind: 'chat',
    updatedAt: '2026-08-15T16:02:00.000Z',
    unread: false,
  },
  {
    id: '03000000-0000-4000-8000-000000000004',
    agentId: '02000000-0000-4000-8000-000000000002',
    originAgentId: '02000000-0000-4000-8000-000000000002',
    title: 'Competitive brief',
    kind: 'chat',
    updatedAt: '2026-08-16T13:40:00.000Z',
    unread: false,
  },
  {
    id: '03000000-0000-4000-8000-000000000005',
    agentId: '02000000-0000-4000-8000-000000000002',
    originAgentId: '02000000-0000-4000-8000-000000000002',
    title: 'Source notes',
    kind: 'chat',
    updatedAt: '2026-08-16T12:10:00.000Z',
    unread: false,
  },
  {
    id: '03000000-0000-4000-8000-000000000006',
    agentId: '02000000-0000-4000-8000-000000000003',
    originAgentId: '02000000-0000-4000-8000-000000000003',
    title: 'Nightly regression',
    kind: 'schedule',
    updatedAt: '2026-08-16T02:11:00.000Z',
    unread: false,
  },
  {
    id: '03000000-0000-4000-8000-000000000007',
    agentId: '02000000-0000-4000-8000-000000000004',
    originAgentId: '02000000-0000-4000-8000-000000000004',
    title: 'Pager replay',
    kind: 'chat',
    updatedAt: '2026-08-16T12:18:00.000Z',
    unread: true,
  },
  {
    id: '03000000-0000-4000-8000-000000000008',
    agentId: '02000000-0000-4000-8000-000000000005',
    originAgentId: '02000000-0000-4000-8000-000000000005',
    title: 'New thread',
    kind: 'chat',
    updatedAt: '2026-08-14T18:22:00.000Z',
    unread: false,
  },
  {
    id: '03000000-0000-4000-8000-000000000009',
    agentId: '02000000-0000-4000-8000-000000000006',
    originAgentId: '02000000-0000-4000-8000-000000000006',
    title: 'Disk pressure on edge-3',
    kind: 'chat',
    updatedAt: '2026-08-16T14:08:00.000Z',
    unread: false,
  },
  {
    id: '03000000-0000-4000-8000-00000000000a',
    agentId: '02000000-0000-4000-8000-000000000007',
    originAgentId: '02000000-0000-4000-8000-000000000007',
    title: 'Status page copy',
    kind: 'chat',
    updatedAt: '2026-08-16T09:30:00.000Z',
    unread: false,
  },
];

export function latestThread(threads: Thread[]): Thread | undefined {
  return [...threads].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
}
