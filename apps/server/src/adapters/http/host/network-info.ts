import { hostname, networkInterfaces } from 'node:os';
import type { HostNetworkAddress, HostNetworkResponse } from '@harnesys/studio-shared';
import { env } from '../../../config/env.ts';

const EXTERNAL_TTL_MS = 10 * 60 * 1000;

let externalCache: { ip: string; fetchedAtMs: number } | null = null;

function isVpnAddress(address: string): boolean {
  const parts = address.split('.').map(Number);
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return false;
  }
  if (parts[0] !== 100) {
    return false;
  }
  return parts[1] >= 64 && parts[1] <= 127;
}

function collectLocalAddresses(): HostNetworkAddress[] {
  const interfaces = networkInterfaces();
  const result: HostNetworkAddress[] = [];
  for (const [name, entries] of Object.entries(interfaces)) {
    if (!entries) {
      continue;
    }
    for (const entry of entries) {
      if (entry.family !== 'IPv4' || entry.internal) {
        continue;
      }
      if (entry.address.startsWith('127.') || entry.address.startsWith('169.254.')) {
        continue;
      }
      result.push({
        address: entry.address,
        scope: isVpnAddress(entry.address) ? 'vpn' : 'lan',
        iface: name,
      });
    }
  }
  return result;
}

export function collectMdnsName(): string | null {
  const raw = hostname().trim().toLowerCase().replace(/\s+/g, '-');
  if (raw === '') {
    return null;
  }
  const base = raw.endsWith('.local') ? raw.slice(0, -'.local'.length) : raw;
  if (base === '') {
    return null;
  }
  return `${base}.local`;
}

async function collectExternalAddress(): Promise<HostNetworkAddress | null> {
  const now = Date.now();
  if (externalCache && now - externalCache.fetchedAtMs < EXTERNAL_TTL_MS) {
    return { address: externalCache.ip, scope: 'external' };
  }
  try {
    const response = await fetch('https://api.ipify.org?format=json', {
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) {
      return null;
    }
    const body = (await response.json()) as { ip?: unknown };
    if (typeof body.ip !== 'string' || body.ip === '') {
      return null;
    }
    externalCache = { ip: body.ip, fetchedAtMs: now };
    return { address: body.ip, scope: 'external' };
  } catch {
    return null;
  }
}

export async function collectHostNetwork(): Promise<HostNetworkResponse> {
  const addresses = collectLocalAddresses();
  const external = await collectExternalAddress();
  if (external) {
    addresses.push(external);
  }
  return {
    port: env.port,
    mdnsName: collectMdnsName(),
    addresses,
  };
}
