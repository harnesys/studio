import { ApiError } from '@/shared/api';
import { toast } from '@/shared/ui/toast';

import type { ComposerMode } from './composer-mode';
import { uploadAndSend } from './composer-send';
import { runSlashCommand } from './run-slash-command';
import { exactSlashCommand, type SlashCommand } from './slash-commands';

export type ComposerSubmitOptions = {
  value: string;
  pending: File[];
  threadId: string;
  effort: string | undefined;
  mode: ComposerMode;
  disabled: boolean;
  setSending(value: boolean): void;
  setValue(value: string): void;
  setPending(update: File[] | ((list: File[]) => File[])): void;
};

export function submitComposer(options: ComposerSubmitOptions): void {
  const content = options.value.trim();
  if ((!content && options.pending.length === 0) || options.disabled) {
    return;
  }
  const command = exactSlashCommand(content);
  if (command && options.pending.length === 0) {
    void executeComposerSlash(command, options);
    return;
  }
  const files = options.pending;
  options.setSending(true);
  options.setValue('');
  options.setPending([]);
  void uploadAndSend({
    threadId: options.threadId,
    content,
    effort: options.effort,
    files,
    mode: options.mode,
  })
    .catch((error) => {
      const message = error instanceof ApiError ? error.message : 'Send failed';
      toast.add({ title: 'Could not send', description: message });
      options.setPending((list) => (list.length === 0 ? files : list));
    })
    .finally(() => {
      options.setSending(false);
    });
}

export async function executeComposerSlash(
  command: SlashCommand,
  options: Pick<ComposerSubmitOptions, 'threadId' | 'disabled' | 'setSending' | 'setValue'>,
): Promise<void> {
  if (options.disabled) {
    return;
  }
  options.setSending(true);
  options.setValue('');
  try {
    const message = await runSlashCommand(command, options.threadId);
    if (message) {
      toast.add({ title: message });
    }
  } catch (error) {
    const description = error instanceof ApiError ? error.message : 'Command failed';
    toast.add({ title: `/${command.name}`, description });
  } finally {
    options.setSending(false);
  }
}
