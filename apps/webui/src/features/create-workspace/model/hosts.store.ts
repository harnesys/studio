import type {
  HostNetworkResponse,
  PairingRedeemResponse,
  PairingStartResponse,
  WindowHostRecord,
} from '@harnesys/studio-shared';
import { create } from 'zustand';
import { apiJson } from '@/shared/api/client';
import { getWindowHosts, setWindowHosts } from '@/shared/api/host-credential';
import {
  getHostOnlineStatus,
  type StudioHostOnlineStatus,
  setHostOnlineStatus,
  trimBaseUrl,
} from '@/shared/api/host-router';
export const LOCAL_HOST_ID = 'local';
export const NEW_HOST_ID = '__new__';
const DEFAULT_HOST_PORT = 47474;
const PAIR_ERROR_MESSAGES: Record<string, string> = {
  pairing_code_missing: 'No pairing request is active on the host. Generate a new code there.',
  pairing_code_expired: 'The code expired. Generate a new one on the host.',
  pairing_code_invalid: 'Wrong code. Check it and try again.',
};
export type StudioHostStatus = StudioHostOnlineStatus;
export type StudioHost = {
  id: string;
  name: string;
  kind: 'local' | 'remote';
  address?: string;
  baseUrl: string;
  status: StudioHostStatus;
};
export const LOCAL_HOST: StudioHost = {
  id: LOCAL_HOST_ID,
  name: 'This machine',
  kind: 'local',
  baseUrl: '',
  status: 'online',
};
type HostsState = {
  remotes: StudioHost[];
  syncFromWindowHosts: () => void;
  pairHost: (input: { address: string; code: string }) => Promise<StudioHost>;
  showPairingCode: () => Promise<PairingStartResponse>;
  fetchNetworkInfo: () => Promise<HostNetworkResponse>;
  revokeHost: (hostId: string) => Promise<void>;
};
function toStudioHost(record: WindowHostRecord): StudioHost {
  const kind = record.id === LOCAL_HOST_ID ? 'local' : 'remote';
  return {
    id: record.id,
    name: record.name || (kind === 'local' ? LOCAL_HOST.name : record.id),
    kind,
    address: kind === 'remote' ? record.baseUrl.replace(/^https?:\/\//, '') : undefined,
    baseUrl: record.baseUrl,
    status: getHostOnlineStatus(record.id),
  };
}
function remotesFromWindow(): StudioHost[] {
  return getWindowHosts()
    .filter((host) => host.id !== LOCAL_HOST_ID)
    .map(toStudioHost);
}
function normalizePairAddress(address: string): string {
  const trimmed = address.trim();
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  try {
    const url = new URL(withScheme);
    const hasPath = url.pathname.length > 1 || url.search.length > 0 || url.hash.length > 0;
    if (!url.port && !hasPath) {
      url.port = String(DEFAULT_HOST_PORT);
    }
    return trimBaseUrl(url.toString());
  } catch {
    return trimBaseUrl(withScheme);
  }
}
async function persistHosts(hosts: WindowHostRecord[]): Promise<WindowHostRecord[]> {
  const response = await apiJson<{
    hosts: WindowHostRecord[];
  }>('/api/window/hosts', {
    method: 'PUT',
    body: JSON.stringify({ hosts }),
    hostId: LOCAL_HOST_ID,
  });
  setWindowHosts(response.hosts);
  return response.hosts;
}
export const useStudioHostsStore = create<HostsState>((set, get) => ({
  remotes: remotesFromWindow(),
  syncFromWindowHosts: () => {
    set({ remotes: remotesFromWindow() });
  },
  pairHost: async ({ address, code }) => {
    const baseUrl = normalizePairAddress(address);
    let redeem: Response;
    try {
      redeem = await fetch(`${baseUrl}/api/host/pair/redeem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
    } catch {
      throw new Error('Host is not reachable at that address.');
    }
    if (!redeem.ok) {
      let message = redeem.statusText || 'Pairing failed';
      try {
        const body = (await redeem.json()) as {
          error?: string;
        };
        if (body.error) {
          message = PAIR_ERROR_MESSAGES[body.error] ?? body.error;
        }
      } catch {}
      throw new Error(message);
    }
    const payload = (await redeem.json()) as PairingRedeemResponse;
    const record: WindowHostRecord = {
      id: payload.hostId,
      name: payload.name || hostLabelFromAddress(address),
      baseUrl: normalizePairAddress(payload.listen ? `http://${payload.listen}` : baseUrl),
      credential: payload.credential,
    };
    if (!/^https?:\/\/(127\.0\.0\.1|localhost)\b/i.test(baseUrl)) {
      record.baseUrl = baseUrl;
    }
    const existing = getWindowHosts().filter((host) => host.id !== record.id);
    await persistHosts([...existing, record]);
    setHostOnlineStatus(record.id, 'online');
    get().syncFromWindowHosts();
    return toStudioHost(record);
  },
  showPairingCode: () => {
    return apiJson<PairingStartResponse>('/api/host/pair/start', {
      method: 'POST',
      hostId: LOCAL_HOST_ID,
    });
  },
  fetchNetworkInfo: () => {
    return apiJson<HostNetworkResponse>('/api/host/network', {
      hostId: LOCAL_HOST_ID,
    });
  },
  revokeHost: async (hostId) => {
    if (hostId === LOCAL_HOST_ID) {
      throw new Error('Cannot revoke the local host');
    }
    const next = getWindowHosts().filter((host) => host.id !== hostId);
    await persistHosts(next);
    get().syncFromWindowHosts();
  },
}));
export function listStudioHosts(): StudioHost[] {
  const hosts = getWindowHosts();
  if (hosts.length === 0) {
    return [{ ...LOCAL_HOST, status: getHostOnlineStatus(LOCAL_HOST_ID) }];
  }
  return hosts.map(toStudioHost);
}
export function hostStatusLabel(host: StudioHost): string {
  if (host.kind === 'local') {
    return host.status === 'offline' ? 'offline' : 'local';
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
function hostLabelFromAddress(address: string): string {
  const trimmed = address.trim();
  const host =
    trimmed
      .replace(/^https?:\/\//i, '')
      .split('/')[0]
      ?.split(':')[0] ?? trimmed;
  return host.length > 0 ? host : 'Remote host';
}
