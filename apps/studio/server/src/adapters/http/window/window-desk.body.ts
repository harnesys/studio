import { z } from 'zod';

const ideTabKindSchema = z.enum(['thread', 'file', 'spawn', 'diff', 'schedule', 'webhook']);

const persistedIdeTabSchema = z.object({
  id: z.string().min(1),
  kind: ideTabKindSchema,
  workspaceId: z.string().min(1),
  agentId: z.string().optional(),
  threadId: z.string().optional(),
  spawnId: z.string().optional(),
  scheduleId: z.string().optional(),
  webhookId: z.string().optional(),
  path: z.string().optional(),
  dirty: z.boolean().optional(),
});

const persistedIdeGroupSchema = z.object({
  id: z.string().min(1),
  tabIds: z.array(z.string()),
  activeId: z.string().nullable(),
});

const persistedIdeWorkspaceSchema = z.object({
  tabs: z.array(persistedIdeTabSchema),
  activeId: z.string().nullable(),
  activeGroupId: z.string().nullable().optional(),
  groups: z.array(persistedIdeGroupSchema).optional(),
  layout: z.unknown().optional(),
});

export const windowDeskBody = z.object({
  selectedNodeIds: z.array(z.string()),
  park: z.record(z.string(), persistedIdeWorkspaceSchema),
});
