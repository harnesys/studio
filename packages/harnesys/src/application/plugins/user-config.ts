export type UserConfigValue = string | number | boolean;
export type UserConfigValues = Record<string, UserConfigValue>;
export type UserConfigContentOptions = {
  values: UserConfigValues;
  sensitiveKeys: ReadonlySet<string>;
};
export type ConfigError = {
  key: string;
  message: string;
};
const USER_CONFIG_REF = /\$\{user_config\.([A-Za-z0-9_]+)\}/g;
export function substituteUserConfig(
  value: string,
  options: UserConfigValues,
  sensitiveKeys: ReadonlySet<string>,
): string | ConfigError {
  let error: ConfigError | undefined;
  const out = value.replace(USER_CONFIG_REF, (match, key: string) => {
    const stored = options[key];
    if (stored !== undefined) {
      return String(stored);
    }
    error = {
      key,
      message: sensitiveKeys.has(key)
        ? `sensitive option "${key}" has no stored value`
        : `option "${key}" is not set`,
    };
    return match;
  });
  return error ?? out;
}
export function substituteUserConfigContent(
  text: string,
  options: UserConfigContentOptions,
): string {
  return text.replace(USER_CONFIG_REF, (_match, key: string) => {
    if (options.sensitiveKeys.has(key)) {
      return '';
    }
    const stored = options.values[key];
    return stored === undefined ? '' : String(stored);
  });
}
