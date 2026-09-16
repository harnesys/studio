import { compactThread } from '@/features/compact-thread';
import type { EntityKind } from './entity-kinds';

export type SlashCommandContext = {
  threadId: string;
};

export type SlashCommandOutcome =
  | { type: 'execute'; run(ctx: SlashCommandContext): Promise<string | undefined> }
  | { type: 'picker'; kind: EntityKind };

export type SlashCommand = {
  name: string;
  description: string;
  outcome: SlashCommandOutcome;
};

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    name: 'compact',
    description: 'Compact this thread window now',
    outcome: {
      type: 'execute',
      async run(ctx) {
        const result = await compactThread({ threadId: ctx.threadId });
        return result.compacted ? undefined : 'Nothing to compact';
      },
    },
  },
  {
    name: 'skills',
    description: 'Attach a skill to this message',
    outcome: { type: 'picker', kind: 'skill' },
  },
];
