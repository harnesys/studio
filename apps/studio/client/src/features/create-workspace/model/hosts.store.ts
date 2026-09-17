import { create } from 'zustand';
import { STUDIO_HOSTS_STORAGE_KEY } from '@/shared/config/constants';

export const LOCAL_HOST_ID = 'local';
export const NEW_HOST_ID = '__new__';

export type StudioHostStatus = 'online' | 'offline';

export type StudioHost = {
  id: string;
  name: string;
  kind: 'local' | 'remote';
  address?: string;
  status: StudioHostStatus;
};

export const LOCAL_HOST: StudioHost = {
  id: LOCAL_HOST_ID,
  name: 'This machine',
  kind: 'local',
  status: 'online',
};

type HostsState = {
  remotes: StudioHost[];
  pairHost: (input: { address: string; code: string }) => Promise<StudioHost>;
};

function loadRemotes(): StudioHost[] {
  try {
    const raw = localStorage.getItem(STUDIO_HOSTS_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as { remotes?: StudioHost[] };
    if (!Array.isArray(parsed.remotes)) {
      return [];
    }
    return parsed.remotes.filter(
      (item) => item && typeof item.id === 'string' && item.kind === 'remote',
    );
  } catch {
    return [];
  }
}

function persist(remotes: StudioHost[]): void {
  try {
    localStorage.setItem(STUDIO_HOSTS_STORAGE_KEY, JSON.stringify({ remotes }));
  } catch {}
}

function hostLabelFromAddress(address: string): string {
  const trimmed = address.trim();
  const host = trimmed.split('/')[0]?.split(':')[0] ?? trimmed;
  return host.length > 0 ? host : 'Remote host';
}

export const useStudioHostsStore = create<HostsState>((set, get) => ({
  remotes: loadRemotes(),
  pairHost: async ({ address, code }) => {
    void code;
    await new Promise((resolve) => {
      window.setTimeout(resolve, 700);
    });
    const host: StudioHost = {
      id: crypto.randomUUID(),
      name: hostLabelFromAddress(address),
      kind: 'remote',
      address: address.trim(),
      status: 'online',
    };
    const remotes = [...get().remotes, host];
    persist(remotes);
    set({ remotes });
    return host;
  },
}));

export function hostStatusLabel(host: StudioHost): string {
  if (host.kind === 'local') {
    return 'local';
  }
  return host.status;
}

export function folderNameFromPath(path: string): string {
  const trimmed = path.trim().replace(/[\\/]+$/, '');
  if (trimmed.length === 0) {
    return '';
  }
  const parts = trimmed.split(/[\\/]/);
  return parts[parts.length - 1] ?? '';
}
