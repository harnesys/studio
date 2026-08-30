import type { AgentRepository } from './agent.port.ts';
import type { AttachmentRepository } from './attachment.port.ts';
import type { JournalRepository } from './journal.port.ts';
import type { PlanRepository } from './plan.port.ts';
import type { ThreadRepository } from './thread.port.ts';

export type StudioRepos = {
  threads: ThreadRepository;
  journal: JournalRepository;
  attachments: AttachmentRepository;
  agents: AgentRepository;
  plans: PlanRepository;
};

export type UnitOfWork = {
  run<T>(work: (repos: StudioRepos) => T): T;
};
