import type { WorkspaceLspEntry } from '@harnesys/studio-shared';
import { FileCode2Icon, PauseIcon, PlayIcon, RotateCwIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/shared/ui/button';
import {
  Row,
  RowChip,
  RowField,
  RowHeader,
  RowList,
  RowSection,
} from '@/shared/ui/capability-rows';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/shared/ui/empty';
import type { StatusDotTone } from '@/shared/ui/status-dot';
import { Textarea } from '@/shared/ui/textarea';
import { toast } from '@/shared/ui/toast';
import { useWorkspaceLsp } from '../model/use-workspace-lsp';

const PRESET_HINTS: {
  lang: string;
  hint: string;
}[] = [
  { lang: 'python', hint: 'pipx install pyright && npm i -g pyright (preset not yet)' },
  { lang: 'rust', hint: 'rustup component add rust-analyzer (preset not yet)' },
  { lang: 'go', hint: 'go install golang.org/x/tools/gopls@latest (preset not yet)' },
];
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}
function statusOf(server: WorkspaceLspEntry): {
  tone: StatusDotTone;
  label: string;
} {
  if (server.disabled) {
    return { tone: 'off', label: 'Disabled' };
  }
  if (server.status === 'live') {
    return { tone: 'live', label: 'Live' };
  }
  if (server.status === 'error') {
    return { tone: 'danger', label: 'Error' };
  }
  return { tone: 'off', label: 'Off' };
}
function extensionList(server: WorkspaceLspEntry): string {
  const exts = Object.keys(server.extensionToLanguage);
  return exts.length > 0 ? exts.join(', ') : 'no extensions';
}
type ServerAction = 'restart' | 'stop' | 'enable';
export function LspPane({ workspaceId }: { workspaceId: string }) {
  const { data, isPending, error, restart, stop, enable, saveRaw, applyPreset } =
    useWorkspaceLsp(workspaceId);
  const servers = data?.servers ?? [];
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [raw, setRaw] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [presetBusy, setPresetBusy] = useState(false);
  async function runServerAction(serverId: string, action: ServerAction) {
    const titles: Record<ServerAction, [string, string]> = {
      restart: ['LSP server restarted', 'Restart failed'],
      stop: ['LSP server stopped', 'Stop failed'],
      enable: ['LSP server enabled', 'Enable failed'],
    };
    setBusyId(serverId);
    try {
      if (action === 'restart') {
        await restart(serverId);
      } else if (action === 'stop') {
        await stop(serverId);
      } else {
        await enable(serverId);
      }
      toast.add({ title: titles[action][0], description: serverId });
    } catch (actionError) {
      toast.add({ title: titles[action][1], description: errorMessage(actionError) });
    } finally {
      setBusyId(null);
    }
  }
  async function handleSaveRaw() {
    setSaving(true);
    try {
      await saveRaw(raw);
      toast.add({ title: 'LSP config saved' });
    } catch (saveError) {
      toast.add({ title: 'Save failed', description: errorMessage(saveError) });
    } finally {
      setSaving(false);
    }
  }
  async function handlePreset() {
    setPresetBusy(true);
    try {
      await applyPreset('typescript');
      toast.add({ title: 'TypeScript preset applied', description: 'typescript' });
    } catch (presetError) {
      toast.add({ title: 'Preset failed', description: errorMessage(presetError) });
    } finally {
      setPresetBusy(false);
    }
  }
  return (
    <div className="flex flex-col gap-2" data-testid="lsp-pane">
      <RowHeader
        label="Servers"
        count={isPending ? undefined : servers.length}
        description="Merged view: `.harnesys/lsp.json` first, then plugin servers."
      />

      {isPending && <p className="text-muted-foreground text-sm">Loading LSP servers…</p>}
      {!isPending && error && <p className="text-destructive text-sm">{error}</p>}
      {!isPending && !error && (data?.diagnostics?.length ?? 0) > 0 && (
        <div className="flex flex-col gap-1 rounded-md border border-destructive/40 bg-destructive/5 px-2 py-1.5">
          {data?.diagnostics.map((diagnostic) => (
            <p
              key={`${diagnostic.code}:${diagnostic.message}`}
              className="text-destructive text-xs"
            >
              {diagnostic.path ? `${diagnostic.path}: ` : ''}
              {diagnostic.message}
            </p>
          ))}
        </div>
      )}
      {!isPending && !error && servers.length === 0 && (
        <Empty className="min-h-0 border-0 py-8">
          <EmptyHeader>
            <EmptyTitle>No LSP servers</EmptyTitle>
            <EmptyDescription>
              No servers in `.harnesys/lsp.json` and no plugin declares one. Apply the TypeScript
              preset below to add one.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
      {!isPending && !error && servers.length > 0 && (
        <RowList>
          {servers.map((server) => (
            <Row
              key={server.serverId}
              testId={`lsp-server-${server.serverId}`}
              title={server.serverId}
              muted={server.disabled}
              meta={server.command}
              status={statusOf(server)}
              chips={
                <RowChip tone={server.origin === 'file' ? 'accent' : 'neutral'}>
                  {server.origin === 'file' ? (
                    <>
                      <FileCode2Icon className="size-2.5" />
                      file
                    </>
                  ) : (
                    server.origin
                  )}
                </RowChip>
              }
              summary={extensionList(server)}
              onToggle={() =>
                setExpandedId((current) => (current === server.serverId ? null : server.serverId))
              }
              expanded={expandedId === server.serverId}
              alwaysShowActions
              actions={
                <>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Restart ${server.serverId}`}
                    title="Restart"
                    disabled={busyId !== null}
                    onClick={() => void runServerAction(server.serverId, 'restart')}
                  >
                    <RotateCwIcon />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={
                      server.disabled ? `Enable ${server.serverId}` : `Stop ${server.serverId}`
                    }
                    title={server.disabled ? 'Enable' : 'Stop'}
                    disabled={busyId !== null}
                    onClick={() =>
                      void runServerAction(server.serverId, server.disabled ? 'enable' : 'stop')
                    }
                  >
                    {server.disabled ? <PlayIcon /> : <PauseIcon />}
                  </Button>
                </>
              }
            >
              <RowSection label="Server">
                <RowField
                  label="Command"
                  value={[server.command, ...(server.args ?? [])].filter(Boolean).join(' ')}
                />
                <RowField label="Extensions" value={extensionList(server)} />
                <RowField label="Origin" value={server.origin} />
                <RowField label="Disabled" value={server.disabled ? 'true' : 'false'} />
                <RowField label="Granted" value={server.granted ? 'true' : 'false'} />
                <RowField label="Binary found" value={server.binaryOk ? 'true' : 'false'} />
                {server.lastError !== undefined && (
                  <p className="text-destructive text-xs">{server.lastError}</p>
                )}
                {!server.binaryOk && server.lastError === undefined && (
                  <p className="text-muted-foreground text-xs">
                    Install hint: npm i -g typescript-language-server typescript
                  </p>
                )}
                {server.status === 'error' && server.binaryOk && (
                  <p className="text-muted-foreground text-xs">
                    Server configured but not ready. Restart from this row, or ensure `typescript`
                    is installed in the workspace (or rely on Studio host fallback).
                  </p>
                )}
              </RowSection>
            </Row>
          ))}
        </RowList>
      )}

      <RowHeader
        label="Raw config"
        description="JSON body of `.harnesys/lsp.json`, written with PUT."
      />
      <Textarea
        aria-label="Raw LSP config JSON"
        className="h-28 font-mono text-xs leading-relaxed"
        placeholder='{"servers": {"typescript": {"command": "typescript-language-server"}}}'
        value={raw}
        onChange={(event) => setRaw(event.target.value)}
      />
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          disabled={!workspaceId || saving || raw.trim().length === 0}
          onClick={() => void handleSaveRaw()}
        >
          Save
        </Button>
      </div>

      <RowHeader label="Presets" description="One-click servers for common languages." />
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!workspaceId || presetBusy}
            onClick={() => void handlePreset()}
          >
            TypeScript: Apply
          </Button>
          <span className="font-mono text-[11px] text-muted-foreground">
            npm i -g typescript-language-server typescript
          </span>
        </div>
        {PRESET_HINTS.map((preset) => (
          <div key={preset.lang} className="flex items-center gap-2 opacity-60">
            <Button variant="outline" size="sm" disabled>
              {preset.lang}: soon
            </Button>
            <span className="font-mono text-[11px] text-muted-foreground">{preset.hint}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
