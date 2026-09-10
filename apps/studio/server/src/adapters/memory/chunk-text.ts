import { DEFAULT_CHUNK_CHARS, DEFAULT_OVERLAP } from '../../config/constants.ts';

export type ChunkTextOptions = {
  chunkChars?: number;
  overlap?: number;
};

/** Split plain text into overlapping character chunks. */
export function chunkText(text: string, options: ChunkTextOptions = {}): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return [];
  }
  const size = options.chunkChars ?? DEFAULT_CHUNK_CHARS;
  const overlap = Math.min(options.overlap ?? DEFAULT_OVERLAP, size - 1);
  if (normalized.length <= size) {
    return [normalized];
  }
  const chunks: string[] = [];
  let start = 0;
  while (start < normalized.length) {
    const end = Math.min(start + size, normalized.length);
    chunks.push(normalized.slice(start, end).trim());
    if (end >= normalized.length) {
      break;
    }
    start = Math.max(end - overlap, start + 1);
  }
  return chunks.filter(Boolean);
}
