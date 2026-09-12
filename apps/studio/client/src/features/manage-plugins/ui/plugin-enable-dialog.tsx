import type { PluginGrantSelection, PluginSummary } from '@harnesys/studio-shared';
import { useState } from 'react';

import { enableWorkspacePlugin, setPluginGrants, setPluginOption } from '@/shared/api';
import type { DialogComponentProps } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { DialogFooter } from '@/shared/ui/dialog';

import { grantedClasses, requiredGrantClasses } from '../model/plugin-grants';
import {
  changedOptionValues,
  optionDrafts,
  type PluginOptionDraft,
  patchOptionDraft,
} from '../model/plugin-options';
import { PluginComponentMatrix } from './plugin-component-matrix';
import { PluginGrantCheckboxes } from './plugin-grant-fields';
import { PluginOptionsFields } from './plugin-options-fields';

type EnablePluginDialogData = { plugin: PluginSummary; workspaceId: string };

export function EnablePluginDialog({
  onResolve,
  data,
}: DialogComponentProps<PluginSummary, EnablePluginDialogData>) {
  const plugin = data?.plugin;
  const workspaceId = data?.workspaceId ?? '';
  const [grants, setGrants] = useState<PluginGrantSelection>(
    () => plugin?.grants[workspaceId] ?? {},
  );
  const [drafts, setDrafts] = useState<PluginOptionDraft[]>(() =>
    plugin ? optionDrafts(plugin) : [],
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const required = plugin ? requiredGrantClasses(plugin.components) : [];
  const optionChanges = changedOptionValues(drafts);

  async function confirm() {
    if (!plugin || !workspaceId) {
      setError('No workspace');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      for (const change of optionChanges) {
        await setPluginOption(workspaceId, plugin.name, change);
      }
      await setPluginGrants(workspaceId, plugin.name, { classes: grantedClasses(grants) });
      const enabled = await enableWorkspacePlugin(workspaceId, plugin.name, {
        enabled: true,
      });
      onResolve?.(enabled.plugin);
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : 'Enable failed');
    }
  }

  if (!plugin) {
    return null;
  }

  return (
    <div className="flex min-h-0 flex-col gap-4" data-testid="enable-plugin-dialog-body">
      <div className="max-h-48 overflow-y-auto rounded-md border p-2">
        <PluginComponentMatrix components={plugin.components} />
      </div>
      {required.length > 0 ? (
        <p className="text-muted-foreground text-xs">
          Required grant classes: <span className="font-mono">{required.join(', ')}</span>
        </p>
      ) : null}
      <section className="flex flex-col gap-1">
        <p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
          Grants
        </p>
        <PluginGrantCheckboxes selection={grants} disabled={busy} onChange={setGrants} />
      </section>
      {drafts.length > 0 ? (
        <section className="flex flex-col gap-1">
          <p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
            Settings
          </p>
          <PluginOptionsFields
            drafts={drafts}
            onChange={(key, value) => setDrafts((current) => patchOptionDraft(current, key, value))}
          />
        </section>
      ) : null}
      {error ? (
        <p className="text-destructive text-sm" data-testid="enable-plugin-error">
          {error}
        </p>
      ) : null}
      <DialogFooter>
        <Button type="button" variant="outline" disabled={busy} onClick={() => onResolve?.()}>
          Cancel
        </Button>
        <Button type="button" disabled={busy} onClick={() => void confirm()}>
          {busy ? 'Enabling…' : 'Grant and enable'}
        </Button>
      </DialogFooter>
    </div>
  );
}
