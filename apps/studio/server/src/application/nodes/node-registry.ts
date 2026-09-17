import { existsSync, statSync } from 'node:fs';
import type { StudioDb } from '../../adapters/store/sqlite/connection.ts';
import { seedWorkspaceModePresets } from '../../adapters/store/sqlite/seed-workspace-mode-presets.ts';
import type {
  HostNodeRecord,
  HostNodeStatus,
  MachineConfigPort,
} from '../../domain/machine-config.ts';
import { ConflictError, NotFoundError, ValidationError } from '../../domain/studio.error.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';

export type NodeRegistry = {
  list(): HostNodeRecord[];
  get(id: string): HostNodeRecord | undefined;
  status(id: string): HostNodeStatus;
  create(input: { name: string; path: string }): HostNodeRecord;
  update(id: string, patch: { name?: string; path?: string }): HostNodeRecord;
  removeFromHost(id: string): void;
  /** One-shot: copy workspaces table into host.nodes when registry empty. */
  migrateFromTableIfEmpty(): void;
};

export type NodeRegistryDeps = {
  config: MachineConfigPort;
  workspaces: WorkspaceRepository;
  db: StudioDb;
};

export class HostNodeRegistry implements NodeRegistry {
  private readonly config: MachineConfigPort;
  private readonly workspaces: WorkspaceRepository;
  private readonly db: StudioDb;

  constructor(deps: NodeRegistryDeps) {
    this.config = deps.config;
    this.workspaces = deps.workspaces;
    this.db = deps.db;
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

    // Orphan rows left by removeFromHost: same path must not block re-create.
    const hostIds = new Set(nodes.map((node) => node.id));
    for (const row of this.workspaces.list()) {
      if (row.path === path && !hostIds.has(row.id)) {
        this.workspaces.delete(row.id);
      }
    }

    for (const row of this.workspaces.list()) {
      if (row.name === name) {
        throw new ConflictError('workspace name exists');
      }
      if (row.path === path) {
        throw new ConflictError('workspace path exists');
      }
    }

    const record: HostNodeRecord = {
      id: crypto.randomUUID(),
      name,
      path,
    };
    const now = new Date().toISOString();
    this.workspaces.insert({
      id: record.id,
      name: record.name,
      path: record.path,
      createdAt: now,
    });
    seedWorkspaceModePresets(this.db, record.id);
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

    for (const row of this.workspaces.list()) {
      if (row.id === id) {
        continue;
      }
      if (row.name === name || row.path === path) {
        throw new ConflictError(
          row.name === name ? 'workspace name exists' : 'workspace path exists',
        );
      }
    }

    const next: HostNodeRecord = { id, name, path };
    const nextNodes = nodes.slice();
    nextNodes[index] = next;
    this.config.writeHost({ nodes: nextNodes });

    if (this.workspaces.findById(id)) {
      this.workspaces.update(id, { name, path });
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

  migrateFromTableIfEmpty(): void {
    const current = this.config.read();
    if (current.host.nodes.length > 0) {
      return;
    }
    const rows = this.workspaces.list();
    if (rows.length === 0) {
      // Ensure config.json exists with token + local window host.
      this.config.writeHost({});
      return;
    }
    const nodes: HostNodeRecord[] = rows.map((row) => ({
      id: row.id,
      name: row.name,
      path: row.path,
    }));
    this.config.writeHost({ nodes });
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
