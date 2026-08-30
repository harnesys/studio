import type { SlashCommand } from './slash-commands';

export function runSlashCommand(
  command: SlashCommand,
  threadId: string,
): Promise<string | undefined> {
  return command.run({ threadId });
}
