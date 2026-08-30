import type { Context, Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { StreamEvent } from '../../../../shared/types.ts';
import type { GetThreadPlanInput } from '../../../application/plans/get-thread-plan.use-case.ts';
import type { AnswerRunInput } from '../../../application/threads/answer-run.use-case.ts';
import type { CancelRunInput } from '../../../application/threads/cancel-run.use-case.ts';
import type { CompactThreadInput } from '../../../application/threads/compact-thread.use-case.ts';
import type { ConfirmRunInput } from '../../../application/threads/confirm-run.use-case.ts';
import type { CreateThreadInput } from '../../../application/threads/create-thread.use-case.ts';
import type { CreateThreadAttachmentInput } from '../../../application/threads/create-thread-attachment.use-case.ts';
import type { DeleteThreadInput } from '../../../application/threads/delete-thread.use-case.ts';
import type { DeleteThreadEntryInput } from '../../../application/threads/delete-thread-entry.use-case.ts';
import type { GetThreadInput } from '../../../application/threads/get-thread.use-case.ts';
import type { GetThreadAttachmentInput } from '../../../application/threads/get-thread-attachment.use-case.ts';
import type { ListThreadPendingAttachmentsInput } from '../../../application/threads/list-thread-pending-attachments.use-case.ts';
import type { ListThreadsInput } from '../../../application/threads/list-threads.use-case.ts';
import type { MarkThreadReadInput } from '../../../application/threads/mark-thread-read.use-case.ts';
import type { ResumeThreadRunInput } from '../../../application/threads/resume-thread-run.use-case.ts';
import type { SendThreadRunInput } from '../../../application/threads/send-thread-run.use-case.ts';
import type { StreamRunEventsInput } from '../../../application/threads/stream-run-events.use-case.ts';
import type { UpdateThreadInput } from '../../../application/threads/update-thread.use-case.ts';
import { SSE_KEEP_ALIVE_MS } from '../../../config/constants.ts';
import { preview, trace } from '../../../trace.ts';
import {
  answerRunBody,
  confirmRunBody,
  createThreadBody,
  sendThreadRunBody,
  updateThreadBody,
} from './thread.body.ts';

export type ThreadControllerDeps = {
  listThreads: ListThreadsInput;
  getThread: GetThreadInput;
  createThread: CreateThreadInput;
  updateThread: UpdateThreadInput;
  markThreadRead: MarkThreadReadInput;
  deleteThread: DeleteThreadInput;
  deleteThreadEntry: DeleteThreadEntryInput;
  sendThreadRun: SendThreadRunInput;
  compactThread: CompactThreadInput;
  resumeThreadRun: ResumeThreadRunInput;
  streamRunEvents: StreamRunEventsInput;
  cancelRun: CancelRunInput;
  confirmRun: ConfirmRunInput;
  answerRun: AnswerRunInput;
  createThreadAttachment: CreateThreadAttachmentInput;
  getThreadAttachment: GetThreadAttachmentInput;
  listThreadPendingAttachments?: ListThreadPendingAttachmentsInput;
  getThreadPlan?: GetThreadPlanInput;
};

export class ThreadController {
  constructor(private readonly deps: ThreadControllerDeps) {}

  register(app: Hono): void {
    app.get('/api/threads', async (c) => {
      return c.json(await this.deps.listThreads.execute());
    });

    app.post('/api/threads', async (c) => {
      const body = createThreadBody.parse(await c.req.json());
      const thread = await this.deps.createThread.execute({
        title: body.title ?? undefined,
        agentId: body.agentId ?? undefined,
        workspaceId: body.workspaceId ?? undefined,
        kind: body.kind,
      });
      return c.json(thread, 201);
    });

    app.get('/api/threads/:id', async (c) => {
      return c.json(await this.deps.getThread.execute({ id: c.req.param('id') }));
    });

    app.get('/api/threads/:id/plan', async (c) => {
      if (!this.deps.getThreadPlan) {
        return c.json({ error: 'not available' }, 404);
      }
      const plan = await this.deps.getThreadPlan.execute({ threadId: c.req.param('id') });
      return c.json({ plan });
    });

    app.get('/api/threads/:id/attachments', async (c) => {
      const threadId = c.req.param('id');
      const pending = c.req.query('pending');
      if (pending === '1' || pending === 'true') {
        if (this.deps.listThreadPendingAttachments) {
          const res = await this.deps.listThreadPendingAttachments.execute({ threadId });
          return c.json(res);
        }
        return c.json({ items: [] });
      }
      return c.json({ items: [] });
    });

    app.post('/api/threads/:id/attachments', async (c) => {
      const uploaded = (await c.req.parseBody()).file;
      if (!(uploaded instanceof File)) {
        return c.json({ error: 'file required' }, 400);
      }
      const saved = await this.deps.createThreadAttachment.execute({
        threadId: c.req.param('id'),
        name: uploaded.name,
        mediaType: uploaded.type || 'application/octet-stream',
        bytes: new Uint8Array(await uploaded.arrayBuffer()),
      });
      return c.json(saved, 201);
    });

    app.get('/api/threads/:id/attachments/:attachmentId', async (c) => {
      const stored = await this.deps.getThreadAttachment.execute({
        threadId: c.req.param('id'),
        attachmentId: c.req.param('attachmentId'),
      });
      const inline = stored.meta.kind !== 'file';
      const bytes = new Uint8Array(stored.bytes);
      return c.body(bytes, 200, {
        'Content-Type': stored.meta.mediaType || 'application/octet-stream',
        'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${stored.meta.name}"`,
      });
    });

    app.post('/api/threads/:id/runs', async (c) => {
      const threadId = c.req.param('id');
      const body = sendThreadRunBody.parse(await c.req.json());
      trace('http', 'POST /runs', {
        threadId,
        text: preview(body.text),
      });

      const response = await this.deps.sendThreadRun.execute({
        threadId,
        text: body.text || undefined,
        attachmentIds: body.attachmentIds,
        mode: body.mode,
      });

      return c.json(response, 202);
    });

    app.post('/api/threads/:id/resume', async (c) => {
      const threadId = c.req.param('id');
      trace('http', 'POST /resume', { threadId });
      const response = await this.deps.resumeThreadRun.execute({ threadId });
      return c.json(response, 202);
    });

    app.post('/api/threads/:id/compact', async (c) => {
      const threadId = c.req.param('id');
      trace('http', 'POST /compact', { threadId });
      const response = await this.deps.compactThread.execute({ threadId });
      return c.json(response);
    });

    app.get('/api/runs/:id/events', async (c) => {
      const runId = c.req.param('id');
      trace('http', 'GET /runs/:id/events', { runId });
      const events = await this.deps.streamRunEvents.execute({ runId });
      return streamSse(c, events);
    });

    app.post('/api/runs/:id/cancel', async (c) => {
      const runId = c.req.param('id');
      await this.deps.cancelRun.execute({ runId });
      return c.json({ ok: true });
    });

    app.post('/api/runs/:id/confirm', async (c) => {
      const runId = c.req.param('id');
      const body = confirmRunBody.parse(await c.req.json());
      trace('http', 'POST /confirm', { runId, stepId: body.stepId });
      const snapshot = await this.deps.confirmRun.execute({
        runId,
        stepId: body.stepId,
        decision: body.decision,
      });
      return c.json(snapshot);
    });

    app.post('/api/runs/:id/answer', async (c) => {
      const runId = c.req.param('id');
      const body = answerRunBody.parse(await c.req.json());
      trace('http', 'POST /answer', { runId, stepId: body.stepId });
      const snapshot = await this.deps.answerRun.execute({
        runId,
        stepId: body.stepId,
        input: {
          optionIds: body.optionIds,
          text: body.text,
        },
      });
      return c.json(snapshot);
    });

    app.delete('/api/runs/:id', async (c) => {
      const runId = c.req.param('id');
      await this.deps.cancelRun.execute({ runId });
      return c.body(null, 204);
    });

    app.patch('/api/threads/:id', async (c) => {
      const body = updateThreadBody.parse(await c.req.json());
      const thread = await this.deps.updateThread.execute({
        id: c.req.param('id'),
        title: body.title ?? undefined,
        agentId: body.agentId ?? undefined,
        workspaceId: body.workspaceId ?? undefined,
      });
      return c.json(thread);
    });

    app.post('/api/threads/:id/read', async (c) => {
      const thread = await this.deps.markThreadRead.execute({ id: c.req.param('id') });
      return c.json(thread);
    });

    app.delete('/api/threads/:id/entries/:entryId', async (c) => {
      const thread = await this.deps.deleteThreadEntry.execute({
        threadId: c.req.param('id'),
        entryId: c.req.param('entryId'),
      });
      return c.json(thread);
    });

    app.delete('/api/threads/:id', async (c) => {
      await this.deps.deleteThread.execute({ id: c.req.param('id') });
      return c.body(null, 204);
    });
  }
}

function streamSse(c: Context, events: AsyncIterable<StreamEvent>) {
  c.header('Cache-Control', 'no-cache, no-transform');
  c.header('X-Accel-Buffering', 'no');
  c.header('Connection', 'keep-alive');
  return streamSSE(
    c,
    async (stream) => {
      const keepAlive = setInterval(() => {
        void Promise.resolve(stream.write(':\n\n')).catch((error) => {
          trace('http', 'keepalive write failed', {
            error: error instanceof Error ? error.message : String(error),
          });
        });
      }, SSE_KEEP_ALIVE_MS);
      let count = 0;
      try {
        for await (const ev of events) {
          count += 1;
          trace('http', `sse write #${count} ${ev.type}`, { seq: ev.seq });
          await stream.writeSSE({
            id: String(ev.seq),
            event: ev.type,
            data: JSON.stringify(ev),
          });
        }
        trace('http', `sse complete, ${count} events`);
      } finally {
        clearInterval(keepAlive);
      }
    },
    (error) => {
      trace('http', 'sse callback error', error.message);
      return Promise.resolve();
    },
  );
}
