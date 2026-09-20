import { toast } from '@/shared/ui/toast';
import { isDesktop } from './app-update';
import { useAppUpdateStore } from './app-update.store';

let started = false;

export function runStartupUpdateCheck(openUpdateSettings: () => void): void {
  if (started || !isDesktop()) {
    return;
  }
  started = true;
  void run();
  async function run() {
    const store = useAppUpdateStore.getState();
    void store.loadVersion();
    const available = await store.checkNow();
    if (!available) {
      return;
    }
    const { autoUpdate, availableVersion, download } = useAppUpdateStore.getState();
    if (!autoUpdate) {
      toast.add({
        title: `Harnesys ${availableVersion} is available`,
        description: 'Open Update settings to install.',
        actionProps: { children: 'Open', onClick: openUpdateSettings },
      });
      return;
    }
    await download();
    if (useAppUpdateStore.getState().status !== 'ready') {
      return;
    }
    toast.add({
      title: `Harnesys ${availableVersion} is ready`,
      description: 'Restart the app to apply the update.',
      actionProps: {
        children: 'Restart',
        onClick: () => void useAppUpdateStore.getState().restart(),
      },
    });
  }
}
