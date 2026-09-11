import type { InstallPluginRequest } from '@harnesys/studio-shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import type { DialogComponentProps } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { DialogFooter } from '@/shared/ui/dialog';
import { FieldGroup } from '@/shared/ui/field';

import {
  emptyInstallPluginFields,
  type InstallPluginFieldsInput,
  type InstallPluginFieldsOutput,
  installPluginFieldsSchema,
  toInstallPluginRequest,
} from '../model/plugin-fields';
import { InstallPluginFields } from './plugin-fields';

export function InstallPluginDialog({ onResolve }: DialogComponentProps<InstallPluginRequest>) {
  const form = useForm<InstallPluginFieldsInput, unknown, InstallPluginFieldsOutput>({
    resolver: zodResolver(installPluginFieldsSchema),
    defaultValues: emptyInstallPluginFields(),
  });

  return (
    <form
      className="flex min-h-0 flex-col gap-4"
      onSubmit={form.handleSubmit((values) => onResolve?.(toInstallPluginRequest(values)))}
    >
      <FieldGroup className="min-h-0 overflow-y-auto">
        <InstallPluginFields control={form.control} />
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onResolve?.()}>
          Cancel
        </Button>
        <Button type="submit">Install</Button>
      </DialogFooter>
    </form>
  );
}
