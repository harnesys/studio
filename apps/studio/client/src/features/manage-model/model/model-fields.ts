import type {
  DiscoveredModel,
  Effort,
  Modality,
  ModelArchitecture,
  ModelFeature,
  ModelPricing,
  ModelRecord,
  ModelTopProvider,
  ProviderModelPublic,
} from '@harnesys/studio-shared';
import { EFFORTS, MODALITIES, MODEL_FEATURES, withChatGenerationParameters } from '@harnesys/studio-shared';
import { z } from 'zod';

const optionalAmount = z
  .string()
  .transform((value) => value.trim())
  .refine((value) => value === '' || Number.isFinite(Number(value)), 'Must be a number')
  .transform((value) => (value === '' ? undefined : Number(value)));

const optionalPrice = z
  .string()
  .transform((value) => value.trim())
  .refine((value) => value === '' || Number.isFinite(Number(value)), 'Must be a number')
  .transform((value) => (value === '' ? undefined : value));

export const modelFieldsSchema = z
  .object({
    description: z.string().optional(),
    context_length: optionalAmount,
    maxOutput: optionalAmount,
    cacheRead: optionalPrice,
    input: optionalPrice,
    output: optionalPrice,
    modalities: z.object({
      input: z.array(z.enum(MODALITIES)),
      output: z.array(z.enum(MODALITIES)),
    }),
    features: z.array(z.enum(MODEL_FEATURES)),
    effort: z.array(z.enum(EFFORTS)),
  })
  .superRefine((value, ctx) => {
    const hasCost =
      value.input !== undefined || value.output !== undefined || value.cacheRead !== undefined;
    if (!hasCost) {
      return;
    }
    if (value.input === undefined) {
      ctx.addIssue({ code: 'custom', path: ['input'], message: 'Required with output' });
    }
    if (value.output === undefined) {
      ctx.addIssue({ code: 'custom', path: ['output'], message: 'Required with input' });
    }
  });

export const addModelSchema = modelFieldsSchema.and(
  z.object({
    name: z.string().trim().min(1, 'Name required'),
  }),
);

export type ModelFieldsInput = z.input<typeof modelFieldsSchema>;
export type ModelFieldsOutput = z.output<typeof modelFieldsSchema>;
export type AddModelInput = z.input<typeof addModelSchema>;
export type AddModelOutput = z.output<typeof addModelSchema>;

export type ModelFieldsDraft = {
  id?: string;
  name?: string;
  description?: string;
  context_length?: number;
  architecture?: ModelArchitecture;
  pricing?: ModelPricing;
  top_provider?: ModelTopProvider;
  supported_parameters?: string[];
  effort?: Effort[];
};

export function emptyModelFields(): ModelFieldsInput {
  return {
    description: '',
    context_length: '',
    maxOutput: '',
    cacheRead: '',
    input: '',
    output: '',
    modalities: { input: [], output: [] },
    features: [],
    effort: [],
  };
}

export function metadataFromModel(
  model?: ProviderModelPublic | ModelRecord,
): ModelFieldsDraft | undefined {
  if (!model) {
    return undefined;
  }
  if ('metadata' in model && model.metadata && typeof model.metadata === 'object') {
    return model.metadata as ModelFieldsDraft;
  }
  return model as ModelFieldsDraft;
}

export function modelFieldsFrom(row: {
  stored?: ProviderModelPublic | ModelRecord;
  found?: DiscoveredModel;
}): ModelFieldsInput {
  const storedFields = metadataFromModel(row.stored);
  const fields = mergeFields(row.found, storedFields);
  const features = featuresFrom(fields);
  return {
    description: fields.description ?? '',
    context_length: stringify(fields.context_length ?? fields.top_provider?.context_length),
    maxOutput: stringify(fields.top_provider?.max_completion_tokens),
    cacheRead: stringifyPrice(fields.pricing?.input_cache_read),
    input: stringifyPrice(fields.pricing?.prompt),
    output: stringifyPrice(fields.pricing?.completion),
    modalities: {
      input: fields.architecture?.input_modalities ?? [],
      output: fields.architecture?.output_modalities ?? [],
    },
    features,
    effort: fields.effort ?? [],
  };
}

