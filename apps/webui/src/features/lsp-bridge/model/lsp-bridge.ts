import type { WorkspaceLspListResponse } from '@harnesys/studio-shared';
import type * as monacoNs from 'monaco-editor';
import { apiJson } from '@/shared/api/client';
import { hostTokenQuery } from '@/shared/api/host-credential';
import { hostWsBase } from '@/shared/config/env';
import {
  applyBuiltinDiagnostics,
  applyMarkers,
  captureBuiltinDiagnostics,
  LSP_MARKER_OWNER,
  toLspPosition,
  toMonacoHover,
  toMonacoLocations,
} from './lsp-converters';
import { findServersForPath } from './lsp-restart';
export type LspBridgeStatus = 'starting' | 'live' | 'off' | 'error';
export type LspBridge = {
  dispose(): void;
};
export type LspBridgeArgs = {
  workspaceId: string;
  path: string;
  monaco: typeof monacoNs;
  onStatus: (status: LspBridgeStatus, message?: string) => void;
  onActivity?: () => void;
};
const CHANGE_DEBOUNCE_MS = 250;
const REQUEST_TIMEOUT_MS = 10000;
async function describeServerGap(workspaceId: string, path: string): Promise<string> {
  const list = await apiJson<WorkspaceLspListResponse>(`/api/workspaces/${workspaceId}/lsp`);
  const matches = findServersForPath(list.servers, path);
  if (matches.length === 0) {
    const ext = path.includes('.') ? `.${path.split('.').pop()}` : '(no extension)';
    return `no LSP server for ${ext} — add one to .harnesys/lsp.json or enable a plugin that declares lspServers`;
  }
  const active = matches.find((server) => !server.disabled) ?? matches[0];
  if (active.disabled) {
    return `LSP server "${active.serverId}" is disabled — re-enable it in Settings → LSP`;
  }
  if (!active.granted) {
    return `LSP server "${active.serverId}" from plugin is not granted yet — approve the plugin component`;
  }
  if (!active.binaryOk) {
    return `binary "${active.command}" not found on PATH — install it, then press Restart`;
  }
  return `LSP server "${active.serverId}" refused the connection`;
}
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
    {
      resolve: (result: unknown) => void;
      timer: ReturnType<typeof setTimeout>;
    }
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
  const token = hostTokenQuery();
  const tokenQs = token ? `&${token}` : '';
  const ws = new WebSocket(
    `${hostWsBase()}/api/lsp?workspace=${encodeURIComponent(workspaceId)}&path=${encodeURIComponent(path)}${tokenQs}`,
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
  };
  ws.onmessage = (event) => {
    if (typeof event.data !== 'string') {
      return;
    }
    let message: {
      id?: unknown;
      method?: unknown;
      params?: unknown;
      result?: unknown;
    };
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }
    if (status === 'starting') {
      setStatus('live');
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
      const params = message.params as {
        uri?: unknown;
        diagnostics?: unknown;
      };
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
    if (savedDiagnostics) {
      applyBuiltinDiagnostics(monaco, savedDiagnostics);
    }
    if (event.code === 1011) {
      setStatus('error');
      onStatus('error', event.reason.length > 0 ? event.reason : 'language server failed to start');
      return;
    }
    if (event.code === 1006) {
      setStatus('off');
      onStatus('off', 'connection rejected by host before upgrade');
      void describeServerGap(workspaceId, path)
        .then((detail) => onStatus('off', detail))
        .catch(() => {});
      return;
    }
    setStatus('off');
    onStatus('off');
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
