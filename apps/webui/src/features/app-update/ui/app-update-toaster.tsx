import { useEffect } from 'react';
import { toast } from '@/shared/ui/toast';
import { isDesktop } from '../model/app-update';
import { useAppUpdateStore } from '../model/app-update.store';

const TOAST_ID = 'app-update';

export function AppUpdateToaster() {
  const status = useAppUpdateStore((state) => state.status);
  const availableVersion = useAppUpdateStore((state) => state.availableVersion);

  useEffect(() => {
    if (!isDesktop()) {
      return;
    }
    if (status === 'available' && availableVersion) {
      toast.add({
        id: TOAST_ID,
        title: `Harnesys ${availableVersion} is available`,
        description: 'Download and install the update.',
        timeout: 0,
        actionProps: {
          children: 'Update',
          onClick: () => void useAppUpdateStore.getState().download(),
        },
      });
      return;
    }
    if (status === 'downloading') {
      toast.add({
        id: TOAST_ID,
        type: 'loading',
        title: `Downloading Harnesys ${availableVersion ?? ''}…`,
        description: 'The installer launches when the download finishes.',
        timeout: 0,
      });
      return;
    }
    if (status === 'ready' && availableVersion) {
      toast.add({
        id: TOAST_ID,
        type: 'success',
        title: `Harnesys ${availableVersion} is ready`,
        description: 'Restart the app to apply the update.',
        timeout: 0,
        actionProps: {
          children: 'Restart',
          onClick: () => void useAppUpdateStore.getState().restart(),
        },
      });
    }
  }, [status, availableVersion]);

  return null;
}
