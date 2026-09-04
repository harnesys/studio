import type { RunLifecycleStore, SessionEvent } from 'harnesys';
import type { Context } from 'hono';
import { streamSSE } from 'hono/streaming';
import { SSE_KEEP_ALIVE_MS } from '../../../config/constants.ts';
import { trace } from '../../../trace.ts';

export function streamSse(
  c: Context,
  runId: string,
  events: AsyncIterable<SessionEvent>,
  lifecycle: RunLifecycleStore,
) {
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
          trace('http', `sse write #${count} ${ev.type}`);
          await stream.writeSSE({
            id: String(ev.seq ?? 0),
            event: ev.type,
            data: JSON.stringify(ev),
          });
        }
        const rec = await lifecycle.get(runId);
        if (rec) {
          await stream.writeSSE({
            event: 'run-paused',
            data: JSON.stringify({ runId, status: rec.status }),
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
