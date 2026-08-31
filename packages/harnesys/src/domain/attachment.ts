export type AttachmentKind = 'image' | 'audio' | 'video' | 'file';

export type Attachment = {
  id: string;
  kind: AttachmentKind;
  name: string;
  mediaType: string;
  path: string;
};
