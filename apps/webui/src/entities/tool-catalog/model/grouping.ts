import type { WorkspaceTool } from '@harnesys/studio-shared';
export type ToolGroup = {
  id: string;
  label: string;
  hint?: string;
  tools: WorkspaceTool[];
};
export const TOOL_GROUP_ORDER = [
  'core',
  'files',
  'lsp',
  'plan',
  'memory',
  'skills',
  'agents',
  'control',
  'schedules',
  'webhooks',
] as const;
export const TOOL_GROUP_META: Record<
  string,
  {
    label: string;
    hint?: string;
  }
> = {
  core: { label: 'Core' },
  files: { label: 'Files' },
  lsp: { label: 'LSP' },
  plan: { label: 'Plan' },
  memory: { label: 'Memory' },
  skills: { label: 'Skills' },
  agents: { label: 'Agents' },
  control: { label: 'Control' },
  schedules: { label: 'Schedules' },
  webhooks: { label: 'Webhooks' },
};
export function groupTools(
  tools: WorkspaceTool[],
  mcpServerIds: Iterable<string> = [],
): ToolGroup[] {
  const serverIds = new Set(mcpServerIds);
  const packageTools = tools.filter((tool) => !isMcpTool(tool, serverIds));
  const byGroup = new Map<string, WorkspaceTool[]>();
  for (const tool of packageTools) {
    const id = tool.group ?? 'core';
    const bucket = byGroup.get(id);
    if (bucket) {
      bucket.push(tool);
    } else {
      byGroup.set(id, [tool]);
    }
  }
  const known = TOOL_GROUP_ORDER.filter((id) => byGroup.has(id)).map((id) => ({
    id,
    ...TOOL_GROUP_META[id],
    tools: sortByName(byGroup.get(id) ?? []),
  }));
  const unknown = [...byGroup.keys()]
    .filter((id) => !(TOOL_GROUP_ORDER as readonly string[]).includes(id))
    .sort((a, b) => a.localeCompare(b))
    .map((id) => ({
      id,
      label: labelFromGroupId(id),
      tools: sortByName(byGroup.get(id) ?? []),
    }));
  return [...known, ...unknown];
}
function isMcpTool(tool: WorkspaceTool, serverIds: Set<string>): boolean {
  if (tool.group && serverIds.has(tool.group)) {
    return true;
  }
  for (const serverId of serverIds) {
    if (tool.name.startsWith(`${serverId}__`)) {
      return true;
    }
  }
  return false;
}
function labelFromGroupId(id: string): string {
  const spaced = id.replace(/[-_]+/g, ' ').trim();
  return spaced ? `${spaced[0].toUpperCase()}${spaced.slice(1)}` : id;
}
function sortByName(tools: WorkspaceTool[]): WorkspaceTool[] {
  return [...tools].sort((a, b) => a.name.localeCompare(b.name));
}
