import type { AgentRecord } from './agent.ts';
import type { ThreadPlanRecord } from './plan-types.ts';
import type { ScheduleRecord, WebhookRecord } from './schedule.ts';
import type { ThreadRecord } from './thread.ts';

export type AttachmentKind = 'image' | 'audio' | 'video' | 'file';
export type ThreadAttachment = {
  id: string;
  kind: AttachmentKind;
  name: string;
  mediaType: string;
  path: string;
};
export type HumanEntry = {
  id: string;
  text?: string;
  createdAt: string;
  attachments?: ThreadAttachment[];
  origin?: string;
};
export type DeskEvent =
  | {
      type: 'thread';
      thread: ThreadRecord;
    }
  | {
      type: 'schedule';
      schedule: ScheduleRecord;
    }
  | {
      type: 'schedule-deleted';
      id: string;
    }
  | {
      type: 'plan';
      plan: ThreadPlanRecord;
    }
  | {
      type: 'plan-deleted';
      threadId: string;
    }
  | {
      type: 'webhook';
      webhook: WebhookRecord;
    }
  | {
      type: 'webhook-deleted';
      id: string;
    }
  | {
      type: 'agent';
      agent: AgentRecord;
    }
  | {
      type: 'agent-deleted';
      id: string;
    }
  | {
      type: 'terminal';
      workspaceId: string;
      jobId: string;
    }
  | {
      type: 'run-finish';
      threadId: string;
    };
