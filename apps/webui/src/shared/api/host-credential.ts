import type { WindowBootstrap, WindowHostRecord } from '@harnesys/studio-shared';
import { env } from '@/shared/config/env';

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
export function hostTokenQuery(forCredential?: string | null): string {
  const token = forCredential === undefined ? credential : forCredential;
  return token ? `token=${encodeURIComponent(token)}` : '';
}
let bootstrapInflight: Promise<string> | null = null;
export function ensureHostCredential(): Promise<string> {
  if (credential && hosts.length > 0) {
    return Promise.resolve(credential);
  }
  if (!bootstrapInflight) {
    bootstrapInflight = loadBootstrap().finally(() => {
      bootstrapInflight = null;
    });
  }
  return bootstrapInflight;
}
async function loadBootstrap(): Promise<string> {
  const response = await fetch(`${env.localHostOrigin}/api/window/bootstrap`);
  if (!response.ok) {
    let message = response.statusText || 'bootstrap failed';
    try {
      const body = (await response.json()) as {
        error?: string;
      };
      if (body.error) {
        message = body.error;
      }
    } catch {}
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
