import { z } from 'zod';

const generationBody = z
  .object({
    temperature: z.number().optional(),
    topP: z.number().optional(),
    topK: z.number().optional(),
    frequencyPenalty: z.number().optional(),
    presencePenalty: z.number().optional(),
    seed: z.number().optional(),
    maxTokens: z.number().optional(),
  })
  .nullable()
  .optional();

const toolOutputBody = z
  .object({
    maxChars: z.number().int().positive().optional(),
    headChars: z.number().int().positive().optional(),
    tailChars: z.number().int().positive().optional(),
  })
  .nullable()
  .optional();

const budgetBody = z
  .object({
    maxSteps: z.number().int().positive().optional(),
    maxTokens: z.number().int().positive().optional(),
    deadlineMs: z.number().int().positive().optional(),
    policy: z.enum(['ask', 'error']).optional(),
  })
  .nullable()
  .optional();

const portRefObject = z.object({
  name: z.string().trim().min(1),
  version: z.string().optional(),
  spec: z.record(z.string(), z.unknown()).optional(),
});

const portRefBody = portRefObject.nullable();

const projectBody = z.union([portRefBody, z.object({ paths: z.array(z.string()) })]);

const memoryBody = z
  .object({
    pin: portRefBody.optional(),
    semantic: portRefBody.optional(),
    episodic: portRefBody.optional(),
    knowledge: portRefBody.optional(),
    project: projectBody.optional(),
  })
  .nullable()
  .optional();

const compactionBody = portRefBody.optional();

export const createAgentBody = z.object({
  name: z.string().trim().min(1),
  modelId: z.string().nullish(),
  role: z.string().nullish(),
  instructions: z.string().nullish(),
  effort: z.string().trim().min(1).nullish(),
  generation: generationBody,
  toolOutput: toolOutputBody,
  budget: budgetBody,
  compaction: compactionBody,
  memory: memoryBody,
  skills: z.array(z.string()).optional(),
  mcpServers: z.array(z.string()).optional(),
  tools: z.array(z.string()).optional(),
});

export const updateAgentBody = z.object({
  name: z.string().trim().nullish(),
  modelId: z.string().nullish(),
  role: z.string().nullish(),
  instructions: z.string().nullish(),
  effort: z.string().trim().min(1).nullish(),
  generation: generationBody,
  toolOutput: toolOutputBody,
  budget: budgetBody,
  compaction: compactionBody,
  memory: memoryBody,
  skills: z.array(z.string()).optional(),
  mcpServers: z.array(z.string()).optional(),
  tools: z.array(z.string()).optional(),
});
