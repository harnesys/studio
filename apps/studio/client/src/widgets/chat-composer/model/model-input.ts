import { isTextAttachment, type Modality, type ProviderPublic } from '@harnesys/studio-shared';

export type AttachKind = 'image' | 'audio' | 'video' | 'file';

const ATTACH_KINDS: AttachKind[] = ['image', 'audio', 'video', 'file'];

export function findModel(modelId: string | null | undefined, providers: ProviderPublic[]) {
  if (!modelId) {
    return undefined;
  }
  for (const provider of providers) {
    const found = provider.models.find((item) => item.id === modelId);
    if (found) {
      return found;
    }
  }
  return undefined;
}

export function modelInputModalities(
  modelId: string | null | undefined,
  providers: ProviderPublic[],
): Modality[] | undefined {
  const record = findModel(modelId, providers);
  return record?.host?.architecture?.input_modalities ?? record?.architecture?.input_modalities;
}

export function allowedAttachKinds(input: Modality[] | undefined): AttachKind[] {
  const media = ATTACH_KINDS.filter((kind) => kind !== 'file' && Boolean(input?.includes(kind)));
  return [...media, 'file'];
}

export function canAttachFile(file: File, input: Modality[] | undefined): boolean {
  if (isTextAttachment(file.type, file.name)) {
    return true;
  }
  return Boolean(input?.includes(kindFromFile(file)));
}

export function kindFromFile(file: File): AttachKind {
  if (file.type.startsWith('image/')) {
    return 'image';
  }
  if (file.type.startsWith('audio/')) {
    return 'audio';
  }
  if (file.type.startsWith('video/')) {
    return 'video';
  }
  return 'file';
}

export function acceptFor(kind: AttachKind): string | undefined {
  if (kind === 'file') {
    return undefined;
  }
  return `${kind}/*`;
}
