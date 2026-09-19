import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import { useEffect, useRef, useState } from 'react';

import { hostTokenQuery } from '@/shared/api/host-credential';
import { hostWsBase } from '@/shared/config/env';
import { cn } from '@/shared/lib/utils';

import '@xterm/xterm/css/xterm.css';

type ServerMessage =
  | { type: 'history'; data: string }
  | { type: 'out'; data: string }
  | { type: 'exit'; code: number | null };

type ClientMessage = { type: 'in'; data: string } | { type: 'resize'; cols: number; rows: number };

export function TerminalView({
  workspaceId,
  sessionId,
}: {
  workspaceId: string;
  sessionId: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'connecting' | 'live' | 'exited' | 'error'>('connecting');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    const term = new Terminal({
      cursorBlink: true,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      fontSize: 13,
      theme: {
        background: '#101115',
        foreground: '#e8e8ea',
        cursor: '#e8e8ea',
        selectionBackground: '#3a3a40',
      },
      allowProposedApi: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    fit.fit();

    let disposed = false;
    let exited = false;
    let ws: WebSocket | null = null;
    let resizeObserver: ResizeObserver | null = null;

    const send = (message: ClientMessage) => {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
      }
    };

    const connect = () => {
      const token = hostTokenQuery();
      const tokenQs = token ? `&${token}` : '';
      const cols = term.cols || 80;
      const rows = term.rows || 24;
      ws = new WebSocket(
        `${hostWsBase()}/api/terminals/${encodeURIComponent(sessionId)}?cols=${cols}&rows=${rows}${tokenQs}`,
      );

      ws.onopen = () => {
        if (disposed) {
          return;
        }
        setStatus('live');
        setError(null);
        fit.fit();
        send({ type: 'resize', cols: term.cols, rows: term.rows });
      };

      ws.onmessage = (event) => {
        if (disposed || typeof event.data !== 'string') {
          return;
        }
        let message: ServerMessage;
        try {
          message = JSON.parse(event.data) as ServerMessage;
        } catch {
          return;
        }
        if (message.type === 'history' || message.type === 'out') {
          term.write(message.data);
          return;
        }
        if (message.type === 'exit') {
          exited = true;
          setStatus('exited');
          term.writeln('');
          term.writeln(
            `\r\n[Process exited${message.code === null ? '' : ` with code ${message.code}`}]`,
          );
        }
      };

      ws.onerror = () => {
        if (disposed || exited) {
          return;
        }
        setStatus('error');
        setError('Terminal connection failed');
      };

      ws.onclose = () => {
        if (disposed || exited) {
          return;
        }
        setStatus('error');
        setError('Terminal disconnected');
      };
    };

    const dataDisposable = term.onData((data) => {
      send({ type: 'in', data });
    });

    const resizeDisposable = term.onResize(({ cols, rows }) => {
      send({ type: 'resize', cols, rows });
    });

    resizeObserver = new ResizeObserver(() => {
      try {
        fit.fit();
      } catch {
        // host may be hidden
      }
    });
    resizeObserver.observe(host);

    connect();
    void workspaceId;

    return () => {
      disposed = true;
      dataDisposable.dispose();
      resizeDisposable.dispose();
      resizeObserver?.disconnect();
      ws?.close();
      term.dispose();
    };
  }, [sessionId, workspaceId]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col" data-testid="ide-terminal">
      <div ref={hostRef} className="min-h-0 flex-1 px-2 py-2" />
      {status === 'connecting' ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">
          Connecting…
        </div>
      ) : null}
      {status === 'error' ? (
        <div
          className={cn(
            'absolute inset-x-0 bottom-0 border-t bg-destructive/10 px-3 py-2 text-destructive text-xs',
          )}
        >
          {error ?? 'Terminal unavailable'}
        </div>
      ) : null}
    </div>
  );
}
