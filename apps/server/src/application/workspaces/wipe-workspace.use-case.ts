import { existsSync, rmSync } from 'node:fs';
import { studioDir, workspaceDbPath } from '../../adapters/store/studio-layout.ts';
import { NotFoundError, ValidationError } from '../../domain/studio.error.ts';
import type { NodeRegistry } from '../nodes/node-registry.ts';
export type WipeWorkspaceRequest = {
  id: string;
  wipeFolder?: boolean;
};
export type WipeWorkspaceInput = {
  execute(request: WipeWorkspaceRequest): Promise<void>;
};
export type WipeWorkspaceDeps = {
  nodes: NodeRegistry;
  stopRuntime?: (id: string) => void;
};
export class WipeWorkspaceUseCase implements WipeWorkspaceInput {
  constructor(private readonly deps: WipeWorkspaceDeps) {}
  execute(request: WipeWorkspaceRequest): Promise<void> {
    const node = this.deps.nodes.get(request.id);
    if (!node) {
      throw new NotFoundError('workspace not found');
    }
    this.deps.stopRuntime?.(request.id);
    const dbPath = workspaceDbPath(node.path);
    if (existsSync(dbPath)) {
      rmSync(dbPath, { force: true });
    }
    for (const suffix of ['-wal', '-shm']) {
      const side = `${dbPath}${suffix}`;
      if (existsSync(side)) {
        rmSync(side, { force: true });
      }
    }
    if (request.wipeFolder) {
      if (!node.path || node.path === '/' || node.path.trim().length < 2) {
        throw new ValidationError('refusing to wipe unsafe path');
      }
      rmSync(node.path, { recursive: true, force: true });
    } else {
      const meta = studioDir(node.path);
      void meta;
    }
    this.deps.nodes.removeFromHost(request.id);
    return Promise.resolve();
  }
}
