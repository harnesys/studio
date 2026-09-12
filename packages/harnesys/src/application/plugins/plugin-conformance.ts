import { realpathSync } from 'node:fs';
import path from 'node:path';
import type { PluginDiagnostic } from '../../domain/plugin-diagnostics.ts';

/** Граница отказа при нарушении containment, от самой узкой к широкой (AP §4.1). */
export type ContainmentLevel =
  | 'reject-plugin'
  | 'invalidate-component-type'
  | 'skip-entry'
  | 'deny-path';

const PLUGIN_NAME_MAX_LENGTH = 64;
const PLUGIN_NAME_CHARSET = /^[a-z0-9.-]*$/;
const PLUGIN_NAME_BOUNDARY = /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/;

/** AP §5.5: 1-64 символа, [a-z0-9.-], границы alphanumeric, без `--` и `..`. Пустой массив = имя валидно. */
export function assertPluginName(name: string): string[] {
  const errors: string[] = [];
  if (name.length < 1 || name.length > PLUGIN_NAME_MAX_LENGTH) {
    errors.push(`plugin name must be 1-${PLUGIN_NAME_MAX_LENGTH} characters, got ${name.length}`);
  }
  if (!PLUGIN_NAME_CHARSET.test(name)) {
    errors.push('plugin name must contain only lowercase letters, digits, "-" and "."');
  }
  if (!PLUGIN_NAME_BOUNDARY.test(name)) {
    errors.push('plugin name must start and end with a lowercase letter or digit');
  }
  if (name.includes('--') || name.includes('..')) {
    errors.push('plugin name must not contain consecutive "--" or ".."');
  }
  return errors;
}

/**
 * AP §4.1.3: filesystem-resolved (realpath) путь цели обязан остаться внутри
 * filesystem-resolved корня плагина. Симлинки внутрь корня разрешены.
 * Для ещё не существующей цели realpath берётся от самого глубокого существующего предка.
 */
export function assertInsideRoot(pluginRoot: string, target: string): boolean {
  const root = realpathSync(pluginRoot);
  const resolved = resolveRealPath(target);
  return resolved === root || resolved.startsWith(root + path.sep);
}

/** AP §4.1.4: plugin-relative путь обязан начинаться с `./`. */
export function assertRelativePath(value: string): boolean {
  return value.startsWith('./');
}

/** Ошибки `assertPluginName` в виде diagnostic с кодом `invalid_plugin_name`. */
export function apNameDiagnostics(name: string): PluginDiagnostic[] {
  return assertPluginName(name).map(
    (message): PluginDiagnostic => ({
      level: 'error',
      code: 'invalid_plugin_name',
      message,
      path: 'name',
    }),
  );
}

function resolveRealPath(target: string): string {
  try {
    return realpathSync(target);
  } catch {
    const parent = path.dirname(target);
    if (parent === target) {
      return target;
    }
    return path.join(resolveRealPath(parent), path.basename(target));
  }
}
