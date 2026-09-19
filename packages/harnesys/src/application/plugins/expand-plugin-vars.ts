export type ExpandPluginVarsContext = {
  pluginRoot: string;
  pluginData: string;
};
export const PLUGIN_ROOT_PLACEHOLDER = '${' + 'PLUGIN_ROOT}';
export const PLUGIN_DATA_PLACEHOLDER = '${' + 'PLUGIN_DATA}';
const PLACEHOLDER_TARGETS: ReadonlyArray<readonly [string, keyof ExpandPluginVarsContext]> = [
  [PLUGIN_ROOT_PLACEHOLDER, 'pluginRoot'],
  [PLUGIN_DATA_PLACEHOLDER, 'pluginData'],
  ['${' + 'CLAUDE_PLUGIN_ROOT}', 'pluginRoot'],
  ['${' + 'CLAUDE_PLUGIN_DATA}', 'pluginData'],
];
export function expandPluginVars(value: string, ctx: ExpandPluginVarsContext): string {
  const pattern = new RegExp(`(${PLACEHOLDER_TARGETS.map(([p]) => escapeRegExp(p)).join('|')})`);
  const parts = value.split(pattern);
  let out = '';
  for (const part of parts) {
    const target = PLACEHOLDER_TARGETS.find(([placeholder]) => placeholder === part);
    out += target === undefined ? part : ctx[target[1]];
  }
  return out;
}
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
