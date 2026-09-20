import { useCallback, useEffect } from 'react';
import { runStartupUpdateCheck } from '@/features/app-update';
import { useStudioNavigation } from '@/shared/config/navigation';

export function AppUpdateCheck() {
  const { openSettings } = useStudioNavigation();
  const openUpdateSettings = useCallback(() => openSettings('update'), [openSettings]);
  useEffect(() => {
    runStartupUpdateCheck(openUpdateSettings);
  }, [openUpdateSettings]);
  return null;
}
