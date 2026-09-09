import { episodicMemoryCapability } from './episodic.ts';
import { knowledgeMemoryCapability } from './knowledge.ts';
import { pinMemoryCapability } from './pin.ts';
import { semanticMemoryCapability } from './semantic.ts';

export const memoryCapabilities = {
  episodic: episodicMemoryCapability,
  knowledge: knowledgeMemoryCapability,
  pin: pinMemoryCapability,
  semantic: semanticMemoryCapability,
} as const;

export const memoryCapabilityList = [
  episodicMemoryCapability,
  knowledgeMemoryCapability,
  pinMemoryCapability,
  semanticMemoryCapability,
] as const;
