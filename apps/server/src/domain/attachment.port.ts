export type AttachmentKind = 'image' | 'audio' | 'video' | 'file';
export type Attachment = {
  id: string;
  threadId: string;
  entryId: string | null;
  name: string;
  mediaType: string;
  path: string;
  bytes: number;
  kind: AttachmentKind;
  createdAt: string;
};
export type AttachmentInsert = Attachment;
export type AttachmentRepository = {
  listByThread(threadId: string): Attachment[];
  listPending(threadId: string): Attachment[];
  findById(id: string): Attachment | undefined;
  insert(rec: AttachmentInsert): Attachment;
  attach(entryId: string, ids: string[], threadId: string): void;
  delete(id: string): void;
  deleteByWorkspace(workspaceId: string, threadIds?: string[]): void;
};
