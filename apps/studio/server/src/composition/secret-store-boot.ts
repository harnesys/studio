import { MacosSecretStoreAdapter } from '../adapters/secret-store-macos.adapter.ts';
import { logger } from '../config/logger.ts';
import type { SecretStore } from '../domain/secret-store.port.ts';

export function tryCreateHostSecretStore(): SecretStore | undefined {
  try {
    return new MacosSecretStoreAdapter();
  } catch (err) {
    logger.warn(
      { scope: 'plugins' },
      `SecretStore unavailable, sensitive plugin options will refuse to save: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return undefined;
  }
}
