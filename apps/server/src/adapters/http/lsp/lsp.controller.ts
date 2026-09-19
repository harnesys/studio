import type { WorkspaceLspEntry } from '@harnesys/studio-shared';
import type { Hono } from 'hono';
import { LspStatusUseCase } from '../../../application/lsp/lsp-status.use-case.ts';
import {
  type LspPresetSpec,
  PRESET_INSTALL_HINT,
  TYPESCRIPT_PRESET,
} from '../../../application/plugins/lsp-presets.ts';
import type { NodeSupervisor } from '../../../composition/node-supervisor.ts';
import { requireNode } from '../../../composition/routing-helpers.ts';
import type { PluginRepository } from '../../../domain/plugin.port.ts';
import { NotFoundError, UnavailableError, ValidationError } from '../../../domain/studio.error.ts';
import type { WorkspaceRepository } from '../../../domain/workspace.port.ts';
import type { StudioLspAdapter } from '../../lsp/studio-lsp.adapter.ts';
import { readWorkspaceLspFile, writeWorkspaceLspFile } from '../../lsp/workspace-lsp-file.ts';
export type LspControllerDeps = {
  workspaceRepo: WorkspaceRepository;
  supervisor?: NodeSupervisor;
};
type ResolvedLspNode = {
  cwd: string;
  lsp: StudioLspAdapter;
  plugins: PluginRepository;
  status: LspStatusUseCase;
};
export class LspController {
  constructor(private readonly deps: LspControllerDeps) {}
  register(app: Hono): void {
    const base = '/api/workspaces/:id/lsp';
    app.get(base, async (c) => {
      const id = c.req.param('id');
      const node = this.resolve(id);
      return c.json(await node.status.execute({ workspaceId: id }));
    });
    app.put(base, async (c) => {
      const id = c.req.param('id');
      const node = this.resolve(id);
      const body: unknown = await c.req.json();
      try {
        await writeWorkspaceLspFile(node.cwd, body);
      } catch (error) {
        throw new ValidationError(
          error instanceof Error ? error.message : 'invalid workspace LSP config',
        );
      }
      await node.lsp.invalidateCwd(node.cwd);
      return c.json(await node.status.execute({ workspaceId: id }));
    });
    app.post(`${base}/:serverId/restart`, async (c) => {
      const id = c.req.param('id');
      const serverId = c.req.param('serverId');
      const node = this.resolve(id);
      const entry = await this.requireServer(node, id, serverId);
      await node.lsp.invalidateCwd(node.cwd);
      if (entry.granted && !entry.disabled) {
        try {
          await node.lsp.openSession(node.cwd, probePath(entry));
        } catch (error) {
          throw new UnavailableError(
            error instanceof Error ? error.message : 'failed to start LSP server',
          );
        }
      }
      return c.json(await node.status.execute({ workspaceId: id }));
    });
    app.post(`${base}/:serverId/stop`, async (c) => {
      const id = c.req.param('id');
      const serverId = c.req.param('serverId');
      const node = this.resolve(id);
      const entry = await this.requireServer(node, id, serverId);
      if (entry.origin === 'file') {
        const raw = readWorkspaceLspFile(node.cwd).raw;
        await writeWorkspaceLspFile(
          node.cwd,
          withFileDisabled(raw, serverId, {
            command: entry.command,
            ...(entry.args !== undefined ? { args: entry.args } : {}),
            extensionToLanguage: entry.extensionToLanguage,
          }),
        );
      } else if (entry.origin.startsWith('plugin:')) {
        node.plugins.setServerDisabled(entry.origin.slice('plugin:'.length), serverId, id, true);
      } else {
        throw new NotFoundError('lsp server not found');
      }
      await node.lsp.invalidateCwd(node.cwd);
      return c.json(await node.status.execute({ workspaceId: id }));
    });
    app.post(`${base}/preset/:lang`, async (c) => {
      const id = c.req.param('id');
      const lang = c.req.param('lang');
      const node = this.resolve(id);
      if (lang !== 'typescript') {
        const hint = PRESET_INSTALL_HINT[lang] ?? `no preset for language "${lang}" yet`;
        return c.json({ error: `preset not available for language "${lang}"`, hint }, 501);
      }
      const raw = readWorkspaceLspFile(node.cwd).raw;
      await writeWorkspaceLspFile(node.cwd, withPreset(raw, TYPESCRIPT_PRESET));
      await node.lsp.invalidateCwd(node.cwd);
      return c.json(await node.status.execute({ workspaceId: id }));
    });
  }
  private resolve(id: string): ResolvedLspNode {
    const supervisor = this.deps.supervisor;
    if (!supervisor) {
      if (!this.deps.workspaceRepo.findById(id)) {
        throw new NotFoundError('workspace not found');
      }
      throw new UnavailableError('workspace runtime not started');
    }
    const node = requireNode(supervisor, id);
    const workspace = node.store.workspaceRepo.findById(id);
    if (!workspace) {
      throw new NotFoundError('workspace not found');
    }
    return {
      cwd: workspace.path,
      lsp: node.host.lsp,
      plugins: node.store.pluginRepo,
      status: new LspStatusUseCase(
        node.store.workspaceRepo,
        node.host.workspaceHarnesys,
        node.store.pluginRepo,
      ),
    };
  }
  private async requireServer(node: ResolvedLspNode, id: string, serverId: string) {
    const current = await node.status.execute({ workspaceId: id });
    const entry = current.servers.find((server) => server.serverId === serverId);
    if (!entry) {
      throw new NotFoundError('lsp server not found');
    }
    return entry;
  }
}
function probePath(entry: WorkspaceLspEntry): string {
  const ext = Object.keys(entry.extensionToLanguage)[0] ?? '';
  return `__lsp_probe${ext}`;
}
function withFileDisabled(
  raw: unknown,
  serverId: string,
  fallback: {
    command: string;
    args?: string[];
    extensionToLanguage: Record<string, string>;
  },
): unknown {
  const next = { ...fallback, disabled: true };
  if (isRecord(raw) && isRecord(raw.servers)) {
    const servers = raw.servers as Record<string, unknown>;
    const existing = servers[serverId];
    return {
      ...raw,
      servers: {
        ...servers,
        [serverId]: { ...(isRecord(existing) ? existing : next), disabled: true },
      },
    };
  }
  if (isRecord(raw)) {
    const existing = raw[serverId];
    return { ...raw, [serverId]: { ...(isRecord(existing) ? existing : next), disabled: true } };
  }
  return { [serverId]: next };
}
function withPreset(raw: unknown, preset: Record<string, LspPresetSpec>): unknown {
  if (isRecord(raw) && isRecord(raw.servers)) {
    const servers: Record<string, unknown> = { ...(raw.servers as Record<string, unknown>) };
    for (const [serverId, spec] of Object.entries(preset)) {
      if (servers[serverId] === undefined) {
        servers[serverId] = spec;
      }
    }
    return { ...raw, servers };
  }
  if (isRecord(raw)) {
    const next: Record<string, unknown> = { ...raw };
    for (const [serverId, spec] of Object.entries(preset)) {
      if (next[serverId] === undefined) {
        next[serverId] = spec;
      }
    }
    return next;
  }
  return { ...preset };
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
