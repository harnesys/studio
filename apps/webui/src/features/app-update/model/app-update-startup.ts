import { isDesktop } from './app-update';
import { useAppUpdateStore } from './app-update.store';

let started = false;

export function runStartupUpdateCheck(): void {
  if (started || !isDesktop()) {
    return;
  }
  started = true;
  void useAppUpdateStore.getState().loadVersion();
  if (!useAppUpdateStore.getState().autoUpdate) {
    return;
  }
  void useAppUpdateStore.getState().checkNow();
}
