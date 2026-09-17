import type { WindowBootstrap, WindowHostRecord } from '@harnesys/studio-shared';

let credential: string | null = null;
let hosts: WindowHostRecord[] = [];

export function getHostCredential(): string | null {
  return credential;
}

export function getWindowHosts(): WindowHostRecord[] {
  return hosts;
}

export function setWindowHosts(next: WindowHostRecord[]): void {
  hosts = next;
  const local = next.find((host) => host.id === 'local') ?? next[0];
  credential = local?.credential ?? credential;
}

/** Query param for WebSocket / <img src> (cannot set Authorization). */
export function hostTokenQuery(forCredential?: string | null): string {
  const token = forCredential === undefined ? credential : forCredential;
  return token ? `token=${encodeURIComponent(token)}` : '';
}

/** In-memory credential from loopback bootstrap. Not VITE_* env. */
export async function ensureHostCredential(): Promise<string> {
  if (credential && hosts.length > 0) {
    return credential;
  }
  const response = await fetch('/api/window/bootstrap');
  if (!response.ok) {
    let message = response.statusText || 'bootstrap failed';
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) {
        message = body.error;
      }
    } catch {
      // keep status text
    }
    throw new Error(`host bootstrap ${response.status}: ${message}`);
  }
  const boot = (await response.json()) as WindowBootstrap;
  const local = boot.hosts.find((host) => host.id === 'local') ?? boot.hosts[0];
  if (!local?.credential) {
    throw new Error('bootstrap missing host credential');
  }
  setWindowHosts(
    boot.hosts.map((host) => ({
      id: host.id,
      name: host.name || (host.id === 'local' ? 'This machine' : host.id),
      baseUrl: host.baseUrl,
      credential: host.credential,
    })),
  );
  return credential as string;
}
