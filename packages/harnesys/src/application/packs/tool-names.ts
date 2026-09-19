import type { AgentDefinition } from '../../domain/agent-definition.ts';
import type { PackRegistration } from '../../domain/pack.ts';
import type { ToolDefinition } from '../../ports/tools.ts';
import { resolvePacks } from './registry.ts';
export type PackCatalogEntry = {
  name: string;
  version: string;
  description: string;
  icon?: string;
  hasSettings: boolean;
  tools: Array<{
    name: string;
    description: string;
  }>;
  skills: string[];
};
export function packTools(
  def: AgentDefinition,
  registrations: PackRegistration[],
): ToolDefinition[] {
  const { enabled } = resolvePacks(def, registrations);
  return enabled.flatMap((p) => {
    const out = p.reg.pack.create({
      ports: (p.reg.ports ?? {}) as Record<string, unknown>,
      spec: (p.config.spec ?? {}) as Record<string, unknown>,
      scope: p.reg.resolveScope?.() ?? {
        workspaceId: '_',
        agentId: '_',
        threadId: '_',
      },
    });
    return out.tools ?? [];
  });
}
export function packCatalog(registrations: PackRegistration[]): PackCatalogEntry[] {
  return [...registrations]
    .sort((a, b) => (a.pack.name < b.pack.name ? -1 : 1))
    .map((r) => ({
      name: r.pack.name,
      version: r.pack.version,
      description: r.pack.description,
      icon: r.pack.icon,
      hasSettings: r.pack.specSchema !== undefined,
      tools: catalogTools(r),
      skills: r.pack.meta.skills,
    }));
}
function catalogTools(r: PackRegistration): Array<{
  name: string;
  description: string;
}> {
  try {
    const out = r.pack.create({
      ports: (r.ports ?? {}) as Record<string, unknown>,
      spec: {},
      scope: r.resolveScope?.() ?? {
        workspaceId: '_',
        agentId: '_',
        threadId: '_',
      },
    });
    const tools = (out.tools ?? []).map((t) => ({ name: t.name, description: t.description }));
    return tools.length > 0 || r.pack.meta.tools.length === 0 ? tools : r.pack.meta.tools;
  } catch {
    return r.pack.meta.tools;
  }
}
