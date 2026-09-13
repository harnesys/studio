/** Claude Code tool names → our native tools. Per-agent resolution, global registry stays native. */
export const CC_TOOL_ALIASES: Record<string, string> = {
  Read: 'read_file',
  Write: 'write_file',
  Edit: 'edit_file',
  Glob: 'glob',
  Grep: 'grep',
  LS: 'list_dir',
  Bash: 'shell',
  WebFetch: 'fetch',
};

/** CC tool names with no carrier yet; surfaced as diagnostics when referenced. */
export const PLANNED_CC_TOOLS: Record<string, string> = {
  TodoWrite: 'plan pack analog planned',
  WebSearch: 'analog planned',
  NotebookRead: 'analog planned',
  NotebookEdit: 'analog planned',
  KillShell: 'analog planned',
  BashOutput: 'analog planned',
  Task: 'agents_spawn semantics differ; unsupported',
};

export function resolveToolAlias(name: string): string {
  return CC_TOOL_ALIASES[name] ?? name;
}
