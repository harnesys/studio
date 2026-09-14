/** Проекция включённых источников в поля CapabilitySet (skills, notes, subagents, mcpServers)
 *  и их explain-строки. Потребитель собранного набора: грант-решения принимает `capability-set.ts`,
 *  здесь только перечисление и разметка провенанса. */

import type { AgentDefinition } from '../domain/agent-definition.ts';
import type { AgentRosterEntry } from '../ports/create-runtime.ts';
import type { CapabilitySource, ExplainLog } from './capability-explain.ts';
import { PACK_PREFIX } from './capability-explain.ts';
import type { LlmNoteProvider } from './llm-notes.ts';
import type { PackRunOutput } from './packs/pack-run.ts';

export type CollectedOutputs = {
  skills: string[];
  notes: LlmNoteProvider[];
};

export function collectPackOutputs(
  ex: ExplainLog,
  def: AgentDefinition,
  enabled: PackRunOutput[],
): CollectedOutputs {
  const skills: string[] = [];
  const notes: LlmNoteProvider[] = [];
  const seen = new Set<string>();
  const allowedSkills = new Set(def.skills ?? []);
  for (const out of enabled) {
    const source: CapabilitySource = `${PACK_PREFIX}${out.reg.pack.name}`;
    for (const skill of out.skills) {
      if (seen.has(skill.name)) {
        ex.deniedByUniverse(skill.name, 'skill', source, 'collides with earlier pack output');
        continue;
      }
      seen.add(skill.name);
      if (!allowedSkills.has(skill.name)) {
        ex.deniedByUniverse(skill.name, 'skill', source, 'not in agent skills allowlist');
        continue;
      }
      skills.push(skill.name);
      ex.granted(skill.name, 'skill', source, 'pack output');
    }
    for (const note of out.notes) {
      notes.push(note);
      ex.granted(`${out.reg.pack.name}#note${notes.length}`, 'note', source, 'pack output');
    }
  }
  return { skills, notes };
}

export function explainMcpGrants(ex: ExplainLog, mcpServers: string[]): void {
  for (const server of mcpServers) {
    ex.granted(server, 'mcp', `mcp:${server}`, 'agent mcpServers');
  }
}

/** Делегаты чужого parent в roster не кладёт хост; резолвер не перепроверяет `parentId`. */
export function collectSubagents(
  ex: ExplainLog,
  def: AgentDefinition,
  roster: AgentRosterEntry[],
): AgentRosterEntry[] {
  const subagents: AgentRosterEntry[] = [];
  for (const entry of roster) {
    const plugin = entry.plugin;
    if (plugin !== undefined && def.enabledPlugins?.[plugin] !== true) {
      ex.disabled(entry.name, 'subagent', `plugin:${plugin}`, 'plugin not enabled for agent');
      continue;
    }
    const source: CapabilitySource = plugin === undefined ? 'host' : `plugin:${plugin}`;
    subagents.push(entry);
    ex.granted(entry.name, 'subagent', source, 'host roster');
  }
  return subagents;
}
