import type {
  AgentBudget,
  AgentGenerationSettings,
  Effort,
  PackConfig,
  ProviderModelPublic,
  ProviderPublic,
  ToolOutputSettings,
} from '@studio/shared';
import { filterGenerationSettings, withChatGenerationParameters } from '@studio/shared';
import { z } from 'zod';

const optionalAmount = z
  .string()
  .transform((value) => value.trim())
  .refine((value) => value === '' || Number.isFinite(Number(value)), 'Must be a number')
  .transform((value) => (value === '' ? undefined : Number(value)));

const optionalPositiveInt = z
  .string()
  .transform((value) => value.trim())
  .refine(
    (value) => value === '' || (Number.isFinite(Number(value)) && Number(value) >= 1),
    'Must be a positive number',
  )
  .transform((value) => (value === '' ? undefined : Math.floor(Number(value))));

export const agentFieldsSchema = z.object({
  name: z.string().trim().min(1, 'Name required'),
  role: z.string(),
  instructions: z.string(),
  modelId: z.string().nullable(),
  effort: z.string().nullable(),
  temperature: optionalAmount,
  topP: optionalAmount,
  topK: optionalAmount,
  frequencyPenalty: optionalAmount,
  presencePenalty: optionalAmount,
  seed: optionalAmount,
  maxTokens: optionalAmount,
  toolOutputMaxChars: optionalPositiveInt,
  toolOutputHeadChars: optionalPositiveInt,
  toolOutputTailChars: optionalPositiveInt,
  budgetMaxSteps: optionalPositiveInt,
  budgetMaxTokens: optionalPositiveInt,
  budgetDeadlineSec: optionalPositiveInt,
  budgetPolicy: z.enum(['ask', 'error']),
});

export type AgentFieldsInput = z.input<typeof agentFieldsSchema>;
export type AgentFieldsOutput = z.output<typeof agentFieldsSchema>;

export type AgentGenerationField =
  | 'temperature'
  | 'topP'
  | 'topK'
  | 'frequencyPenalty'
  | 'presencePenalty'
  | 'seed'
  | 'maxTokens';

const FIELD_PARAMS: { field: AgentGenerationField; params: string[] }[] = [
  { field: 'temperature', params: ['temperature'] },
  { field: 'topP', params: ['top_p'] },
  { field: 'topK', params: ['top_k'] },
  { field: 'frequencyPenalty', params: ['frequency_penalty'] },
  { field: 'presencePenalty', params: ['presence_penalty'] },
  { field: 'seed', params: ['seed'] },
  { field: 'maxTokens', params: ['max_tokens', 'max_completion_tokens'] },
];

export function emptyAgentFields(): AgentFieldsInput {
  return {
    name: '',
    role: 'Operator',
    instructions: '',
    modelId: null,
    effort: null,
    temperature: '',
    topP: '',
    topK: '',
    frequencyPenalty: '',
    presencePenalty: '',
    seed: '',
    maxTokens: '',
    toolOutputMaxChars: '',
    toolOutputHeadChars: '',
    toolOutputTailChars: '',
    budgetMaxSteps: '',
    budgetMaxTokens: '',
    budgetDeadlineSec: '',
    budgetPolicy: 'ask',
  };
}

export function agentFieldsFrom(agent: {
  name: string;
  role: string;
  instructions: string;
  modelId: string | null;
  effort?: string | null;
  generation?: AgentGenerationSettings | null;
  toolOutput?: ToolOutputSettings | null;
  budget?: AgentBudget | null;
}): AgentFieldsInput {
  return {
    name: agent.name,
    role: agent.role,
    instructions: agent.instructions,
    modelId: agent.modelId,
    effort: agent.effort ?? null,
    temperature: stringify(agent.generation?.temperature),
    topP: stringify(agent.generation?.topP),
    topK: stringify(agent.generation?.topK),
    frequencyPenalty: stringify(agent.generation?.frequencyPenalty),
    presencePenalty: stringify(agent.generation?.presencePenalty),
    seed: stringify(agent.generation?.seed),
    maxTokens: stringify(agent.generation?.maxTokens),
    toolOutputMaxChars: stringify(agent.toolOutput?.maxChars),
    toolOutputHeadChars: stringify(agent.toolOutput?.headChars),
    toolOutputTailChars: stringify(agent.toolOutput?.tailChars),
    budgetMaxSteps: stringify(agent.budget?.maxSteps),
    budgetMaxTokens: stringify(agent.budget?.maxTokens),
    budgetDeadlineSec:
      agent.budget?.deadlineMs !== undefined
        ? stringify(Math.round(agent.budget.deadlineMs / 1000))
        : '',
    budgetPolicy: agent.budget?.policy ?? 'ask',
  };
}

