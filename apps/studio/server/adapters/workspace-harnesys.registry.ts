import type { CursorMcpJson, ModelsPort, RuntimeHandle, ToolDefinition } from 'harnesys';
import { createRuntime } from 'harnesys';
import { askUser, fetch, files, shell } from 'harnesys/actions';
import { ValidationError } from '../domain/studio.error.ts';
import type { Workspace } from '../domain/workspace.port.ts';
import { readWorkspaceMcpJson } from './mcp-json.adapter.ts';

export class WorkspaceHarnesysRegistry {
  private readonly cache = new Map<string, Promise<RuntimeHandle>>();
  private extraTools: ToolDefinition[] = [];

  constructor(private readonly models: ModelsPort) {}

  setExtraTools(tools: ToolDefinition[]): void {
    this.extraTools = tools;
    for (const workspaceId of [...this.cache.keys()]) {
      void this.forget(workspaceId);
    }
  }

  get(workspace: Workspace): Promise<RuntimeHandle> {
    const cached = this.cache.get(workspace.id);
    if (cached) {
      return cached;
    }

    const pending = this.create(workspace);
    this.cache.set(workspace.id, pending);
    pending.catch(() => {
      if (this.cache.get(workspace.id) === pending) {
        this.cache.delete(workspace.id);
      }
    });
    return pending;
  }

  invalidate(workspaceId: string): Promise<void> {
    return this.forget(workspaceId);
  }

  async forget(workspaceId: string): Promise<void> {
    const pending = this.cache.get(workspaceId);
    this.cache.delete(workspaceId);
    if (!pending) {
      return;
    }
    try {
      const rt = await pending;
      await rt.close();
    } catch {
      // create failed; nothing to close
    }
  }

  private create(workspace: Workspace): Promise<RuntimeHandle> {
    let mcpJson: CursorMcpJson;
    try {
      mcpJson = { mcpServers: readWorkspaceMcpJson(workspace.path) };
    } catch (err) {
      return Promise.reject(new ValidationError(err instanceof Error ? err.message : String(err)));
    }
    return createRuntime({
      models: this.models,
      tools: [...files(), shell(), fetch(), askUser(), ...this.extraTools],
      agents: { resolve: () => undefined },
      mcp: mcpJson,
      paths: { cwd: workspace.path },
    });
  }
}
