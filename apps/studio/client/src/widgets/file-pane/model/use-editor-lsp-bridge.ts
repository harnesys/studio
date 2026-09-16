import { useEffect, useState } from 'react';
import {
  attachLspBridge,
  type LspBridge,
  type LspBridgeStatus,
  useLspSessionsStore,
} from '@/features/lsp-bridge';
import { monaco } from '@/shared/lib/monaco';
import { toModelPath } from './editor-setup';

/**
 * Attaches the LSP bridge for the open file and mirrors its status into the
 * per-workspace session registry (surfaced by the editor status bar).
 */
export function useEditorLspBridge(workspaceId: string, path: string | null, languageId: string) {
  const [status, setStatus] = useState<LspBridgeStatus>('off');
  const [pulse, setPulse] = useState(0);

  useEffect(() => {
    if (!path) {
      return;
    }
    let bridge: LspBridge | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    const report = (next: LspBridgeStatus) => {
      setStatus(next);
      useLspSessionsStore.getState().upsert(workspaceId, {
        path,
        languageId,
        status: next,
      });
    };
    const tryAttach = () => {
      attempts += 1;
      const modelPath = toModelPath(path);
      if (monaco.editor.getModel(monaco.Uri.parse(modelPath))) {
        report('starting');
        bridge = attachLspBridge({
          workspaceId,
          path,
          monaco,
          onStatus: report,
          onActivity: () => setPulse((n) => n + 1),
        });
        return;
      }
      if (attempts < 20) {
        retryTimer = setTimeout(tryAttach, 100);
      }
    };
    tryAttach();
    return () => {
      if (retryTimer) {
        clearTimeout(retryTimer);
      }
      bridge?.dispose();
      useLspSessionsStore.getState().remove(workspaceId, path);
      setStatus('off');
    };
  }, [workspaceId, path, languageId]);

  return { status, pulse };
}
