import type { RunLifecycleStore } from 'harnesys';
import type { Hono } from 'hono';
import type { GetThreadPlanInput } from '../../../application/plans/get-thread-plan.use-case.ts';
import type { CancelRunInput } from '../../../application/threads/cancel-run.use-case.ts';
import type { CompactThreadInput } from '../../../application/threads/compact-thread.use-case.ts';
import type { CreateThreadInput } from '../../../application/threads/create-thread.use-case.ts';
import type { CreateThreadAttachmentInput } from '../../../application/threads/create-thread-attachment.use-case.ts';
import type { DeleteThreadInput } from '../../../application/threads/delete-thread.use-case.ts';
import type { GetThreadInput } from '../../../application/threads/get-thread.use-case.ts';
import type { GetThreadAttachmentInput } from '../../../application/threads/get-thread-attachment.use-case.ts';
import type { ListThreadPendingAttachmentsInput } from '../../../application/threads/list-thread-pending-attachments.use-case.ts';
import type { ListThreadsInput } from '../../../application/threads/list-threads.use-case.ts';
import type { MarkThreadReadInput } from '../../../application/threads/mark-thread-read.use-case.ts';
import type { RespondRunInput } from '../../../application/threads/respond-run.use-case.ts';
import type { RetryRunInput } from '../../../application/threads/retry-run.use-case.ts';
import type { SendThreadRunInput } from '../../../application/threads/send-thread-run.use-case.ts';
import type { StreamRunEventsInput } from '../../../application/threads/stream-run-events.use-case.ts';
import type { UpdateThreadInput } from '../../../application/threads/update-thread.use-case.ts';
import { RunConflictError } from '../../../domain/studio.error.ts';
import { preview, trace } from '../../../trace.ts';
import {
  createThreadBody,
  rejectRunBody,
  respondRunBody,
  sendThreadRunBody,
  updateThreadBody,
} from './thread.body.ts';
import { streamSse } from './thread.stream-sse.ts';

export type ThreadControllerDeps = {
  listThreads: ListThreadsInput;
  getThread: GetThreadInput;
  createThread: CreateThreadInput;
  updateThread: UpdateThreadInput;
  markThreadRead: MarkThreadReadInput;
  deleteThread: DeleteThreadInput;
  sendThreadRun: SendThreadRunInput;
  compactThread: CompactThreadInput;
  respondRun: RespondRunInput;
  retryRun: RetryRunInput;
  streamRunEvents: StreamRunEventsInput;
  cancelRun: CancelRunInput;
  lifecycle: RunLifecycleStore;
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

      try {
        const response = await this.deps.sendThreadRun.execute({
          threadId,
          text: body.text || undefined,
          attachmentIds: body.attachmentIds,
          mode: body.mode,
          clientEventId: body.clientEventId,
        });
        return c.json(response, 202);
      } catch (error) {
        if (error instanceof RunConflictError) {
          return c.json(error.body, 409);
        }
        throw error;
      }
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
      const parsed = Number(c.req.query('fromSeq') ?? 0);
      const fromSeq = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
      const events = await this.deps.streamRunEvents.execute({ runId, fromSeq });
      return streamSse(c, runId, events, this.deps.lifecycle);
    });

    app.post('/api/runs/:id/cancel', async (c) => {
      const runId = c.req.param('id');
      trace('http', 'POST /runs/:id/cancel', { runId });
      try {
        await this.deps.cancelRun.execute({ runId });
        return c.json({ ok: true }, 202);
      } catch (error) {
        if (error instanceof RunConflictError) {
          return c.json(error.body, 409);
        }
        throw error;
      }
    });

    app.post('/api/runs/:id/retry', async (c) => {
      const runId = c.req.param('id');
      trace('http', 'POST /runs/:id/retry', { runId });
      try {
        const response = await this.deps.retryRun.execute({ runId });
        return c.json(response, 202);
      } catch (error) {
        if (error instanceof RunConflictError) {
          return c.json(error.body, 409);
        }
        throw error;
      }
    });

    app.post('/api/runs/:id/respond', async (c) => {
      const runId = c.req.param('id');
      const body = respondRunBody.parse(await c.req.json());
      trace('http', 'POST /runs/:id/respond', { runId, askId: body.askId });
      try {
        const response = await this.deps.respondRun.respond({
          runId,
          askId: body.askId,
          payload: body.payload,
        });
        return c.json(response, 202);
      } catch (error) {
        if (error instanceof RunConflictError) {
          return c.json(error.body, 409);
        }
        throw error;
      }
    });

    app.post('/api/runs/:id/reject', async (c) => {
      const runId = c.req.param('id');
      const body = rejectRunBody.parse(await c.req.json());
      trace('http', 'POST /runs/:id/reject', { runId, askId: body.askId });
      try {
        const response = await this.deps.respondRun.reject({
          runId,
          askId: body.askId,
          note: body.note,
        });
        return c.json(response, 202);
      } catch (error) {
        if (error instanceof RunConflictError) {
          return c.json(error.body, 409);
        }
        throw error;
      }
    });

    app.delete('/api/runs/:id', async (c) => {
      const runId = c.req.param('id');
      trace('http', 'DELETE /runs/:id', { runId });
      try {
        await this.deps.cancelRun.execute({ runId });
        return c.body(null, 204);
      } catch (error) {
        if (error instanceof RunConflictError) {
          return c.json(error.body, 409);
        }
        throw error;
      }
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

    app.delete('/api/threads/:id', async (c) => {
      await this.deps.deleteThread.execute({ id: c.req.param('id') });
      return c.body(null, 204);
    });
  }
}
