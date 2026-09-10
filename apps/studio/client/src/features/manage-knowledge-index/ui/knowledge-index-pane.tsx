import type { KnowledgeFileStatus, KnowledgeStats } from '@harnesys/studio-shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import {
  knowledgeFilesQueryKey,
  knowledgeStatsQueryKey,
  watchKnowledgeIndexState,
} from '@/shared/api';
import { useStudioLocation } from '@/shared/config/location';
import { toast } from '@/shared/ui/toast';
import { useKnowledgeIndex } from '../model/use-knowledge-index';
import { KnowledgeFilesPanel } from './knowledge-files-panel';
import { KnowledgeIndexStatus } from './knowledge-index-status';
import { KnowledgeRootsList } from './knowledge-roots-list';
import { KnowledgeSearchSmoke } from './knowledge-search-smoke';
import { KnowledgeSettingsFields } from './knowledge-settings-fields';

export function KnowledgeIndexPane() {
  const { workspaceId } = useStudioLocation();
  const [fileStatus, setFileStatus] = useState<KnowledgeFileStatus>('indexed');
  const {
    settingsQuery,
    rootsQuery,
    statsQuery,
    indexStateQuery,
    filesQuery,
    saveSettings,
    upsertRoot,
    removeRoot,
    reindex,
    cancel,
    invalidateAll,
  } = useKnowledgeIndex(workspaceId ?? undefined, fileStatus);

  const settings = settingsQuery.data;
  const busy = saveSettings.isPending || upsertRoot.isPending || removeRoot.isPending;
  const indexStatus = indexStateQuery.data?.status;
  const prevStatus = useRef(indexStatus);
  const qc = useQueryClient();

  useEffect(() => {
    if (prevStatus.current === 'running' && indexStatus && indexStatus !== 'running') {
      void (async () => {
        await invalidateAll();
        if (!workspaceId) {
          return;
        }
        const stats = qc.getQueryData<KnowledgeStats>(knowledgeStatsQueryKey(workspaceId));
        if (!stats) {
          return;
        }
        const { indexed, skipped, error, pending } = stats.filesByStatus;
        const failed = error > 0;
        toast.add({
          type: failed ? 'warning' : 'success',
          title: failed ? 'Indexing finished with errors' : 'Indexing finished',
          description: `${indexed} indexed · ${skipped} skipped · ${error} error · ${pending} pending`,
        });
      })();
    }
    prevStatus.current = indexStatus;
  }, [indexStatus, invalidateAll, qc, workspaceId]);

  useEffect(() => {
    if (!workspaceId) {
      return;
    }
    return watchKnowledgeIndexState(workspaceId, () => {
      void qc.invalidateQueries({ queryKey: knowledgeStatsQueryKey(workspaceId) });
      void qc.invalidateQueries({ queryKey: knowledgeFilesQueryKey(workspaceId, fileStatus) });
    });
  }, [workspaceId, qc, fileStatus]);

  return (
    <div className="flex flex-col gap-8" data-testid="memory-pane">
      <div className="flex flex-col gap-4">
        <p className="font-medium text-sm">Knowledge index</p>
        {settingsQuery.isPending || !settings ? (
          <p className="text-muted-foreground text-sm">Loading settings…</p>
        ) : (
          <KnowledgeSettingsFields
            workspaceId={workspaceId ?? undefined}
            settings={settings}
            disabled={!workspaceId || busy}
            onPatch={(patch) => saveSettings.mutate(patch)}
          />
        )}
      </div>

      {settings && !settings.entireWorkspace ? (
        <KnowledgeRootsList
          roots={rootsQuery.data ?? []}
          loading={rootsQuery.isPending}
          busy={busy}
          disabled={!workspaceId}
          onUpsert={(body) => upsertRoot.mutate(body)}
          onRemove={(path) => removeRoot.mutate(path)}
        />
      ) : null}

      <KnowledgeIndexStatus
        state={indexStateQuery.data}
        stats={statsQuery.data}
        disabled={!workspaceId}
        reindexPending={reindex.isPending}
        cancelPending={cancel.isPending}
        onReindex={() => reindex.mutate()}
        onCancel={() => cancel.mutate()}
      />

      <KnowledgeFilesPanel
        status={fileStatus}
        onStatusChange={setFileStatus}
        files={filesQuery.data ?? []}
        counts={statsQuery.data?.filesByStatus}
        loading={filesQuery.isPending}
      />

      <KnowledgeSearchSmoke workspaceId={workspaceId ?? undefined} />
    </div>
  );
}
