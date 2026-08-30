import type { AttachmentsPort, AttachmentsPutInput } from '../../domain/attachments.port.ts';

export class MemoryAttachmentsAdapter implements AttachmentsPort {
  private readonly items = new Map<string, Uint8Array>();

  put(input: AttachmentsPutInput): Promise<void> {
    this.items.set(input.id, input.bytes);
    return Promise.resolve();
  }

  get(
    _workspacePath: string,
    _threadId: string,
    id: string,
    _fileName: string,
  ): Promise<Uint8Array | undefined> {
    return Promise.resolve(this.items.get(id));
  }

  remove(_workspacePath: string, _threadId: string, ids: string[]): Promise<void> {
    if (ids.length === 0) {
      this.items.clear();
      return Promise.resolve();
    }
    for (const id of ids) {
      this.items.delete(id);
    }
    return Promise.resolve();
  }
}
