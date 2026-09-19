import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { dirname } from 'node:path';
import { env } from '../../config/env.ts';
import type {
  HostNodeRecord,
  HostSection,
  MachineConfig,
  MachineConfigPort,
  WindowDesk,
  WindowDeskPark,
  WindowHostRecord,
  WindowSection,
} from '../../domain/machine-config.ts';
import { configJsonPath, defaultHomePath } from '../store/studio-layout.ts';

type RawConfig = {
  host?: unknown;
  window?: unknown;
  [key: string]: unknown;
};

export type MachineConfigFileOptions = {
  home?: string;
  listen?: string;
};

export class MachineConfigFileAdapter implements MachineConfigPort {
  private readonly path: string;
  private readonly defaultListen: string;
  private memoryDefaults: MachineConfig | null = null;

  constructor(options: MachineConfigFileOptions = {}) {
    const home = options.home ?? defaultHomePath();
    this.path = configJsonPath(home);
    this.defaultListen = options.listen ?? `127.0.0.1:${env.port}`;
  }

  read(): MachineConfig {
    return this.load().config;
  }

  writeHost(patch: Partial<HostSection>): MachineConfig {
    const { config, extras } = this.load();
    const nextHost: HostSection = {
      id: patch.id ?? config.host.id,
      name: patch.name ?? config.host.name,
      listen: patch.listen ?? config.host.listen,
      token: patch.token ?? config.host.token,
      publicOrigin:
        patch.publicOrigin !== undefined ? patch.publicOrigin : config.host.publicOrigin,
      nodes: patch.nodes ?? config.host.nodes,
    };
    if (!nextHost.publicOrigin) {
      delete nextHost.publicOrigin;
    }
    const next: MachineConfig = { host: nextHost, window: config.window };
    this.persist(next, extras);
    return next;
  }

  writeWindow(patch: Partial<WindowSection>): MachineConfig {
    const { config, extras } = this.load();
    const nextWindow: WindowSection = {
      hosts: patch.hosts ?? config.window.hosts,
      desk: patch.desk ?? config.window.desk,
    };
    const next: MachineConfig = { host: config.host, window: nextWindow };
    this.persist(next, extras);
    return next;
  }

  private load(): { config: MachineConfig; extras: Record<string, unknown> } {
    if (!existsSync(this.path)) {
      return { config: this.defaults(), extras: {} };
    }
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(this.path, 'utf8'));
    } catch {
      return { config: this.defaults(), extras: {} };
    }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { config: this.defaults(), extras: {} };
    }
    this.memoryDefaults = null;
    const obj = raw as RawConfig;
    const { host: rawHost, window: rawWindow, ...extras } = obj;
    const host = normalizeHost(rawHost, this.defaultListen);
    const window = normalizeWindow(rawWindow, host);
    return { config: { host, window }, extras };
  }

  private defaults(): MachineConfig {
    if (this.memoryDefaults) {
      return this.memoryDefaults;
    }
    const token = crypto.randomUUID();
    const host: HostSection = {
      id: crypto.randomUUID(),
      name: defaultHostName(),
      listen: this.defaultListen,
      token,
      ...(env.publicUrl ? { publicOrigin: env.publicUrl } : {}),
      nodes: [],
    };
    this.memoryDefaults = {
      host,
      window: {
        hosts: [localWindowHost(host)],
        desk: emptyDesk(),
      },
    };
    return this.memoryDefaults;
  }

  private persist(config: MachineConfig, extras: Record<string, unknown>): void {
    mkdirSync(dirname(this.path), { recursive: true });
    const payload = { ...extras, host: config.host, window: config.window };
    const tmp = `${this.path}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    renameSync(tmp, this.path);
    try {
      chmodSync(this.path, 0o600);
    } catch {
      // Windows / restricted FS: leave default mode
    }
    this.memoryDefaults = null;
  }
}

function emptyDesk(): WindowDesk {
  return { selectedNodeIds: [], park: {} };
}

function localWindowHost(host: HostSection): WindowHostRecord {
  return {
    id: 'local',
    name: host.name || 'This machine',
    baseUrl: `http://${host.listen}`,
    credential: host.token,
  };
}

function defaultHostName(): string {
  try {
    return hostname() || 'Host';
  } catch {
    return 'Host';
  }
}

function normalizeHost(raw: unknown, defaultListen: string): HostSection {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      id: crypto.randomUUID(),
      name: defaultHostName(),
      listen: defaultListen,
      token: crypto.randomUUID(),
      ...(env.publicUrl ? { publicOrigin: env.publicUrl } : {}),
      nodes: [],
    };
  }
  const obj = raw as Record<string, unknown>;
  const listen =
    typeof obj.listen === 'string' && obj.listen.trim() ? obj.listen.trim() : defaultListen;
  const token =
    typeof obj.token === 'string' && obj.token.trim() ? obj.token.trim() : crypto.randomUUID();
  const id = typeof obj.id === 'string' && obj.id.trim() ? obj.id.trim() : crypto.randomUUID();
  const name =
    typeof obj.name === 'string' && obj.name.trim() ? obj.name.trim() : defaultHostName();
  const fromFile =
    typeof obj.publicOrigin === 'string' && obj.publicOrigin.trim()
      ? obj.publicOrigin.trim()
      : undefined;
  const publicOrigin = env.publicUrl || fromFile;
  return {
    id,
    name,
    listen,
    token,
    ...(publicOrigin ? { publicOrigin } : {}),
    nodes: normalizeNodes(obj.nodes),
  };
}

function normalizeNodes(raw: unknown): HostNodeRecord[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: HostNodeRecord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      continue;
    }
    const row = item as Record<string, unknown>;
    if (
      typeof row.id !== 'string' ||
      !row.id ||
      typeof row.path !== 'string' ||
      !row.path ||
      typeof row.name !== 'string' ||
      !row.name
    ) {
      continue;
    }
    out.push({ id: row.id, path: row.path, name: row.name });
  }
  return out;
}

function normalizeWindow(raw: unknown, host: HostSection): WindowSection {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      hosts: [localWindowHost(host)],
      desk: emptyDesk(),
    };
  }
  const obj = raw as Record<string, unknown>;
  const hosts = normalizeHosts(obj.hosts, host);
  return {
    hosts: hosts.length > 0 ? hosts : [localWindowHost(host)],
    desk: normalizeDesk(obj.desk),
  };
}

function normalizeHosts(raw: unknown, host: HostSection): WindowHostRecord[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: WindowHostRecord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      continue;
    }
    const row = item as Record<string, unknown>;
    if (
      typeof row.id !== 'string' ||
      !row.id ||
      typeof row.baseUrl !== 'string' ||
      !row.baseUrl ||
      typeof row.credential !== 'string'
    ) {
      continue;
    }
    let name: string;
    if (typeof row.name === 'string' && row.name.trim()) {
      name = row.name.trim();
    } else if (row.id === 'local') {
      name = host.name || 'This machine';
    } else {
      name = row.id;
    }
    out.push({
      id: row.id,
      name,
      baseUrl: row.baseUrl,
      credential: row.credential || host.token,
    });
  }
  return out;
}

function normalizeDesk(raw: unknown): WindowDesk {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return emptyDesk();
  }
  const obj = raw as Record<string, unknown>;
  const selectedNodeIds = Array.isArray(obj.selectedNodeIds)
    ? obj.selectedNodeIds.filter((id): id is string => typeof id === 'string')
    : [];
  const park: WindowDeskPark =
    obj.park && typeof obj.park === 'object' && !Array.isArray(obj.park)
      ? (obj.park as WindowDeskPark)
      : {};
  return { selectedNodeIds, park };
}
