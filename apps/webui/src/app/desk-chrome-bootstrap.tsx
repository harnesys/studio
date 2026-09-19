import { useEffect } from 'react';
import { hydrateDeskChrome, setDeskParkReader, setDeskParkWriter } from '@/features/desk';
import { parkToIdeState, useIdeStore } from '@/features/ide';

let bridged = false;

function ensureBridge(): void {
  if (bridged) {
    return;
  }
  bridged = true;
  setDeskParkReader(() => useIdeStore.getState().byWorkspace);
  setDeskParkWriter((park) => {
    useIdeStore.setState({ byWorkspace: parkToIdeState(park) });
  });
}

/** App-level: wire desk ↔ IDE park and load window.desk once. */
export function DeskChromeBootstrap() {
  useEffect(() => {
    ensureBridge();
    void hydrateDeskChrome().catch(() => {});
  }, []);
  return null;
}
