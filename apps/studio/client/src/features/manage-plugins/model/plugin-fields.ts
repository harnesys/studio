import type { InstallPluginRequest } from '@harnesys/studio-shared';
import { z } from 'zod';

export const installPluginFieldsSchema = z.object({
  source: z.string().trim().min(1, 'Source required'),
  trust: z.boolean(),
});

export type InstallPluginFieldsInput = z.input<typeof installPluginFieldsSchema>;
export type InstallPluginFieldsOutput = z.output<typeof installPluginFieldsSchema>;

export function emptyInstallPluginFields(): InstallPluginFieldsInput {
  return {
    source: '',
    trust: false,
  };
}

export function toInstallPluginRequest(values: InstallPluginFieldsOutput): InstallPluginRequest {
  return {
    source: values.source,
    ...(values.trust ? { trust: true } : {}),
  };
}
