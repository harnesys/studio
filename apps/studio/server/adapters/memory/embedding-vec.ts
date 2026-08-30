/** Pack float embedding as little-endian Float32 buffer for SQLite BLOB. */
export function encodeEmbedding(values: number[]): Buffer {
  const out = Buffer.alloc(values.length * 4);
  for (let i = 0; i < values.length; i++) {
    out.writeFloatLE(values[i] ?? 0, i * 4);
  }
  return out;
}

export function decodeEmbedding(
  blob: Buffer | Uint8Array | null | undefined,
): number[] | undefined {
  if (!blob || blob.byteLength < 4 || blob.byteLength % 4 !== 0) {
    return undefined;
  }
  const buf = Buffer.isBuffer(blob) ? blob : Buffer.from(blob);
  const values: number[] = [];
  for (let offset = 0; offset < buf.byteLength; offset += 4) {
    values.push(buf.readFloatLE(offset));
  }
  return values;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) {
    return 0;
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  if (normA === 0 || normB === 0) {
    return 0;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
