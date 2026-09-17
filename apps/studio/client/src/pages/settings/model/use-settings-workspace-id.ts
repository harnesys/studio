import { useSelectedWorkspaceIds } from '@/features/desk';

/** Phase 1 mixed nav: domain settings panes use the first selected workspace. */
export function useSettingsWorkspaceId(): string | null {
  const ids = useSelectedWorkspaceIds();
  return ids[0] ?? null;
}
