import { ExternalLinkIcon } from 'lucide-react';
import { useEffect } from 'react';
import { isDesktop, openReleaseNotes, releaseUrl, useAppUpdateStore } from '@/features/app-update';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/shared/ui/field';
import { Markdown } from '@/shared/ui/markdown';
import { Progress } from '@/shared/ui/progress';
import { Switch } from '@/shared/ui/switch';

export function UpdatePane() {
  const status = useAppUpdateStore((state) => state.status);
  const currentVersion = useAppUpdateStore((state) => state.currentVersion);
  const availableVersion = useAppUpdateStore((state) => state.availableVersion);
  const notes = useAppUpdateStore((state) => state.notes);
  const progress = useAppUpdateStore((state) => state.progress);
  const error = useAppUpdateStore((state) => state.error);
  const autoUpdate = useAppUpdateStore((state) => state.autoUpdate);
  const loadVersion = useAppUpdateStore((state) => state.loadVersion);
  const checkNow = useAppUpdateStore((state) => state.checkNow);
  const download = useAppUpdateStore((state) => state.download);
  const restart = useAppUpdateStore((state) => state.restart);
  const setAutoUpdate = useAppUpdateStore((state) => state.setAutoUpdate);

  useEffect(() => {
    void loadVersion();
  }, [loadVersion]);

  if (!isDesktop()) {
    return null;
  }
  const showUpdateCard =
    availableVersion !== null &&
    (status === 'available' || status === 'downloading' || status === 'ready');
  return (
    <FieldGroup className="gap-6">
      <Field>
        <FieldLabel>Current version</FieldLabel>
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className="font-mono text-xs">
            v{currentVersion ?? '…'}
          </Badge>
          <a
            className="flex items-center gap-1 text-muted-foreground text-sm hover:text-foreground"
            href={releaseUrl(currentVersion)}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => {
              if (!isDesktop()) {
                return;
              }
              event.preventDefault();
              void openReleaseNotes(currentVersion);
            }}
          >
            Release notes
            <ExternalLinkIcon className="size-3" />
          </a>
        </div>
      </Field>
      {showUpdateCard ? (
        <Field data-testid="update-card">
          <div className="flex items-center gap-2">
            <FieldLabel>Harnesys v{availableVersion}</FieldLabel>
            <Badge variant="outline" className="text-[10px]">
              {status === 'ready' ? 'Downloaded' : 'New version'}
            </Badge>
          </div>
          {notes ? (
            <div className="max-h-64 overflow-y-auto rounded-md border bg-muted/30 p-3">
              <Markdown text={notes} className="text-sm" />
            </div>
          ) : null}
          {status === 'downloading' ? (
            <Progress value={progress === null ? null : Math.round(progress * 100)} />
          ) : null}
          <UpdateCardFooter status={status} onDownload={download} onRestart={restart} />
        </Field>
      ) : null}
      <Field>
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-col gap-1">
            <FieldLabel htmlFor="auto-update">Auto update</FieldLabel>
            <FieldDescription>
              Check for updates on startup. Installing always asks first.
            </FieldDescription>
          </div>
          <Switch
            id="auto-update"
            checked={autoUpdate}
            onCheckedChange={(checked) => setAutoUpdate(checked)}
            data-testid="auto-update"
          />
        </div>
      </Field>
      <Field>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            disabled={status === 'checking' || status === 'downloading'}
            onClick={() => void checkNow()}
            data-testid="update-check"
          >
            {status === 'checking' ? 'Checking…' : 'Check for updates'}
          </Button>
          {status === 'up-to-date' ? (
            <FieldDescription data-testid="update-status">
              You are on the latest version.
            </FieldDescription>
          ) : null}
          {status === 'error' ? (
            <FieldDescription className="text-destructive" data-testid="update-status">
              {error}
            </FieldDescription>
          ) : null}
        </div>
      </Field>
    </FieldGroup>
  );
}
function UpdateCardFooter({
  status,
  onDownload,
  onRestart,
}: {
  status: 'available' | 'downloading' | 'ready';
  onDownload: () => Promise<void>;
  onRestart: () => Promise<void>;
}) {
  if (status === 'ready') {
    return (
      <div className="flex items-center gap-3">
        <Button onClick={() => void onRestart()} data-testid="update-restart">
          Restart to update
        </Button>
        <FieldDescription>The update is installed and applies on restart.</FieldDescription>
      </div>
    );
  }
  if (status === 'downloading') {
    return null;
  }
  return (
    <div>
      <Button onClick={() => void onDownload()} data-testid="update-install">
        Update
      </Button>
    </div>
  );
}
