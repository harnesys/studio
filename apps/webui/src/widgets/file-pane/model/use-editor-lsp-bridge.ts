import { useCallback, useEffect, useState } from 'react';
import {
  attachLspBridge,
  type LspBridge,
  type LspBridgeStatus,
  restartLspForPath,
  useLspSessionsStore,
} from '@/features/lsp-bridge';
import { monaco } from '@/shared/lib/monaco';
import { toModelPath } from './editor-setup';
export function useEditorLspBridge(workspaceId: string, path: string | null, languageId: string) {
  const [status, setStatus] = useState<LspBridgeStatus>('off');
  const [pulse, setPulse] = useState(0);
  const [attachEpoch, setAttachEpoch] = useState(0);
  useEffect(() => {
    void attachEpoch;
    if (!path) {
      return;
    }
    let bridge: LspBridge | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    const report = (next: LspBridgeStatus, message?: string) => {
      setStatus(next);
      useLspSessionsStore.getState().upsert(workspaceId, {
        path,
        languageId,
        status: next,
        message,
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
  }, [workspaceId, path, languageId, attachEpoch]);
  const restartFileServer = useCallback(() => {
    if (!path) {
      return;
    }
    void restartLspForPath(workspaceId, path)
      .then(() => setAttachEpoch((n) => n + 1))
      .catch(() => {});
  }, [workspaceId, path]);
  return { status, pulse, restartFileServer };
}
