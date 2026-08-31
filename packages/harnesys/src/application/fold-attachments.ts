import type { SendFile } from '../ports/artifacts.ts';

type FoldResult = {
  type: 'text' | 'image' | 'audio' | 'video';
  text?: string;
  data?: Uint8Array;
  mediaType?: string;
};

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'];
const AUDIO_TYPES = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4'];
const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/ogg'];

function classify(mediaType?: string): 'image' | 'audio' | 'video' | 'file' {
  if (!mediaType) {
    return 'file';
  }
  if (IMAGE_TYPES.includes(mediaType)) {
    return 'image';
  }
  if (AUDIO_TYPES.includes(mediaType)) {
    return 'audio';
  }
  if (VIDEO_TYPES.includes(mediaType)) {
    return 'video';
  }
  return 'file';
}

export async function foldAttachments(
  files: SendFile[],
  readFn: (
    uri: string,
  ) =>
    | Promise<{ bytes: Uint8Array; mediaType?: string }>
    | { bytes: Uint8Array; mediaType?: string },
): Promise<FoldResult[]> {
  const results: FoldResult[] = [];
  for (const file of files) {
    const mediaType = file.mediaType;
    const kind = classify(mediaType);

    if (kind === 'file') {
      let name: string;
      if ('name' in file && file.name) {
        name = file.name;
      } else if ('path' in file) {
        name = file.path;
      } else {
        name = 'attachment';
      }
      results.push({ type: 'text', text: `[file: ${name}]` });
      continue;
    }

    if ('bytes' in file) {
      results.push({ type: kind, data: file.bytes, mediaType });
    } else if ('path' in file) {
      const { bytes } = await readFn(file.path);
      results.push({ type: kind, data: bytes, mediaType });
    }
  }
  return results;
}
