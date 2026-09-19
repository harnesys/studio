import { z } from 'zod';

export const commitSchema = z.object({
  message: z.string().trim().min(1, 'Message required').max(2000, 'Too long'),
});

export type CommitInput = z.input<typeof commitSchema>;
export type CommitOutput = z.output<typeof commitSchema>;
export type CommitDialogResult = CommitOutput & { push?: boolean };

export function emptyCommit(): CommitInput {
  return { message: '' };
}
