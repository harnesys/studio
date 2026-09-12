import type { ModeOpPermissions, ModePreset } from '@harnesys/studio-shared';
import { queryOptions } from '@tanstack/react-query';

import { apiJson } from './client';

export type ModePresetRecord = ModePreset;

export type ModePresetBody = {
  id: string;
  name: string;
  description?: string;
  instructions?: string;
  skills?: string[];
  packs?: string[];
  permissions?: ModeOpPermissions;
  installedByDefault?: boolean;
};

export type ModePresetPatch = Partial<Omit<ModePresetBody, 'id'>>;

export const modePresetsQueryKey = ['mode-presets'] as const;

export function listModePresets() {
  return apiJson<ModePresetRecord[]>('/api/mode-presets');
}

export const modePresetsQuery = queryOptions({
  queryKey: modePresetsQueryKey,
  queryFn: listModePresets,
});

export function createModePreset(body: ModePresetBody): Promise<ModePresetRecord> {
  return apiJson<ModePresetRecord>('/api/mode-presets', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updateModePreset(id: string, body: ModePresetPatch): Promise<ModePresetRecord> {
  return apiJson<ModePresetRecord>(`/api/mode-presets/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function deleteModePreset(id: string): Promise<void> {
  return apiJson<void>(`/api/mode-presets/${id}`, {
    method: 'DELETE',
  });
}