export function toAgentDraft(
  values: AgentFieldsOutput,
  capabilities?: Record<string, PackConfig | null>,
): {
  name: string;
  role: string;
  instructions: string;
  modelId: string | null;
  effort: string | null;
  generation: AgentGenerationSettings | null;
  toolOutput: ToolOutputSettings | null;
  budget: AgentBudget | null;
  capabilities?: Record<string, PackConfig | null>;
} {
  const generation = compactGeneration({
    temperature: values.temperature,
    topP: values.topP,
    topK: values.topK,
    frequencyPenalty: values.frequencyPenalty,
    presencePenalty: values.presencePenalty,
    seed: values.seed,
    maxTokens: values.maxTokens,
  });
  const limits = {
    maxSteps: values.budgetMaxSteps,
    maxTokens: values.budgetMaxTokens,
    deadlineMs:
      values.budgetDeadlineSec !== undefined ? values.budgetDeadlineSec * 1000 : undefined,
  };
  const hasLimit =
    limits.maxSteps !== undefined ||
    limits.maxTokens !== undefined ||
    limits.deadlineMs !== undefined;
  const budget = hasLimit
    ? {
        ...(limits.maxSteps !== undefined ? { maxSteps: limits.maxSteps } : {}),
        ...(limits.maxTokens !== undefined ? { maxTokens: limits.maxTokens } : {}),
        ...(limits.deadlineMs !== undefined ? { deadlineMs: limits.deadlineMs } : {}),
        policy: values.budgetPolicy,
      }
    : null;
  return {
    name: values.name,
    role: values.role,
    instructions: values.instructions,
    modelId: values.modelId,
    effort: values.effort,
    generation,
    toolOutput: compactToolOutput({
      maxChars: values.toolOutputMaxChars,
      headChars: values.toolOutputHeadChars,
      tailChars: values.toolOutputTailChars,
    }),
    budget,
    capabilities,
  };
}

export function modelEfforts(
  modelId: string | null | undefined,
  providers: ProviderPublic[],
): Effort[] {
  return findModel(modelId, providers)?.efforts ?? [];
}

export function modelSupportedParameters(
  modelId: string | null | undefined,
  providers: ProviderPublic[],
): string[] {
  const model = findModel(modelId, providers);
  if (!model) {
    return [];
  }
  const stored = model.host?.supported_parameters ?? model.supported_parameters;
  return withChatGenerationParameters(stored);
}

export function generationFieldVisible(
  supported: string[] | undefined,
  field: AgentGenerationField,
): boolean {
  if (!supported?.length) {
    return false;
  }
  const entry = FIELD_PARAMS.find((item) => item.field === field);
  if (!entry) {
    return false;
  }
  return entry.params.some((name) => supported.includes(name));
}

export function hasGenerationFields(supported: string[] | undefined): boolean {
  return FIELD_PARAMS.some((item) => generationFieldVisible(supported, item.field));
}

export function sanitizeForModel(
  modelId: string | null,
  effort: string | null | undefined,
  generation: AgentGenerationSettings | null | undefined,
  providers: ProviderPublic[],
): { effort: string | null; generation: AgentGenerationSettings | null } {
  const levels = modelEfforts(modelId, providers);
  const nextEffort = effort && levels.includes(effort as Effort) ? effort : null;
  const supported = modelSupportedParameters(modelId, providers);
  const filtered = filterGenerationSettings(generation ?? undefined, supported);
  return {
    effort: nextEffort,
    generation: filtered ?? null,
  };
}

function compactGeneration(settings: AgentGenerationSettings): AgentGenerationSettings | null {
  if (!settings) {
    return null;
  }
  const out: AgentGenerationSettings = {};
  let wrote = false;
  for (const key of Object.keys(settings) as (keyof AgentGenerationSettings)[]) {
    const value = settings[key];
    if (value === undefined) {
      continue;
    }
    (out as Record<string, unknown>)[key] = value;
    wrote = true;
  }
  return wrote ? out : null;
}

function compactToolOutput(settings: ToolOutputSettings): ToolOutputSettings | null {
  const out: ToolOutputSettings = {};
  let wrote = false;
  for (const key of Object.keys(settings) as (keyof ToolOutputSettings)[]) {
    const value = settings[key];
    if (value === undefined) {
      continue;
    }
    out[key] = value;
    wrote = true;
  }
  return wrote ? out : null;
}

function findModel(
  modelId: string | null | undefined,
  providers: ProviderPublic[],
): ProviderModelPublic | undefined {
  if (!modelId) {
    return undefined;
  }
  for (const provider of providers) {
    const found = provider.models.find((item) => item.id === modelId);
    if (found) {
      return found;
    }
  }
  return undefined;
}

function stringify(value: number | undefined): string {
  return value === undefined ? '' : String(value);
}
