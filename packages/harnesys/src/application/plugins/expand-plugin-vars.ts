export type ExpandPluginVarsContext = {
  pluginRoot: string;
  pluginData: string;
};

export const PLUGIN_ROOT_PLACEHOLDER = '${' + 'PLUGIN_ROOT}';
export const PLUGIN_DATA_PLACEHOLDER = '${' + 'PLUGIN_DATA}';

/** Single-pass textual replace of exact PLUGIN_ROOT / PLUGIN_DATA placeholders (AP §9.2). */
export function expandPluginVars(value: string, ctx: ExpandPluginVarsContext): string {
  const pattern = new RegExp(
    `(${escapeRegExp(PLUGIN_ROOT_PLACEHOLDER)}|${escapeRegExp(PLUGIN_DATA_PLACEHOLDER)})`,
  );
  const parts = value.split(pattern);
  let out = '';
  for (const part of parts) {
    if (part === PLUGIN_ROOT_PLACEHOLDER) {
      out += ctx.pluginRoot;
    } else if (part === PLUGIN_DATA_PLACEHOLDER) {
      out += ctx.pluginData;
    } else {
      out += part;
    }
  }
  return out;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
