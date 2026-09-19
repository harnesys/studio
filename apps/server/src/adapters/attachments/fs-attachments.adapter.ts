import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AttachmentsPort, AttachmentsPutInput } from '../../domain/attachments.port.ts';
import { attachmentsDir } from '../store/studio-layout.ts';
export class FsAttachmentsAdapter implements AttachmentsPort {
  async put(input: AttachmentsPutInput): Promise<void> {
    const dir = join(attachmentsDir(input.workspacePath, input.threadId), input.id);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, input.fileName), input.bytes);
  }
  async get(
    workspacePath: string,
    threadId: string,
    id: string,
    fileName: string,
  ): Promise<Uint8Array | undefined> {
    const path = join(attachmentsDir(workspacePath, threadId), id, fileName);
    const bytes = await readFile(path).catch(() => undefined);
    return bytes ? new Uint8Array(bytes) : undefined;
  }
  async remove(workspacePath: string, threadId: string, ids: string[]): Promise<void> {
    const dir = attachmentsDir(workspacePath, threadId);
    if (ids.length === 0) {
      await rm(dir, { recursive: true, force: true });
      return;
    }
    for (const id of ids) {
      await rm(join(dir, id), { recursive: true, force: true });
    }
  }
}
