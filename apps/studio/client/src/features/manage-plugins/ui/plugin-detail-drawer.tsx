import type {
  GrantClass,
  PluginListItem,
  PluginOptionValue,
  PluginSummary,
} from '@harnesys/studio-shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import {
  approvePluginServer,
  pluginsQueryKey,
  setPluginGrants,
  setPluginOption,
} from '@/shared/api';
import type { DialogComponentProps } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { toast } from '@/shared/ui/toast';

import { grantedClasses } from '../model/plugin-grants';
import {
  changedOptionValues,
  optionDrafts,
  type PluginOptionDraft,
  patchOptionDraft,
} from '../model/plugin-options';
import { PluginComponentMatrix } from './plugin-component-matrix';
import { PluginGrantCheckboxes } from './plugin-grant-fields';
import { PluginOptionsFields } from './plugin-options-fields';

type DrawerData = { item: PluginListItem; workspaceId: string };

const SERVER_APPROVAL_REASON = 'needs_server_approval';
const MCP_SERVER_KIND = 'mcp-server';

export function PluginDetailDrawer({ onResolve, data }: DialogComponentProps<void, DrawerData>) {
  const item = data?.item;
  const workspaceId = data?.workspaceId ?? '';
  const plugin = item?.plugin;
  const queryClient = useQueryClient();
  const [grants, setGrants] = useState(() => plugin?.grants[workspaceId] ?? {});
  const [drafts, setDrafts] = useState<PluginOptionDraft[]>(() =>
    plugin ? optionDrafts(plugin) : [],
  );

  const grantsMutation = useMutation({
    mutationFn: (classes: GrantClass[]) => {
      if (!plugin || !workspaceId) {
        throw new Error('No workspace');
      }
      return setPluginGrants(workspaceId, plugin.name, { classes });
    },
    onSuccess: async (_result, classes) => {
      await queryClient.invalidateQueries({ queryKey: pluginsQueryKey });
      toast.add({
        title: 'Grants saved',
        description: classes.length > 0 ? classes.join(', ') : 'none',
      });
    },
    onError: (error) => {
      toast.add({
        title: 'Grants not saved',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });

  const approveMutation = useMutation({
    mutationFn: (serverId: string) => {
      if (!plugin) {
        throw new Error('No plugin');
      }
      return approvePluginServer(plugin.name, { serverId });
    },
    onSuccess: async (_result, serverId) => {
      await queryClient.invalidateQueries({ queryKey: pluginsQueryKey });
      toast.add({ title: 'Server approved', description: serverId });
    },
    onError: (error) => {
      toast.add({
        title: 'Approval failed',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });

  const optionsMutation = useMutation({
    mutationFn: (changes: { key: string; value: PluginOptionValue }[]) => {
      if (!plugin || !workspaceId) {
        throw new Error('No workspace');
      }
      return Promise.all(
        changes.map((change) => setPluginOption(workspaceId, plugin.name, change)),
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: pluginsQueryKey });
      setDrafts((current) =>
        current.map((draft) =>
          draft.sensitive ? { ...draft, value: '' } : { ...draft, current: draft.value },
        ),
      );
      toast.add({ title: 'Options saved' });
    },
    onError: (error) => {
      toast.add({
        title: 'Options not saved',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });

  const busy = grantsMutation.isPending || approveMutation.isPending || optionsMutation.isPending;

  if (!item || !plugin) {
    return null;
  }

  return (
    <div
      className="flex min-h-0 flex-col gap-4 overflow-y-auto"
      data-testid="plugin-detail-drawer-body"
    >
      <DetailBlock
        label="Inventory"
        items={[
          `${plugin.skillCount} skills · ${plugin.hookCount} hooks · ${plugin.mcpServerCount} mcp · ${plugin.agentCount} agents · ${plugin.commandCount} commands`,
        ]}
      />
      <section className="flex flex-col gap-1">
        <p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
          Components
        </p>
        <PluginComponentMatrix
          components={plugin.components}
          renderAction={(component) =>
            needsApproval(component) ? (
              <Button
                type="button"
                variant="outline"
                size="xs"
                disabled={busy}
                onClick={() => approveMutation.mutate(component.source.pointer)}
              >
                Approve
              </Button>
            ) : null
          }
        />
      </section>
      {workspaceId ? (
        <section className="flex flex-col gap-1">
          <p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
            Grants
          </p>
          <PluginGrantCheckboxes
            selection={grants}
            disabled={busy}
            onChange={(next) => {
              setGrants(next);
              grantsMutation.mutate(grantedClasses(next));
            }}
          />
        </section>
      ) : null}
      {drafts.length > 0 ? (
        <section className="flex flex-col gap-1">
          <p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
            Settings
          </p>
          <PluginOptionsFields
            drafts={drafts}
            onChange={(key, value) => setDrafts((current) => patchOptionDraft(current, key, value))}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            disabled={busy}
            onClick={() => optionsMutation.mutate(changedOptionValues(drafts))}
          >
            Save options
          </Button>
        </section>
      ) : null}
      <DetailBlock label="Source" items={sourceLines(plugin)} />
      <DetailBlock label="Diagnostics" items={diagnosticLines(item)} emptyText="No diagnostics." />
      <div className="flex justify-end">
        <Button type="button" variant="outline" size="sm" onClick={() => onResolve?.()}>
          Close
        </Button>
      </div>
    </div>
  );
}

function needsApproval(component: { kind: string; status: string; inertReason?: string }): boolean {
  return (
    component.kind === MCP_SERVER_KIND &&
    component.status === 'blocked_by_grant' &&
    component.inertReason === SERVER_APPROVAL_REASON
  );
}

function DetailBlock({
  label,
  items,
  emptyText = 'None.',
}: {
  label: string;
  items: string[];
  emptyText?: string;
}) {
  const visible = items.filter((item) => item !== '');
  return (
    <div className="flex flex-col gap-0.5">
      <p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
        {label}
      </p>
      {visible.length === 0 ? (
        <p className="text-muted-foreground text-xs">{emptyText}</p>
      ) : (
        visible.map((entry) => (
          <p key={entry} className="wrap-anywhere text-muted-foreground text-xs">
            {entry}
          </p>
        ))
      )}
    </div>
  );
}

function sourceLines(plugin: PluginSummary): string[] {
  return [
    plugin.source,
    plugin.revision ? `revision ${plugin.revision.slice(0, 12)}` : 'revision unknown',
    ...(plugin.registryId ? [`registry ${plugin.registryId}`] : []),
  ];
}

function diagnosticLines(item: PluginListItem): string[] {
  return item.diagnostics.map(
    (diagnostic) =>
      `${diagnostic.level}: ${diagnostic.code} — ${diagnostic.message}${diagnostic.path ? ` · ${diagnostic.path}` : ''}`,
  );
}
