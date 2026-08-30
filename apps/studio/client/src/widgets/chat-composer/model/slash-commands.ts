import { compactThread } from '@/features/compact-thread';

export type SlashCommandContext = {
  threadId: string;
};

export type SlashCommand = {
  name: string;
  description: string;
  run(ctx: SlashCommandContext): Promise<string | undefined>;
};

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    name: 'compact',
    description: 'Compact this thread window now',
    async run(ctx) {
      const result = await compactThread({ threadId: ctx.threadId });
      return result.compacted ? undefined : 'Nothing to compact';
    },
  },
];

export function matchSlashCommands(input: string): SlashCommand[] {
  if (!input.startsWith('/')) {
    return [];
  }
  const query = input.slice(1).trim().toLowerCase();
  if (query.includes(' ')) {
    return [];
  }
  return SLASH_COMMANDS.filter((command) => command.name.startsWith(query));
}

export function exactSlashCommand(input: string): SlashCommand | undefined {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) {
    return undefined;
  }
  const name = trimmed.slice(1).trim().toLowerCase();
  return SLASH_COMMANDS.find((command) => command.name === name);
}
