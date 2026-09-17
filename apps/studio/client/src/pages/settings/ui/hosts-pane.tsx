import { useEffect, useState } from 'react';

import {
  hostStatusLabel,
  LOCAL_HOST,
  LOCAL_HOST_ID,
  type StudioHost,
  useStudioHostsStore,
} from '@/features/create-workspace';
import { getHostOnlineStatus } from '@/shared/api/host-router';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { FieldDescription } from '@/shared/ui/field';

/** Window host registry: status + revoke local copy (does not wipe remote). */
export function HostsPane() {
  const syncFromWindowHosts = useStudioHostsStore((state) => state.syncFromWindowHosts);
  const revokeHost = useStudioHostsStore((state) => state.revokeHost);
  const remotes = useStudioHostsStore((state) => state.remotes);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    syncFromWindowHosts();
  }, [syncFromWindowHosts]);

  const local: StudioHost = {
    ...LOCAL_HOST,
    status: getHostOnlineStatus(LOCAL_HOST_ID),
  };
  const hosts = [local, ...remotes];

  return (
    <div className="flex flex-col gap-4" data-testid="settings-hosts-pane">
      <FieldDescription>
        Paired hosts for this window. Revoke removes the local credential copy only.
      </FieldDescription>
      <ul className="flex flex-col gap-2">
        {hosts.map((host) => (
          <li
            key={host.id}
            className="flex items-center gap-3 rounded-lg border border-border/60 px-3 py-2"
            data-testid={`settings-host-${host.id}`}
          >
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium text-sm">{host.name}</div>
              <div className="truncate font-mono text-[11px] text-muted-foreground">
                {host.baseUrl || host.address || 'local'}
              </div>
            </div>
            <Badge variant="secondary">{hostStatusLabel(host)}</Badge>
            {host.id !== LOCAL_HOST_ID ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busyId === host.id}
                onClick={() => {
                  setBusyId(host.id);
                  setError(null);
                  void revokeHost(host.id)
                    .catch((cause: unknown) => {
                      setError(cause instanceof Error ? cause.message : 'Revoke failed');
                    })
                    .finally(() => setBusyId(null));
                }}
              >
                Revoke
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
    </div>
  );
}
