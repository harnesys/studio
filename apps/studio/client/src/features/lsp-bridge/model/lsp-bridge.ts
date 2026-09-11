import type * as monacoNs from 'monaco-editor';
import {
  applyBuiltinDiagnostics,
  applyMarkers,
  captureBuiltinDiagnostics,
  LSP_MARKER_OWNER,
  toLspPosition,
  toMonacoHover,
  toMonacoLocations,
} from './lsp-converters';

export type LspBridgeStatus = 'starting' | 'live' | 'off' | 'error';

export type LspBridge = {
  dispose(): void;
};

export type LspBridgeArgs = {
  workspaceId: string;
  /** Workspace-relative file path, e.g. `src/main.tsx`. */
  path: string;
  monaco: typeof monacoNs;
  onStatus: (status: LspBridgeStatus) => void;
  /** Fires on every diagnostics publish while live (indicator pulse). */
  onActivity?: () => void;
};

const CHANGE_DEBOUNCE_MS = 250;
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Bridges the Monaco model of an open file to the server-side language server
 * (plugin lspServers) over /api/lsp. Server-side diagnostics replace the
 * built-in TS worker for ts/js models while the bridge is live.
 */
export function attachLspBridge(args: LspBridgeArgs): LspBridge {
  const { monaco, onStatus, onActivity, workspaceId, path } = args;
  const modelUri = `file:///${path.replace(/^\/+/, '')}`;
  const model = monaco.editor.getModel(monaco.Uri.parse(modelUri));
  if (!model) {
    return { dispose: () => {} };
  }

  const languageId = model.getLanguageId();
  let status: LspBridgeStatus = 'starting';
  let disposed = false;
  let version = 1;
  let requestSeq = 1;
  let changeTimer: ReturnType<typeof setTimeout> | null = null;
  const pending = new Map<
    string,
    { resolve: (result: unknown) => void; timer: ReturnType<typeof setTimeout> }
  >();

  const setStatus = (next: LspBridgeStatus) => {
    if (status === next) {
      return;
    }
    status = next;
    onStatus(next);
  };
  setStatus('starting');

  const savedDiagnostics = captureBuiltinDiagnostics(monaco, languageId);

  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(
    `${proto}://${location.host}/api/lsp?workspace=${encodeURIComponent(workspaceId)}&path=${encodeURIComponent(path)}`,
  );

  const send = (message: unknown) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  };

  ws.onopen = () => {
    send({
      jsonrpc: '2.0',
      method: 'textDocument/didOpen',
      params: {
        textDocument: { uri: modelUri, languageId, version, text: model.getValue() },
      },
    });
    if (savedDiagnostics) {
      applyBuiltinDiagnostics(monaco, { noSemanticValidation: true, noSyntaxValidation: true });
    }
    setStatus('live');
  };

  ws.onmessage = (event) => {
    if (typeof event.data !== 'string') {
      return;
    }
    let message: { id?: unknown; method?: unknown; params?: unknown; result?: unknown };
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }
    const id = typeof message.id === 'string' ? message.id : undefined;
    if (id && pending.has(id)) {
      const entry = pending.get(id);
      if (entry) {
        clearTimeout(entry.timer);
        pending.delete(id);
        entry.resolve(message.result);
      }
      return;
    }
    if (
      message.method === 'textDocument/publishDiagnostics' &&
      message.params !== null &&
      typeof message.params === 'object'
    ) {
      const params = message.params as { uri?: unknown; diagnostics?: unknown };
      if (params.uri !== modelUri) {
        return;
      }
      applyMarkers(monaco, model, Array.isArray(params.diagnostics) ? params.diagnostics : []);
      setStatus('live');
      onActivity?.();
    }
  };

  ws.onclose = (event) => {
    if (disposed) {
      return;
    }
    if (status === 'live' || event.code !== 1011) {
      setStatus('off');
    } else {
      setStatus('error');
    }
    if (savedDiagnostics) {
      applyBuiltinDiagnostics(monaco, savedDiagnostics);
    }
  };

  const changeSubscription = model.onDidChangeContent(() => {
    if (ws.readyState !== WebSocket.OPEN) {
      return;
    }
    if (changeTimer) {
      clearTimeout(changeTimer);
    }
    changeTimer = setTimeout(() => {
      changeTimer = null;
      version += 1;
      send({
        jsonrpc: '2.0',
        method: 'textDocument/didChange',
        params: {
          textDocument: { uri: modelUri, version },
          contentChanges: [{ text: model.getValue() }],
        },
      });
    }, CHANGE_DEBOUNCE_MS);
  });

  const request = (method: string, params: unknown): Promise<unknown> => {
    if (ws.readyState !== WebSocket.OPEN) {
      return Promise.resolve(null);
    }
    const id = `e${requestSeq}`;
    requestSeq += 1;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        resolve(null);
      }, REQUEST_TIMEOUT_MS);
      pending.set(id, { resolve, timer });
      send({ jsonrpc: '2.0', id, method, params });
    });
  };

  const hoverProvider = monaco.languages.registerHoverProvider(languageId, {
    provideHover: async (_target, position) => {
      const result = await request('textDocument/hover', {
        textDocument: { uri: modelUri },
        position: toLspPosition(position),
      });
      return toMonacoHover(result);
    },
  });

  const definitionProvider = monaco.languages.registerDefinitionProvider(languageId, {
    provideDefinition: async (_target, position) => {
      const result = await request('textDocument/definition', {
        textDocument: { uri: modelUri },
        position: toLspPosition(position),
      });
      return toMonacoLocations(result, monaco);
    },
  });

  return {
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      if (changeTimer) {
        clearTimeout(changeTimer);
      }
      for (const entry of pending.values()) {
        clearTimeout(entry.timer);
      }
      pending.clear();
      changeSubscription.dispose();
      hoverProvider.dispose();
      definitionProvider.dispose();
      if (savedDiagnostics) {
        applyBuiltinDiagnostics(monaco, savedDiagnostics);
      }
      monaco.editor.setModelMarkers(model, LSP_MARKER_OWNER, []);
      ws.close();
    },
  };
}
