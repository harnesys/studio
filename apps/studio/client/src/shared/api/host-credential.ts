import type { WindowBootstrap, WindowHostRecord } from '@harnesys/studio-shared';

let credential: string | null = null;
let hosts: WindowHostRecord[] = [];

export function getHostCredential(): string | null {
  return credential;
}

export function getWindowHosts(): WindowHostRecord[] {
  return hosts;
}

/** Query param for WebSocket / <img src> (cannot set Authorization). */
export function hostTokenQuery(): string {
  return credential ? `token=${encodeURIComponent(credential)}` : '';
}

/** In-memory credential from loopback bootstrap. Not VITE_* env. */
export async function ensureHostCredential(): Promise<string> {
  if (credential) {
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
  const local = boot.hosts[0];
  if (!local?.credential) {
    throw new Error('bootstrap missing host credential');
  }
  hosts = boot.hosts;
  credential = local.credential;
  return credential;
}