export function mergeFields(base?: ModelFieldsDraft, extra?: ModelFieldsDraft): ModelFieldsDraft {
  return {
    id: extra?.id ?? base?.id,
    name: extra?.name ?? base?.name,
    description: extra?.description ?? base?.description,
    context_length: extra?.context_length ?? base?.context_length,
    architecture: extra?.architecture ?? base?.architecture,
    pricing: extra?.pricing ?? base?.pricing,
    top_provider: extra?.top_provider ?? base?.top_provider,
    supported_parameters: extra?.supported_parameters ?? base?.supported_parameters,
    effort: extra?.effort ?? base?.effort,
  };
}

export function toModelDraft(values: ModelFieldsOutput): ModelFieldsDraft {
  const hasPair = values.input !== undefined && values.output !== undefined;
  const hasReasoning = values.features.includes('reasoning');

  const featureParams: string[] = [];
  if (values.features.includes('tools')) {
    featureParams.push('tools');
  }
  if (values.features.includes('structured')) {
    featureParams.push('structured_outputs', 'response_format');
  }
  if (hasReasoning) {
    featureParams.push('reasoning', 'reasoning_effort');
  }
  const supported_parameters = withChatGenerationParameters(featureParams);

  const pricing: ModelPricing | undefined = hasPair
    ? {
        prompt: String(values.input),
        completion: String(values.output),
        input_cache_read: values.cacheRead ? String(values.cacheRead) : undefined,
      }
    : undefined;

  const top_provider: ModelTopProvider | undefined =
    values.context_length !== undefined || values.maxOutput !== undefined
      ? {
          context_length: values.context_length,
          max_completion_tokens: values.maxOutput,
        }
      : undefined;

  const architecture: ModelArchitecture | undefined =
    values.modalities.input.length > 0 || values.modalities.output.length > 0
      ? {
          input_modalities: values.modalities.input,
          output_modalities: values.modalities.output,
        }
      : undefined;

  return {
    description: values.description ? values.description.trim() : undefined,
    context_length: values.context_length,
    top_provider,
    architecture,
    pricing,
    supported_parameters,
    effort: hasReasoning && values.effort.length > 0 ? values.effort : undefined,
  };
}

function featuresFrom(fields: ModelFieldsDraft): ModelFeature[] {
  const features: ModelFeature[] = [];
  const params = fields.supported_parameters ?? [];
  if (params.includes('tools')) {
    features.push('tools');
  }
  if (params.includes('structured_outputs') || params.includes('response_format')) {
    features.push('structured');
  }
  if (
    params.includes('reasoning') ||
    params.includes('reasoning_effort') ||
    (fields.effort && fields.effort.length > 0)
  ) {
    features.push('reasoning');
  }
  if (fields.pricing?.input_cache_read || fields.pricing?.input_cache_write) {
    features.push('cache');
  }
  features.push('streaming');
  return features;
}

function stringify(value: number | undefined): string {
  return value == null ? '' : String(value);
}

function stringifyPrice(value: string | undefined): string {
  if (value == null || value === '') {
    return '';
  }
  return value;
}

export function toggleItem<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((entry) => entry !== item) : [...list, item];
}

export const MODALITY_ITEMS: {
  value: Modality;
  label: string;
}[] = [
  { value: 'text', label: 'Text' },
  { value: 'image', label: 'Image' },
  { value: 'audio', label: 'Audio' },
  { value: 'video', label: 'Video' },
  { value: 'file', label: 'File' },
];

export const FEATURE_ITEMS: {
  value: ModelFeature;
  label: string;
}[] = [
  { value: 'tools', label: 'Function Calling' },
  { value: 'structured', label: 'Structured Output' },
  { value: 'streaming', label: 'Streaming' },
  { value: 'reasoning', label: 'Reasoning' },
  { value: 'cache', label: 'Prompt Cache' },
];

export const EFFORT_ITEMS: {
  value: Effort;
  label: string;
}[] = [
  { value: 'none', label: 'None' },
  { value: 'minimal', label: 'Minimal' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'xhigh', label: 'Extra High' },
  { value: 'max', label: 'Max' },
];
