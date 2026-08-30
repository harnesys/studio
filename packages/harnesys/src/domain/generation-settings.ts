import type { AgentGenerationSettings } from './agent-definition.ts';

export const CHAT_GENERATION_PARAMETERS = [
  'temperature',
  'top_p',
  'top_k',
  'frequency_penalty',
  'presence_penalty',
  'seed',
  'max_tokens',
  'max_completion_tokens',
] as const;

type GenerationField = keyof AgentGenerationSettings;

const FIELD_PARAMS: { field: GenerationField; params: string[] }[] = [
  { field: 'temperature', params: ['temperature'] },
  { field: 'topP', params: ['top_p'] },
  { field: 'topK', params: ['top_k'] },
  { field: 'frequencyPenalty', params: ['frequency_penalty'] },
  { field: 'presencePenalty', params: ['presence_penalty'] },
  { field: 'seed', params: ['seed'] },
  { field: 'maxTokens', params: ['max_tokens', 'max_completion_tokens'] },
];

export function withChatGenerationParameters(params: string[] | undefined): string[] {
  const out = [...(params ?? [])];
  const seen = new Set(out);
  for (const name of CHAT_GENERATION_PARAMETERS) {
    if (seen.has(name)) continue;
    out.push(name);
    seen.add(name);
  }
  return out;
}

export function filterGenerationSettings(
  settings: AgentGenerationSettings | undefined,
  supportedParameters: string[] | undefined,
): AgentGenerationSettings | undefined {
  if (!settings) return undefined;
  const supported = new Set(withChatGenerationParameters(supportedParameters));
  const out: AgentGenerationSettings = {};
  let wrote = false;
  for (const { field, params } of FIELD_PARAMS) {
    const value = settings[field];
    if (value === undefined) continue;
    if (!params.some((name) => supported.has(name))) continue;
    (out as Record<string, unknown>)[field] = value;
    wrote = true;
  }
  return wrote ? out : undefined;
}
