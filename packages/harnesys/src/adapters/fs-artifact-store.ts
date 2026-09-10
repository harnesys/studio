import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { MIME_MAP } from '../constants.ts';
import type { ArtifactStore, SendFile } from '../ports/artifacts.ts';

function guessMediaType(path: string): string | undefined {
  return MIME_MAP[extname(path).toLowerCase()];
}

export class FsArtifactStore implements ArtifactStore {
  private readonly root: string;

  constructor(opts: { root: string }) {
    this.root = opts.root;
    if (!existsSync(this.root)) {
      mkdirSync(this.root, { recursive: true });
    }
  }

  put(input: SendFile): { uri: string } {
    const id = crypto.randomUUID();
    const ext = 'path' in input ? extname(input.path) : guessExt(input.mediaType);
    const filename = `${id}${ext}`;
    const abs = join(this.root, filename);
    mkdirSync(dirname(abs), { recursive: true });

    if ('path' in input) {
      const bytes = readFileSync(input.path);
      writeFileSync(abs, bytes);
    } else {
      writeFileSync(abs, input.bytes);
    }

    return { uri: filename };
  }

  read(uri: string): { bytes: Uint8Array; mediaType?: string } {
    const abs = join(this.root, uri);
    if (!existsSync(abs)) {
      throw new Error(`artifact not found: ${uri}`);
    }
    const bytes = readFileSync(abs);
    const mediaType = guessMediaType(uri);
    return { bytes, mediaType };
  }
}

function guessExt(mediaType?: string): string {
  if (!mediaType) {
    return '';
  }
  for (const [ext, mime] of Object.entries(MIME_MAP)) {
    if (mime === mediaType) {
      return ext;
    }
  }
  return '';
}
