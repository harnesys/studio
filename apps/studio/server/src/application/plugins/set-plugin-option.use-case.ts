import { existsSync } from 'node:fs';
import type { PluginDiagnostic, PluginName } from '@harnesys/studio-shared';
import type { ConfigOptionSpec, PluginIr } from 'harnesys';
import { loadPluginIrFromDirectory } from 'harnesys/adapters/node';
import type { WorkspaceHarnesysRegistry } from '../../adapters/workspace-harnesys.registry.ts';
import type {
  PluginInstallRecord,
  PluginOptionValue,
  PluginRepository,
} from '../../domain/plugin.port.ts';
import type { SecretStore } from '../../domain/secret-store.port.ts';
import { NotFoundError, ValidationError } from '../../domain/studio.error.ts';
import { invalidatePluginWorkspaces } from './invalidate-plugin-workspaces.ts';
import { isConfigOptionComponent } from './plugin-user-config.ts';

export type SetPluginOptionRequest = {
  name: PluginName;
  workspaceId: string;
  key: string;
  value: PluginOptionValue;
};

export type SetPluginOptionResponse = {
  plugin: PluginInstallRecord;
  diagnostics: PluginDiagnostic[];
};

export type SetPluginOptionInput = {
  execute(request: SetPluginOptionRequest): Promise<SetPluginOptionResponse>;
};

/**
 * Saves one userConfig option. Non-sensitive values go to the plugin record in
 * SQLite; sensitive values go to the SecretStore only. Without a SecretStore
 * the sensitive save is refused with a diagnostic — the value is never written
 * to SQLite.
 */
export class SetPluginOptionUseCase implements SetPluginOptionInput {
  constructor(
    private readonly plugins: PluginRepository,
    private readonly workspaceHarnesys: WorkspaceHarnesysRegistry,
    private readonly secrets?: SecretStore,
  ) {}

  async execute(request: SetPluginOptionRequest): Promise<SetPluginOptionResponse> {
    const record = this.plugins.findByName(request.workspaceId, request.name);
    if (!record) {
      throw new NotFoundError('plugin not found');
    }
    if (!existsSync(record.path)) {
      throw new ValidationError(`plugin checkout not found: ${record.path}`);
    }
    const loaded = await loadPluginIrFromDirectory({
      root: record.path,
      pluginData: record.dataPath,
    });
    const spec = findOptionSpec(loaded.ir, request.key);
    if (!spec) {
      throw new ValidationError(`unknown plugin option: ${request.key}`);
    }
    if (spec.sensitive === true) {
      return await this.saveSensitive(record, request);
    }
    const saved = this.plugins.setOption(
      request.workspaceId,
      request.name,
      request.key,
      coerceOptionValue(spec, request.value),
    );
    await invalidatePluginWorkspaces(this.workspaceHarnesys, [saved.workspaceId]);
    return { plugin: saved, diagnostics: [] };
  }

  private async saveSensitive(
    record: PluginInstallRecord,
    request: SetPluginOptionRequest,
  ): Promise<SetPluginOptionResponse> {
    if (!this.secrets) {
      return {
        plugin: record,
        diagnostics: [
          {
            level: 'error',
            code: 'invalid_component',
            message:
              'secret store unavailable: sensitive option not saved; configure the macOS Keychain SecretStore',
            path: record.path,
          },
        ],
      };
    }
    try {
      await this.secrets.set(request.name, request.key, String(request.value));
    } catch (err) {
      return {
        plugin: record,
        diagnostics: [
          {
            level: 'error',
            code: 'invalid_component',
            message: err instanceof Error ? err.message : 'sensitive option not saved',
            path: record.path,
          },
        ],
      };
    }
    await invalidatePluginWorkspaces(this.workspaceHarnesys, [record.workspaceId]);
    return { plugin: record, diagnostics: [] };
  }
}

function findOptionSpec(ir: PluginIr, key: string): ConfigOptionSpec | undefined {
  return ir.components
    .filter(isConfigOptionComponent)
    .find((component) => component.spec.key === key)?.spec;
}

/** Значение приводится к типу опции: number/boolean приходят строками из UI. */
function coerceOptionValue(spec: ConfigOptionSpec, value: PluginOptionValue): PluginOptionValue {
  if (spec.type === 'number') {
    const num = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(num)) {
      throw new ValidationError(`option "${spec.key}" expects a number`);
    }
    return num;
  }
  if (spec.type === 'boolean') {
    if (typeof value === 'boolean') {
      return value;
    }
    if (value === 'true') {
      return true;
    }
    if (value === 'false') {
      return false;
    }
    throw new ValidationError(`option "${spec.key}" expects a boolean`);
  }
  return String(value);
}
