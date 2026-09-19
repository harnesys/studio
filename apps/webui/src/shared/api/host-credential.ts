import type { WindowBootstrap, WindowHostRecord } from '@harnesys/studio-shared';
import { env } from '@/shared/config/env';

const BOOTSTRAP_WAIT_MS = 15_000;
const BOOTSTRAP_RETRY_MS = 400;

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
async function fetchBootstrap(): Promise<Response> {
  const deadline = Date.now() + BOOTSTRAP_WAIT_MS;
  let lastError: unknown = null;
  for (;;) {
    try {
      return await fetch(`${env.localHostOrigin}/api/window/bootstrap`);
    } catch (error) {
      lastError = error;
      if (Date.now() >= deadline) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, BOOTSTRAP_RETRY_MS));
    }
  }
  throw new Error(
    `host not reachable at ${env.localHostOrigin} after ${BOOTSTRAP_WAIT_MS}ms (${String(lastError)})`,
  );
}
async function loadBootstrap(): Promise<string> {
  const response = await fetchBootstrap();
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
