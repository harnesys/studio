import type { ModeOpPermissions, ModePreset, PackAssignment } from '@harnesys/studio-shared';
import { queryOptions } from '@tanstack/react-query';

import { apiJson } from './client';

export type ModePresetRecord = ModePreset;

export type ModePresetBody = {
  id: string;
  name: string;
  description?: string;
  instructions?: string;
  skills?: string[];
  packs?: Record<string, PackAssignment | null>;
  permissions?: ModeOpPermissions;
  installedByDefault?: boolean;
};

export type ModePresetPatch = Partial<Omit<ModePresetBody, 'id'>>;

export const modePresetsQueryKey = ['mode-presets'] as const;

export function modePresetsQueryKeyFor(workspaceId: string) {
  return [...modePresetsQueryKey, workspaceId] as const;
}

function modePresetsBase(workspaceId: string) {
  return `/api/workspaces/${encodeURIComponent(workspaceId)}/mode-presets`;
}

export function listModePresets(workspaceId: string) {
  return apiJson<ModePresetRecord[]>(modePresetsBase(workspaceId));
}

export function modePresetsQuery(workspaceId: string) {
  return queryOptions({
    queryKey: modePresetsQueryKeyFor(workspaceId),
    queryFn: () => listModePresets(workspaceId),
    enabled: Boolean(workspaceId),
  });
}

export function createModePreset(
  workspaceId: string,
  body: ModePresetBody,
): Promise<ModePresetRecord> {
  return apiJson<ModePresetRecord>(modePresetsBase(workspaceId), {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updateModePreset(
  workspaceId: string,
  id: string,
  body: ModePresetPatch,
): Promise<ModePresetRecord> {
  return apiJson<ModePresetRecord>(`${modePresetsBase(workspaceId)}/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function deleteModePreset(workspaceId: string, id: string): Promise<void> {
  return apiJson<void>(`${modePresetsBase(workspaceId)}/${id}`, {
    method: 'DELETE',
  });
}
