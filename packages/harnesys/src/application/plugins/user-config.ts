/**
 * Подстановка `${user_config.KEY}` (спека §3 config-option): exec-контексты
 * (argv-хуки, MCP/LSP) подставляют значения, контент скиллов/агентов —
 * выбрасывает sensitive-ссылки, не подставляя их значения.
 */
export type UserConfigValue = string | number | boolean;

/** Сохранённые значения опций плагина; sensitive приходят из секрет-хранилища хоста. */
export type UserConfigValues = Record<string, UserConfigValue>;

/** Опции подстановки в контент: sensitive-ключи выбрасываются даже при известном значении. */
export type UserConfigContentOptions = {
  values: UserConfigValues;
  sensitiveKeys: ReadonlySet<string>;
};

/** Ссылка не разрешается: ключ не объявлен схемой или значение недоступно. */
export type ConfigError = { key: string; message: string };

const USER_CONFIG_REF = /\$\{user_config\.([A-Za-z0-9_]+)\}/g;

/**
 * Exec-контекст: каждая ссылка обязана разрешиться. Значение в `options` —
 * подстановка; sensitive без значения — отказ (хост не достал секрет);
 * неизвестный ключ — отказ (опечатка или схема изменилась).
 */
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

/**
 * Контент скиллов/агентов: разрешённые ссылки подставляются, sensitive и
 * неразрешённые — выбрасываются (литерал `${user_config.*}` в промпт не течёт).
 */
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
