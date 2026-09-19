export type AttachmentsPutInput = {
  workspacePath: string;
  threadId: string;
  id: string;
  bytes: Uint8Array;
  fileName: string;
};
export type AttachmentsPort = {
  put(input: AttachmentsPutInput): Promise<void>;
  get(
    workspacePath: string,
    threadId: string,
    id: string,
    fileName: string,
  ): Promise<Uint8Array | undefined>;
  remove(workspacePath: string, threadId: string, ids: string[]): Promise<void>;
};
