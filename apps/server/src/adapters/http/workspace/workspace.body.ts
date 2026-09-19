import { z } from 'zod';
export const createWorkspaceBody = z
  .object({
    path: z.string().trim().nullish(),
    name: z.string().trim().nullish(),
  })
  .refine((value) => Boolean(value.path) || Boolean(value.name), {
    message: 'path or name is required',
  });
export const updateWorkspaceBody = z.object({
  name: z.string().trim().nullish(),
  path: z.string().trim().nullish(),
});
export const createWorkspaceFileBody = z.object({
  path: z.string().trim().min(1),
  kind: z.enum(['file', 'dir']),
});
export const deleteWorkspaceFileBody = z.object({
  path: z.string().trim().min(1),
});
export const moveWorkspaceFilesBody = z.object({
  items: z.array(z.object({ from: z.string().trim().min(1), to: z.string().trim().min(1) })).min(1),
});
export const writeWorkspaceFileContentBody = z.object({
  path: z.string().trim().min(1),
  content: z.string(),
});
export const createWorkspaceSkillBody = z.object({
  name: z
    .string()
    .trim()
    .regex(/^[a-z0-9][a-z0-9-]*$/, 'must be kebab-case ([a-z0-9][a-z0-9-]*)'),
  description: z.string().trim().min(1),
  whenToUse: z.string().trim().min(1).optional(),
  instructions: z.string().trim().min(1),
});
export const gitCheckoutBody = z.object({
  branch: z.string().trim().min(1),
});
export const gitCreateBranchBody = z.object({
  name: z.string().trim().min(1),
  checkout: z.boolean().optional(),
  from: z.string().trim().min(1).optional(),
});
export const gitCommitBody = z.object({
  message: z.string().trim().min(1).max(2000),
});
export const gitStageBody = z.object({
  paths: z.array(z.string().trim().min(1)).max(500).optional().default([]),
});
export const setMcpServerStateBody = z.object({
  enabled: z.boolean(),
});
export const upsertWorkspaceMcpServerBody = z
  .object({
    enabled: z.boolean().optional(),
    transport: z.enum(['stdio', 'http', 'sse']),
    command: z.string().trim().min(1).optional(),
    args: z.array(z.string()).optional(),
    env: z.record(z.string(), z.string()).optional(),
    url: z.string().trim().min(1).optional(),
    headers: z.record(z.string(), z.string()).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.transport === 'stdio' && value.command === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'stdio transport requires command',
        path: ['command'],
      });
    }
    if ((value.transport === 'http' || value.transport === 'sse') && value.url === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${value.transport} transport requires url`,
        path: ['url'],
      });
    }
  });
