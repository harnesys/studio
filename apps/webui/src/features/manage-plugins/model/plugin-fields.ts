import type { InstallPluginRequest } from '@harnesys/studio-shared';
import { z } from 'zod';

export const installPluginFieldsSchema = z.object({
  source: z.string().trim().min(1, 'Source required'),
  path: z.string().trim(),
  ref: z.string().trim(),
});

export type InstallPluginFieldsInput = z.input<typeof installPluginFieldsSchema>;
export type InstallPluginFieldsOutput = z.output<typeof installPluginFieldsSchema>;

export function emptyInstallPluginFields(): InstallPluginFieldsInput {
  return {
    source: '',
    path: '',
    ref: '',
  };
}

export function toInstallPluginRequest(values: InstallPluginFieldsOutput): InstallPluginRequest {
  return {
    source: values.source,
    ...(values.path ? { path: values.path } : {}),
    ...(values.ref ? { ref: values.ref } : {}),
  };
}

export const addRegistryFieldsSchema = z.object({
  source: z.string().trim().min(1, 'Source required'),
});

export type AddRegistryFieldsInput = z.input<typeof addRegistryFieldsSchema>;
export type AddRegistryFieldsOutput = z.output<typeof addRegistryFieldsSchema>;

export function emptyAddRegistryFields(): AddRegistryFieldsInput {
  return { source: '' };
}
