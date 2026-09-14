/** Allowlist merge helpers shared by the skills and MCP draft panes. */

export function isChecked(allowlist: string[], name: string): boolean {
  return allowlist.includes(name);
}

/** Toggle one entry and keep the list ordered by the live catalog names. */
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

/** Plugin segment of a prefixed skill name (`pluginName:skill`), null for direct installs. */
export function skillPluginOf(name: string): string | null {
  const index = name.indexOf(':');
  return index > 0 ? name.slice(0, index) : null;
}

const MCP_PLUGIN_PREFIX = 'plugin:';

/** Plugin segment of a plugin MCP server id (`plugin:<name>:<server>`), null for direct installs. */
export function mcpServerPluginOf(serverId: string): string | null {
  if (!serverId.startsWith(MCP_PLUGIN_PREFIX)) {
    return null;
  }
  const rest = serverId.slice(MCP_PLUGIN_PREFIX.length);
  const index = rest.indexOf(':');
  return index > 0 ? rest.slice(0, index) : null;
}

/** Display title inside a plugin section: the bare skill/server name without its prefix. */
export function stripPluginPrefix(name: string, plugin: string): string {
  const skillPrefix = `${plugin}:`;
  if (name.startsWith(skillPrefix)) {
    return name.slice(skillPrefix.length);
  }
  const mcpPrefix = `${MCP_PLUGIN_PREFIX}${plugin}:`;
  return name.startsWith(mcpPrefix) ? name.slice(mcpPrefix.length) : name;
}
