import type { PluginName } from '@harnesys/studio-shared';
import type { SecretStore } from '../domain/secret-store.port.ts';
import { ValidationError } from '../domain/studio.error.ts';

/** Claude userConfig reference size (~2 KB); the adapter owns the hard limit. */
const MAX_SECRET_VALUE_BYTES = 2048;
const SERVICE = 'com.harnesys.studio.plugins';
const DELETE_NOT_FOUND_CODE = 44;

/**
 * SecretStore over the macOS Keychain via the `security` CLI
 * (`add-generic-password` / `find-generic-password` / `delete-generic-password`),
 * service `com.harnesys.studio.plugins`, account `<pluginId>:<key>`.
 * Throws from the constructor when unavailable — composition decides what to do.
 */
export class MacosSecretStoreAdapter implements SecretStore {
  constructor() {
    if (process.platform !== 'darwin') {
      throw new ValidationError('SecretStore requires macOS Keychain');
    }
    if (Bun.which('security') === null) {
      throw new ValidationError('SecretStore requires the macOS `security` CLI');
    }
  }

  async get(pluginId: PluginName, key: string): Promise<string | null> {
    const res = await runSecurity([
      'find-generic-password',
      '-s',
      SERVICE,
      '-a',
      account(pluginId, key),
      '-w',
    ]);
    if (res.code !== 0) {
      return null;
    }
    return res.stdout.trimEnd();
  }

  async set(pluginId: PluginName, key: string, value: string): Promise<void> {
    if (Buffer.byteLength(value, 'utf8') > MAX_SECRET_VALUE_BYTES) {
      throw new ValidationError(
        `secret value for ${pluginId}:${key} exceeds ${MAX_SECRET_VALUE_BYTES} bytes; shorten the value`,
      );
    }
    const res = await runSecurity([
      'add-generic-password',
      '-s',
      SERVICE,
      '-a',
      account(pluginId, key),
      '-w',
      value,
      '-U',
    ]);
    if (res.code !== 0) {
      throw new ValidationError(
        `failed to store secret ${pluginId}:${key} in Keychain: ${res.stderr.trim() || `exit ${res.code}`}`,
      );
    }
  }

  async delete(pluginId: PluginName, key: string): Promise<void> {
    const res = await runSecurity([
      'delete-generic-password',
      '-s',
      SERVICE,
      '-a',
      account(pluginId, key),
    ]);
    if (res.code !== 0 && res.code !== DELETE_NOT_FOUND_CODE) {
      throw new ValidationError(
        `failed to delete secret ${pluginId}:${key} from Keychain: ${res.stderr.trim() || `exit ${res.code}`}`,
      );
    }
  }
}

function account(pluginId: PluginName, key: string): string {
  return `${pluginId}:${key}`;
}

type SecurityResult = { code: number; stdout: string; stderr: string };

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
