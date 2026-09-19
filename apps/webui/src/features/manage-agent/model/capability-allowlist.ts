export function isChecked(allowlist: string[], name: string): boolean {
  return allowlist.includes(name);
}
export function nextAllowlist(
  catalogNames: string[],
  current: string[],
  name: string,
  enable: boolean,
): string[] {
  const enabled = new Set(current);
  if (enable) {
    enabled.add(name);
  } else {
    enabled.delete(name);
  }
  return catalogNames.filter((item) => enabled.has(item));
}
export function skillPluginOf(name: string): string | null {
  const index = name.indexOf(':');
  return index > 0 ? name.slice(0, index) : null;
}
const MCP_PLUGIN_PREFIX = 'plugin:';
export function mcpServerPluginOf(serverId: string): string | null {
  if (!serverId.startsWith(MCP_PLUGIN_PREFIX)) {
    return null;
  }
  const rest = serverId.slice(MCP_PLUGIN_PREFIX.length);
  const index = rest.indexOf(':');
  return index > 0 ? rest.slice(0, index) : null;
}
export function stripPluginPrefix(name: string, plugin: string): string {
  const skillPrefix = `${plugin}:`;
  if (name.startsWith(skillPrefix)) {
    return name.slice(skillPrefix.length);
  }
  const mcpPrefix = `${MCP_PLUGIN_PREFIX}${plugin}:`;
  return name.startsWith(mcpPrefix) ? name.slice(mcpPrefix.length) : name;
}
