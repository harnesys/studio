import type { RunEventStore, RunLifecycleStore } from 'harnesys';
import type { ThreadSessions } from '../../adapters/thread-sessions.adapter.ts';
import type { DeskEventsPort } from '../../domain/desk-events.port.ts';
import { NotFoundError } from '../../domain/studio.error.ts';
import type { SavePlanInput } from '../plans/save-plan.use-case.ts';
import type { GetThreadInput } from './get-thread.use-case.ts';
import { mapCodedError } from './map-coded-error.ts';
import { publishDeskThread } from './publish-desk-thread.ts';
import {
  lastAskFor,
  proposalAction,
  settlePlanProposalApprove,
  settlePlanProposalCancel,
} from './settle-plan-proposal.ts';

export type RespondRunRequest = {
  runId: string;
  askId: string;
  payload?: unknown;
};

export type RejectRunRequest = {
  runId: string;
  askId: string;
  note?: string;
};

export type RespondRunResponse = {
  runId: string;
};

export type RespondRunInput = {
  respond(request: RespondRunRequest): Promise<RespondRunResponse>;
  reject(request: RejectRunRequest): Promise<RespondRunResponse>;
};

export type RespondRunDeps = {
  lifecycle: RunLifecycleStore;
  events: RunEventStore;
  sessions: ThreadSessions;
  getThread: GetThreadInput;
  deskEvents: DeskEventsPort;
  savePlan: SavePlanInput;
};

export class RespondRunUseCase implements RespondRunInput {
  constructor(private readonly deps: RespondRunDeps) {}

  async respond(request: RespondRunRequest): Promise<RespondRunResponse> {
    const rec = await this.deps.lifecycle.get(request.runId);
    if (!rec) {
      throw new NotFoundError('run not found');
    }
    const journal = await this.deps.events.tail(request.runId, 0);
    const ask = lastAskFor(journal, request.askId);
    if (ask?.source === 'plan_proposal' && proposalAction(request.payload) === 'approve') {
      try {
        await settlePlanProposalApprove({
          lifecycle: this.deps.lifecycle,
          savePlan: this.deps.savePlan,
          runId: request.runId,
          threadId: rec.threadId,
          askId: request.askId,
          ask,
          journal,
        });
      } catch (error) {
        throw mapCodedError(error);
      }
      this.publishDesk(rec.threadId);
      return { runId: request.runId };
    }
    const handle = await this.deps.sessions.forThread(rec.threadId);
    try {
      await handle.respond(request.runId, request.askId, request.payload);
    } catch (error) {
      throw mapCodedError(error);
    }
    this.publishDesk(rec.threadId);
    return { runId: request.runId };
  }

  async reject(request: RejectRunRequest): Promise<RespondRunResponse> {
    const rec = await this.deps.lifecycle.get(request.runId);
    if (!rec) {
      throw new NotFoundError('run not found');
    }
    const journal = await this.deps.events.tail(request.runId, 0);
    const ask = lastAskFor(journal, request.askId);
    if (ask?.source === 'plan_proposal') {
      try {
        await settlePlanProposalCancel({
          lifecycle: this.deps.lifecycle,
          runId: request.runId,
          askId: request.askId,
          note: request.note,
        });
      } catch (error) {
        throw mapCodedError(error);
      }
      this.publishDesk(rec.threadId);
      return { runId: request.runId };
    }
    const handle = await this.deps.sessions.forThread(rec.threadId);
    try {
      await handle.reject(request.runId, request.askId, { note: request.note });
    } catch (error) {
      throw mapCodedError(error);
    }
    this.publishDesk(rec.threadId);
    return { runId: request.runId };
  }

  private publishDesk(threadId: string): void {
    publishDeskThread(this.deps.getThread, this.deps.deskEvents, threadId);
  }
}
