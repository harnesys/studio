import type {
  AddPluginRegistryRequest,
  InstallPluginRequest,
  PluginMutationResponse,
  PluginRegistrySummary,
} from '@harnesys/studio-shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { addPluginRegistry, installPlugin } from '@/shared/api';
import type { DialogComponentProps } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { DialogFooter } from '@/shared/ui/dialog';
import { FieldGroup } from '@/shared/ui/field';

import {
  type AddRegistryFieldsInput,
  type AddRegistryFieldsOutput,
  addRegistryFieldsSchema,
  emptyAddRegistryFields,
  emptyInstallPluginFields,
  type InstallPluginFieldsInput,
  type InstallPluginFieldsOutput,
  installPluginFieldsSchema,
  toInstallPluginRequest,
} from '../model/plugin-fields';
import { AddRegistryFields, InstallPluginFields } from './plugin-fields';

const INSTALL_STAGES = ['resolving', 'cloning', 'loading', 'saving'] as const;

export function InstallPluginDialog({
  onResolve,
  data,
}: DialogComponentProps<
  PluginMutationResponse,
  { workspaceId: string; prefill?: InstallPluginRequest } | undefined
>) {
  const workspaceId = data?.workspaceId ?? '';
  const prefill = data?.prefill;
  const form = useForm<InstallPluginFieldsInput, unknown, InstallPluginFieldsOutput>({
    resolver: zodResolver(installPluginFieldsSchema),
    defaultValues: {
      ...emptyInstallPluginFields(),
      source: prefill?.source ?? '',
      path: prefill?.path ?? '',
      ref: prefill?.ref ?? '',
    },
  });
  const [stage, setStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = stage !== null && error === null;

  async function runInstall(values: InstallPluginFieldsOutput) {
    if (!workspaceId) {
      setError('No workspace');
      return;
    }
    setError(null);
    setStage('resolving');
    try {
      setStage('cloning');
      const result = await installPlugin(workspaceId, toInstallPluginRequest(values));
      setStage('done');
      onResolve?.(result);
    } catch (err) {
      setStage(null);
      setError(err instanceof Error ? err.message : 'Install failed');
    }
  }

  return (
    <form
      className="flex min-h-0 flex-col gap-4"
      onSubmit={form.handleSubmit((values) => {
        void runInstall(values);
      })}
    >
      <FieldGroup className="min-h-0 overflow-y-auto">
        <InstallPluginFields control={form.control} />
        {stage ? (
          <p className="text-muted-foreground text-sm" data-testid="install-plugin-stage">
            {stageLabel(stage)}
          </p>
        ) : null}
        {error ? (
          <p className="text-destructive text-sm" data-testid="install-plugin-error">
            {error}
          </p>
        ) : null}
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="outline" disabled={busy} onClick={() => onResolve?.()}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? 'Installing…' : 'Install'}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function InstallCatalogPluginDialog({
  onResolve,
  data,
}: DialogComponentProps<
  PluginMutationResponse,
  { workspaceId: string; registryId: string; pluginName: string }
>) {
  const [stage, setStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);

  async function runInstall() {
    if (!data?.workspaceId) {
      return;
    }
    setStarted(true);
    setError(null);
    setStage('cloning');
    try {
      const result = await installPlugin(data.workspaceId, {
        registryId: data.registryId,
        pluginName: data.pluginName,
      });
      setStage('done');
      onResolve?.(result);
    } catch (err) {
      setStage(null);
      setError(err instanceof Error ? err.message : 'Install failed');
    }
  }

  if (!started) {
    return (
      <div className="flex min-h-0 flex-col gap-4">
        <p className="text-sm">
          Install <span className="font-mono">{data?.pluginName}</span> from marketplace?
        </p>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onResolve?.()}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void runInstall()}>
            Install
          </Button>
        </DialogFooter>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-col gap-4">
      <p className="text-muted-foreground text-sm" data-testid="install-catalog-stage">
        {stage ? stageLabel(stage) : 'Failed'}
      </p>
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onResolve?.()}>
          {error ? 'Close' : 'Cancel'}
        </Button>
        {error ? (
          <Button type="button" onClick={() => void runInstall()}>
            Retry
          </Button>
        ) : null}
      </DialogFooter>
    </div>
  );
}

export function AddRegistryDialog({
  onResolve,
}: DialogComponentProps<PluginRegistrySummary, undefined>) {
  const form = useForm<AddRegistryFieldsInput, unknown, AddRegistryFieldsOutput>({
    resolver: zodResolver(addRegistryFieldsSchema),
    defaultValues: emptyAddRegistryFields(),
  });
  const [stage, setStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = stage !== null && error === null;

  async function runAdd(values: AddRegistryFieldsOutput) {
    setError(null);
    setStage('fetching catalog');
    try {
      const body: AddPluginRegistryRequest = { source: values.source };
      const registry = await addPluginRegistry(body);
      setStage('done');
      onResolve?.(registry);
    } catch (err) {
      setStage(null);
      setError(err instanceof Error ? err.message : 'Add marketplace failed');
    }
  }

  return (
    <form
      className="flex min-h-0 flex-col gap-4"
      onSubmit={form.handleSubmit((values) => {
        void runAdd(values);
      })}
    >
      <FieldGroup className="min-h-0 overflow-y-auto">
        <AddRegistryFields control={form.control} />
        {stage ? <p className="text-muted-foreground text-sm">{stageLabel(stage)}</p> : null}
        {error ? <p className="text-destructive text-sm">{error}</p> : null}
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="outline" disabled={busy} onClick={() => onResolve?.()}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? 'Adding…' : 'Add'}
        </Button>
      </DialogFooter>
    </form>
  );
}

function stageLabel(stage: string): string {
  if (stage === 'resolving') {
    return 'Resolving source…';
  }
  if (stage === 'cloning') {
    return 'Cloning repository…';
  }
  if (stage === 'loading') {
    return 'Loading plugin…';
  }
  if (stage === 'saving') {
    return 'Saving…';
  }
  if (stage === 'fetching catalog') {
    return 'Fetching marketplace catalog…';
  }
  if (stage === 'done') {
    return 'Done';
  }
  return stage;
}

void INSTALL_STAGES;
