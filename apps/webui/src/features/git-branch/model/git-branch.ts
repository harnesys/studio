import { z } from 'zod';
export const createBranchSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Branch name required')
    .max(255)
    .regex(/^[^\s~^:?*[\\]+$/, 'Invalid branch name')
    .refine((v) => !v.includes('..') && !v.includes('//'), 'Invalid branch name'),
  checkout: z.boolean().default(true),
  from: z.string().trim().optional(),
});
export type CreateBranchInput = z.input<typeof createBranchSchema>;
export type CreateBranchOutput = z.output<typeof createBranchSchema>;
export function emptyBranch(from?: string): CreateBranchInput {
  return { name: '', checkout: true, ...(from ? { from } : {}) };
}
