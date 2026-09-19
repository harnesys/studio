import type { SlashCommand } from './slash-commands';
export function runSlashCommand(
  command: SlashCommand,
  threadId: string,
): Promise<string | undefined> {
  if (command.outcome.type !== 'execute') {
    return Promise.resolve(undefined);
  }
  return command.outcome.run({ threadId });
}
