const PLUGIN_NAME_PATTERN = /^(?!.*(?:--|\.\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/;
const PLUGIN_NAME_MAX_LENGTH = 64;

export function assertPluginName(name: string): void {
  if (name.length < 1 || name.length > PLUGIN_NAME_MAX_LENGTH || !PLUGIN_NAME_PATTERN.test(name)) {
    throw new Error(`invalid plugin name: ${name}`);
  }
}
