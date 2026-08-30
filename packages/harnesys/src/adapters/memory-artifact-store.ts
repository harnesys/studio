import type { ArtifactStore, SendFile } from '../ports/artifacts.ts';

export class MemoryArtifactStore implements ArtifactStore {
  private readonly store = new Map<string, { bytes: Uint8Array; mediaType?: string }>();

  put(input: SendFile): { uri: string } {
    const uri = `mem://${crypto.randomUUID()}`;
    if ('path' in input) {
      this.store.set(uri, {
        bytes: new TextEncoder().encode(input.path),
        mediaType: input.mediaType,
      });
    } else {
      this.store.set(uri, { bytes: input.bytes, mediaType: input.mediaType });
    }
    return { uri };
  }

  read(uri: string): { bytes: Uint8Array; mediaType?: string } {
    const entry = this.store.get(uri);
    if (!entry) {
      throw new Error(`artifact not found: ${uri}`);
    }
    return entry;
  }
}
