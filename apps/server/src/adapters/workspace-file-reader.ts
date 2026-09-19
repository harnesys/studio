import { access } from 'node:fs/promises';
import path from 'node:path';
export function createWorkspaceFileReader(workspaceRoot?: string) {
  const root = workspaceRoot ? path.resolve(workspaceRoot) : undefined;
  return async (
    filePath: string,
  ): Promise<{
    bytes: Uint8Array;
    mimeType: string;
  }> => {
    const absolute = root ? path.resolve(root, filePath) : path.resolve(filePath);
    if (root) {
      const rel = path.relative(root, absolute);
      if (rel.startsWith('..') || path.isAbsolute(rel)) {
        throw new Error(`file outside workspace: ${filePath}`);
      }
    }
    await access(absolute);
    const file = Bun.file(absolute);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const mimeType = file.type || 'application/octet-stream';
    return { bytes, mimeType };
  };
}
