import type { PluginName } from '@harnesys/studio-shared';
import type { SecretStore } from '../domain/secret-store.port.ts';
import { ValidationError } from '../domain/studio.error.ts';

const MAX_SECRET_VALUE_BYTES = 2048;
const SERVICE = 'com.harnesys.studio.plugins';
const DELETE_NOT_FOUND_CODE = 44;
export class MacosSecretStoreAdapter implements SecretStore {
  constructor() {
    if (process.platform !== 'darwin') {
      throw new ValidationError('SecretStore requires macOS Keychain');
    }
    if (Bun.which('security') === null) {
      throw new ValidationError('SecretStore requires the macOS `security` CLI');
    }
  }
  async get(nodeId: string, pluginId: PluginName, key: string): Promise<string | null> {
    const res = await runSecurity([
      'find-generic-password',
      '-s',
      SERVICE,
      '-a',
      account(nodeId, pluginId, key),
      '-w',
    ]);
    if (res.code !== 0) {
      return null;
    }
    return res.stdout.trimEnd();
  }
  async set(nodeId: string, pluginId: PluginName, key: string, value: string): Promise<void> {
    if (Buffer.byteLength(value, 'utf8') > MAX_SECRET_VALUE_BYTES) {
      throw new ValidationError(
        `secret value for ${nodeId}:${pluginId}:${key} exceeds ${MAX_SECRET_VALUE_BYTES} bytes; shorten the value`,
      );
    }
    const res = await runSecurity([
      'add-generic-password',
      '-s',
      SERVICE,
      '-a',
      account(nodeId, pluginId, key),
      '-w',
      value,
      '-U',
    ]);
    if (res.code !== 0) {
      throw new ValidationError(
        `failed to store secret ${nodeId}:${pluginId}:${key} in Keychain: ${res.stderr.trim() || `exit ${res.code}`}`,
      );
    }
  }
  async delete(nodeId: string, pluginId: PluginName, key: string): Promise<void> {
    const res = await runSecurity([
      'delete-generic-password',
      '-s',
      SERVICE,
      '-a',
      account(nodeId, pluginId, key),
    ]);
    if (res.code !== 0 && res.code !== DELETE_NOT_FOUND_CODE) {
      throw new ValidationError(
        `failed to delete secret ${nodeId}:${pluginId}:${key} from Keychain: ${res.stderr.trim() || `exit ${res.code}`}`,
      );
    }
  }
}
export function account(nodeId: string, pluginId: PluginName, key: string): string {
  return `${nodeId}:${pluginId}:${key}`;
}
export function legacyAccount(pluginId: PluginName, key: string): string {
  return `${pluginId}:${key}`;
}
type SecurityResult = {
  code: number;
  stdout: string;
  stderr: string;
};
async function runSecurity(args: string[]): Promise<SecurityResult> {
  const proc = Bun.spawn(['security', ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
    stdin: 'ignore',
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { code, stdout, stderr };
}
export async function migrateLegacySecret(
  nodeId: string,
  pluginId: PluginName,
  key: string,
): Promise<boolean> {
  const find = await runSecurity([
    'find-generic-password',
    '-s',
    SERVICE,
    '-a',
    legacyAccount(pluginId, key),
    '-w',
  ]);
  if (find.code !== 0) {
    return false;
  }
  const value = find.stdout.trimEnd();
  const add = await runSecurity([
    'add-generic-password',
    '-s',
    SERVICE,
    '-a',
    account(nodeId, pluginId, key),
    '-w',
    value,
    '-U',
  ]);
  return add.code === 0;
}
