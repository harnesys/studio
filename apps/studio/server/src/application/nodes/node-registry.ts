import { existsSync, statSync } from 'node:fs';
import { seedWorkspaceModePresets } from '../../adapters/store/sqlite/seed-workspace-mode-presets.ts';
import { workspaceDbPath } from '../../adapters/store/studio-layout.ts';
import { createWorkspaceStore } from '../../composition/create-store.ts';
import type {
  HostNodeRecord,
  HostNodeStatus,
  MachineConfigPort,
} from '../../domain/machine-config.ts';
import { ConflictError, NotFoundError, ValidationError } from '../../domain/studio.error.ts';

export type NodeRegistry = {
  list(): HostNodeRecord[];
  get(id: string): HostNodeRecord | undefined;
  status(id: string): HostNodeStatus;
  create(input: { name: string; path: string }): HostNodeRecord;
  update(id: string, patch: { name?: string; path?: string }): HostNodeRecord;
  removeFromHost(id: string): void;
  /**
   * One-shot: if host.nodes empty and legacy studio.db still has workspaces,
   * copy those rows into config. Prefer cutover script for domain data.
   */
  migrateFromLegacyStudioDbIfEmpty(listLegacyWorkspaces: () => HostNodeRecord[]): void;
};

export type NodeRegistryDeps = {
  config: MachineConfigPort;
};

export class HostNodeRegistry implements NodeRegistry {
  private readonly config: MachineConfigPort;

  constructor(deps: NodeRegistryDeps) {
    this.config = deps.config;
  }

  list(): HostNodeRecord[] {
    return this.config.read().host.nodes.slice();
  }

  get(id: string): HostNodeRecord | undefined {
    return this.config.read().host.nodes.find((node) => node.id === id);
  }

  status(id: string): HostNodeStatus {
    const node = this.get(id);
    if (!node) {
      return 'unavailable';
    }
    return pathReady(node.path) ? 'ready' : 'unavailable';
  }

  create(input: { name: string; path: string }): HostNodeRecord {
    const name = input.name.trim();
    const path = input.path.trim();
    if (!name) {
      throw new ValidationError('name is required');
    }
    if (!path) {
      throw new ValidationError('path is required');
    }

    const nodes = this.list();
    assertUniqueAmong(nodes, { name, path });

    const record: HostNodeRecord = {
      id: crypto.randomUUID(),
      name,
      path,
    };
    const now = new Date().toISOString();
    const store = createWorkspaceStore(path);
    // Drop orphan identity left by removeFromHost so path can be re-bound.
    for (const row of store.workspaceRepo.list()) {
      if (row.path === path || row.id === record.id) {
        store.workspaceRepo.delete(row.id);
      }
    }
    store.workspaceRepo.insert({
      id: record.id,
      name: record.name,
      path: record.path,
      createdAt: now,
    });
    seedWorkspaceModePresets(store.db, record.id);
    this.config.writeHost({ nodes: [...nodes, record] });
    return record;
  }

  update(id: string, patch: { name?: string; path?: string }): HostNodeRecord {
    const nodes = this.list();
    const index = nodes.findIndex((node) => node.id === id);
    if (index < 0) {
      throw new NotFoundError('workspace not found');
    }
    const current = nodes[index] as HostNodeRecord;
    const name = patch.name !== undefined ? patch.name.trim() : current.name;
    const path = patch.path !== undefined ? patch.path.trim() : current.path;
    if (!name) {
      throw new ValidationError('name is required');
    }
    if (!path) {
      throw new ValidationError('path is required');
    }

    const others = nodes.filter((node) => node.id !== id);
    assertUniqueAmong(others, { name, path });

    const next: HostNodeRecord = { id, name, path };
    const nextNodes = nodes.slice();
    nextNodes[index] = next;
    this.config.writeHost({ nodes: nextNodes });

    const dbFile = workspaceDbPath(path);
    if (existsSync(dbFile) || existsSync(workspaceDbPath(current.path))) {
      const storePath = existsSync(dbFile) ? path : current.path;
      const store = createWorkspaceStore(storePath);
      if (store.workspaceRepo.findById(id)) {
        store.workspaceRepo.update(id, { name, path });
      }
    }
    return next;
  }

  removeFromHost(id: string): void {
    const nodes = this.list();
    if (!nodes.some((node) => node.id === id)) {
      throw new NotFoundError('workspace not found');
    }
    this.config.writeHost({ nodes: nodes.filter((node) => node.id !== id) });
  }

  migrateFromLegacyStudioDbIfEmpty(listLegacyWorkspaces: () => HostNodeRecord[]): void {
    const current = this.config.read();
    if (current.host.nodes.length > 0) {
      return;
    }
    const rows = listLegacyWorkspaces();
    if (rows.length === 0) {
      this.config.writeHost({});
      return;
    }
    this.config.writeHost({ nodes: rows });
  }
}

function assertUniqueAmong(
  nodes: HostNodeRecord[],
  candidate: { name: string; path: string },
): void {
  if (nodes.some((node) => node.name === candidate.name)) {
    throw new ConflictError('workspace name exists');
  }
  if (nodes.some((node) => node.path === candidate.path)) {
    throw new ConflictError('workspace path exists');
  }
}

function pathReady(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isDirectory();
  } catch {
    return false;
  }
}
