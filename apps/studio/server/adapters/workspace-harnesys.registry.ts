import type {
  EpisodicPort,
  KnowledgePort,
  McpServerConfig,
  ModelsPort,
  PinPort,
  SemanticMemoryPort,
  ToolDefinition,
} from 'harnesys';
import {
  askUser,
  createRuntime,
  fetch,
  files,
  type HarnesysRuntime,
  shell,
} from 'harnesys';
import { ValidationError } from '../domain/studio.error.ts';
import type { Workspace } from '../domain/workspace.port.ts';
import { loadWorkspaceMcpServers } from './mcp-json.adapter.ts';

export type WorkspaceHarnesysMemory = {
  pin?: PinPort;
  semantic?: SemanticMemoryPort;
  episodic?: EpisodicPort;
  knowledge?: KnowledgePort;
};

export class WorkspaceHarnesysRegistry {
  private readonly cache = new Map<string, Promise<HarnesysRuntime>>();
  private extraTools: ToolDefinition[] = [];

  constructor(
    private readonly models: ModelsPort,
    private readonly memory: WorkspaceHarnesysMemory = {},
  ) {}

  setExtraTools(tools: ToolDefinition[]): void {
    this.extraTools = tools;
    for (const workspaceId of [...this.cache.keys()]) {
      void this.forget(workspaceId);
    }
  }

  get(workspace: Workspace): Promise<HarnesysRuntime> {
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

  /** Drop cached instance so next get() reloads skills root / .studio/mcp.json. */
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
      const hx = await pending;
      await hx.close();
    } catch {
      // create failed; nothing to close
    }
  }

  private create(workspace: Workspace): Promise<HarnesysRuntime> {
    let servers: McpServerConfig[];
    try {
      servers = loadWorkspaceMcpServers(workspace.path);
    } catch (err) {
      return Promise.reject(new ValidationError(err instanceof Error ? err.message : String(err)));
    }
    return createRuntime({
      models: this.models,
      tools: [...files(), shell(), fetch(), askUser(), ...this.extraTools],
      skills: { workspaceRoot: workspace.path },
      mcp: { servers },
      memory: {
        pin: this.memory.pin,
        semantic: this.memory.semantic,
        episodic: this.memory.episodic,
        knowledge: this.memory.knowledge,
        workspaceId: workspace.id,
      },
    });
  }
}
