import type { AgentRepository } from '../../domain/agent.port.ts';
import type { ScheduleRepository } from '../../domain/schedule.port.ts';
import type { ThreadRepository } from '../../domain/thread.port.ts';
import type { WebhookRepository } from '../../domain/webhook.port.ts';
import { requireAgent } from './agent.helpers.ts';

export type DeleteAgentRequest = {
  workspaceId: string;
  id: string;
};

export type DeleteAgentInput = {
  execute(request: DeleteAgentRequest): Promise<void>;
};

/** Name-keyed rows writers (semantic memories, pins); drop everything for one agent name. */
export type AgentNameCleanup = {
  deleteByAgentName(input: { workspaceId: string; agentName: string }): void;
};

export type DeleteAgentCascade = {
  schedules: ScheduleRepository;
  webhooks: WebhookRepository;
  semantic?: AgentNameCleanup;
  pins?: AgentNameCleanup;
};

export class DeleteAgentUseCase implements DeleteAgentInput {
  constructor(
    private readonly agents: AgentRepository,
    private readonly threads: ThreadRepository,
    private readonly cascade: DeleteAgentCascade,
  ) {}

  async execute(request: DeleteAgentRequest): Promise<void> {
    const agent = requireAgent(this.agents, request.workspaceId, request.id);
    const delegates = this.agents
      .listByWorkspace(request.workspaceId)
      .filter((row) => row.parentId === request.id);
    const targets = [...delegates, agent];
    // schedules/webhooks reference agents(id) without FK cascade: drop them before rows.
    for (const target of targets) {
      const schedules = this.cascade.schedules.listByTargetAgent(request.workspaceId, target.id);
      for (const schedule of schedules) {
        this.cascade.schedules.delete(schedule.id);
      }
      const webhooks = this.cascade.webhooks.listByTargetAgent(request.workspaceId, target.id);
      for (const webhook of webhooks) {
        this.cascade.webhooks.delete(webhook.id);
      }
    }
    // runs hang off threads (FK cascade), so deleting threads clears them too.
    for (const target of targets) {
      this.threads.deleteByAgent(target.id);
      this.agents.delete(target.id);
    }
    this.dropOrphanedNameData(
      request.workspaceId,
      targets.map((target) => target.name),
    );
    await Promise.resolve();
  }

  /** Memory/pins are keyed by NAME: drop a name only after no live agent carries it. */
  private dropOrphanedNameData(workspaceId: string, names: string[]): void {
    for (const name of new Set(names)) {
      if (this.agents.findByName(workspaceId, name)) {
        continue;
      }
      const input = { workspaceId, agentName: name };
      this.cascade.semantic?.deleteByAgentName(input);
      this.cascade.pins?.deleteByAgentName(input);
    }
  }
}
