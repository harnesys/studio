import { useEffect } from 'react';
import { AppUpdateToaster, runStartupUpdateCheck } from '@/features/app-update';

export function AppUpdateCheck() {
  useEffect(() => {
    runStartupUpdateCheck();
  }, []);
  return <AppUpdateToaster />;
}
