import { existsSync } from 'node:fs';
import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { MachineConfigFileAdapter } from '../adapters/machine-config/machine-config.file.ts';
import { createSqliteConnection } from '../adapters/store/sqlite/connection.ts';
import { defaultHomePath, studioDbPath, workspaceDbPath } from '../adapters/store/studio-layout.ts';
import { HostNodeRegistry } from '../application/nodes/node-registry.ts';
import { logger } from '../config/logger.ts';
import type { AttachmentsPort } from '../domain/attachments.port.ts';
import type { HostNodeRecord } from '../domain/machine-config.ts';
import type { WorkspacePort } from '../domain/workspace.port.ts';
import type { WorkspaceFilesPort } from '../domain/workspace-files.port.ts';
import { createStudioPlatform } from './create-platform.ts';
import { evaluateCutoverGate, logCutoverRefusal } from './cutover-gate.ts';
import { createNodeSupervisor } from './node-supervisor.ts';
import { registerStudioHttp } from './register-http.ts';
import { tryCreateHostSecretStore } from './secret-store-boot.ts';

export type StudioOptions = {
  workspace?: WorkspacePort;
  workspaceFiles?: WorkspaceFilesPort;
  attachments?: AttachmentsPort;
  home?: string;
};

/** Composition root: host config → N node runtimes → http. */
export function createStudio(options: StudioOptions = {}): Hono {
  const home = options.home ?? defaultHomePath();
  const machineConfig = new MachineConfigFileAdapter({ home });
  const nodeRegistry = new HostNodeRegistry({ config: machineConfig });

  // One-shot: empty host.nodes ← legacy studio.db workspaces table (ids/paths only).
  if (existsSync(studioDbPath(home))) {
    nodeRegistry.migrateFromLegacyStudioDbIfEmpty(() => readLegacyWorkspaceNodes(home));
  } else {
    nodeRegistry.migrateFromLegacyStudioDbIfEmpty(() => []);
  }

  const nodes = nodeRegistry.list();
  const gate = evaluateCutoverGate(nodes, home);
  if (!gate.ok) {
    logCutoverRefusal(gate.reason);
    return refuseApp(gate.reason);
  }

  const platform = createStudioPlatform(options);
  const secretStore = tryCreateHostSecretStore();
  const supervisor = createNodeSupervisor({
    platform,
    nodes: nodeRegistry,
    secretStore,
    home,
  });

  for (const node of nodes) {
    if (nodeRegistry.status(node.id) !== 'ready') {
      logger.warn({ scope: 'boot' }, `skip unavailable node ${node.id} path=${node.path}`);
      continue;
    }
    if (!existsSync(workspaceDbPath(node.path))) {
      logger.warn(
        { scope: 'boot' },
        `skip node ${node.id}: workspace.db missing at ${workspaceDbPath(node.path)}`,
      );
      continue;
    }
    try {
      supervisor.start(node);
    } catch (err) {
      logger.error(
        { scope: 'boot' },
        `failed to start node ${node.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return registerStudioHttp({
    supervisor,
    platform,
    machineConfig,
    nodeRegistry,
    home,
    secretStore,
  });
}

function readLegacyWorkspaceNodes(home: string): HostNodeRecord[] {
  try {
    const db = createSqliteConnection(studioDbPath(home));
    const rows = db.all<{ id: string; name: string; path: string }>(
      sql.raw('select id, name, path from workspaces order by created_at'),
    );
    return rows.map((row) => ({ id: row.id, name: row.name, path: row.path }));
  } catch {
    return [];
  }
}

function refuseApp(reason: string): Hono {
  const app = new Hono();
  app.all('*', (c) =>
    c.json(
      {
        error: reason,
        hint: 'bun run cutover — from apps/studio/server with the host stopped',
      },
      503,
    ),
  );
  return app;
}
