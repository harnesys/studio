import type { ThreadAttachment } from '@harnesys/studio-shared';
import { sendMessage } from '@/features/send-message';
import { uploadThreadAttachment } from '@/shared/api';

import type { RunnableComposerMode } from './composer-mode';

export type UploadAndSendOptions = {
  threadId: string;
  content: string;
  effort: string | undefined;
  files: File[];
  mode: RunnableComposerMode;
};

export async function uploadAndSend(options: UploadAndSendOptions): Promise<void> {
  const { threadId, content, effort, files, mode } = options;
  const uploaded: ThreadAttachment[] = [];
  for (const file of files) {
    uploaded.push(await uploadThreadAttachment(threadId, file));
  }
  await sendMessage({ threadId, content, effort, attachments: uploaded, mode });
}

export function filesFromClipboard(data: DataTransfer): File[] {
  const fromFiles = Array.from(data.files);
  if (fromFiles.length > 0) {
    return fromFiles;
  }
  return Array.from(data.items)
    .filter((item) => item.kind === 'file')
    .flatMap((item) => {
      const file = item.getAsFile();
      return file ? [file] : [];
    });
}
