import type { WorkspaceTool } from '@harnesys/studio-shared';

export type ToolGroup = {
  id: string;
  label: string;
  hint?: string;
  tools: WorkspaceTool[];
};

export const TOOL_GROUP_ORDER = [
  'files',
  'core',
  'skills',
  'schedules',
  'webhooks',
  'memory',
] as const;

export const TOOL_GROUP_META: Record<string, { label: string; hint?: string }> = {
  files: { label: 'Files' },
  core: { label: 'Core' },
  skills: { label: 'Skills' },
  schedules: { label: 'Schedules' },
  webhooks: { label: 'Webhooks' },
  memory: {
    label: 'Memory',
  },
};

/** Group a flat tool catalog by purpose; MCP servers become their own groups. */
export function groupTools(tools: WorkspaceTool[]): ToolGroup[] {
  const byGroup = new Map<string, WorkspaceTool[]>();
  for (const tool of tools) {
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
  const mcpGroups = [...byGroup.keys()]
    .filter((id) => !(TOOL_GROUP_ORDER as readonly string[]).includes(id))
    .sort((a, b) => a.localeCompare(b))
    .map((id) => ({
      id,
      label: `${id} · MCP`,
      tools: sortByName(byGroup.get(id) ?? []),
    }));
  return [...known, ...mcpGroups];
}

function sortByName(tools: WorkspaceTool[]): WorkspaceTool[] {
  return [...tools].sort((a, b) => a.name.localeCompare(b.name));
}
