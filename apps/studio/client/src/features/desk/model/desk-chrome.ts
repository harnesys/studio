import type { WindowDesk, WindowDeskPark } from '@harnesys/studio-shared';
import { getWindowDesk, putWindowDesk } from '@/shared/api';
import { IDE_WORKSPACES_STORAGE_KEY, WORKSPACE_TABS_STORAGE_KEY } from '@/shared/config/constants';

type SelectionReader = () => string[];
type SelectionWriter = (selectedNodeIds: string[]) => void;
type ParkReader = () => WindowDeskPark;
type ParkWriter = (park: WindowDeskPark) => void;

let selectionReader: SelectionReader = () => [];
let selectionWriter: SelectionWriter = () => {};
let parkReader: ParkReader = () => ({});
let parkWriter: ParkWriter = () => {};
let hydratePromise: Promise<void> | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let ready = false;

export function setDeskSelectionReader(reader: SelectionReader): void {
  selectionReader = reader;
}

export function setDeskSelectionWriter(writer: SelectionWriter): void {
  selectionWriter = writer;
}

export function setDeskParkReader(reader: ParkReader): void {
  parkReader = reader;
}

export function setDeskParkWriter(writer: ParkWriter): void {
  parkWriter = writer;
}

export function hydrateDeskChrome(): Promise<void> {
  if (!hydratePromise) {
    hydratePromise = runHydrate();
  }
  return hydratePromise;
}

export function schedulePersistDeskChrome(): void {
  if (!ready) {
    return;
  }
  if (persistTimer) {
    clearTimeout(persistTimer);
  }
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void flushPersistDeskChrome();
  }, 300);
}

export async function flushPersistDeskChrome(): Promise<void> {
  if (!ready) {
    return;
  }
  const desk = currentDesk();
  try {
    await putWindowDesk(desk);
  } catch {
    // keep local state; next change retries
  }
}

function currentDesk(): WindowDesk {
  return {
    selectedNodeIds: selectionReader().slice(),
    park: parkReader(),
  };
}

async function runHydrate(): Promise<void> {
  let desk: WindowDesk;
  try {
    desk = await getWindowDesk();
  } catch {
    desk = { selectedNodeIds: [], park: {} };
  }

  const remoteHasData = desk.selectedNodeIds.length > 0 || Object.keys(desk.park).length > 0;

  if (!remoteHasData) {
    const migrated = readLocalStorageDesk();
    if (migrated.selectedNodeIds.length > 0 || Object.keys(migrated.park).length > 0) {
      desk = migrated;
      try {
        await putWindowDesk(desk);
        clearLocalStorageDesk();
      } catch {
        // keep LS until a successful PUT
      }
    }
  } else {
    clearLocalStorageDesk();
  }

  selectionWriter(desk.selectedNodeIds);
  parkWriter(desk.park);
  ready = true;
}

function readLocalStorageDesk(): WindowDesk {
  return {
    selectedNodeIds: readSelectedFromLs(),
    park: readParkFromLs(),
  };
}

function clearLocalStorageDesk(): void {
  try {
    localStorage.removeItem(WORKSPACE_TABS_STORAGE_KEY);
    localStorage.removeItem(IDE_WORKSPACES_STORAGE_KEY);
  } catch {
    // private mode
  }
}

function readSelectedFromLs(): string[] {
  try {
    const raw = localStorage.getItem(WORKSPACE_TABS_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((id): id is string => typeof id === 'string');
  } catch {
    return [];
  }
}

function readParkFromLs(): WindowDeskPark {
  try {
    const raw = localStorage.getItem(IDE_WORKSPACES_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !('byWorkspace' in parsed)) {
      return {};
    }
    const byWorkspace = (parsed as { byWorkspace: WindowDeskPark }).byWorkspace;
    if (!byWorkspace || typeof byWorkspace !== 'object') {
      return {};
    }
    return byWorkspace;
  } catch {
    return {};
  }
}
