import { askUser, mapTool, wait } from '../../adapters/actions/index.ts';
import { definePack } from '../../domain/pack.ts';

export const coreCapability = definePack<Record<string, unknown>, Record<string, unknown>>({
  name: 'core',
  version: '1.0.0',
  description: 'Host-mandated core tools: ask_user / map / wait',
  icon: 'core',
  meta: {
    tools: [
      {
        name: 'ask_user',
        description:
          'Ask the human a question and wait for their reply. Use for clarifications, choices, or missing information before continuing.',
      },
      {
        name: 'map',
        description:
          'Queue a fan-out over items for the graph control:map node. items is a JSON array (max 32). Optional instruction is a per-item template with $item/$index; it overrides the node default. Optional maxTokensPerItem caps each worker text result. Each item is processed in the map body with $item/$index; results return as Map results in context. Prefer this for parallel same-graph work; use agents_spawn when you need another agent definition.',
      },
      {
        name: 'wait',
        description:
          'Park this run until a wall-clock time (control:wait). delayMs is relative sleep (1..7d). Prefer this for mid-pipeline pauses; use schedule_set for recurring or next-session wakes after the run ends. Does not replace ask_user.',
      },
    ],
    skills: [],
    hasSettings: false,
  },
  create: () => ({ tools: [askUser(), mapTool(), wait()] }),
});
