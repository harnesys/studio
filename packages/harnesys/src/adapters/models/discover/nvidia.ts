import type { DiscoveredModel, DiscoverInput } from '../../../ports/models.ts';
import { fetchListedModels } from './fetch-list.ts';
import { asNumber, asRecord, asString, itemsOf, topProviderOf } from './parse.ts';
import { bearerHeaders, modelsUrl } from './request.ts';

export const NVIDIA_DEFAULT_URL = 'https://integrate.api.nvidia.com/v1';

export function listNvidiaModels(input: DiscoverInput): Promise<DiscoveredModel[]> {
  return fetchListedModels({
    url: modelsUrl(input, NVIDIA_DEFAULT_URL),
    headers: bearerHeaders(input),
    fetch: input.fetch,
    parse: parseNvidiaList,
  });
}

export function parseNvidiaList(json: unknown): DiscoveredModel[] {
  const found: DiscoveredModel[] = [];
  for (const item of itemsOf(json)) {
    const mapped = mapNvidiaModel(item);
    if (mapped) {
      found.push(mapped);
    }
  }
  return found;
}

function mapNvidiaModel(item: unknown): DiscoveredModel | undefined {
  const record = asRecord(item);
  const name = asString(record?.id);
  if (!record || !name) {
    return undefined;
  }
  const kind = nvidiaKind(name);
  const hasReasoning = /r1|reasoning|think|nemotron/i.test(name);
  const contextLength = asNumber(record.context_length) ?? asNumber(record.max_model_len);
  const maxOutput = asNumber(record.max_completion_tokens);

  return {
    name,
    kind,
    context_length: contextLength,
    top_provider: topProviderOf(contextLength, maxOutput),
    effort: hasReasoning ? ['low', 'medium', 'high'] : undefined,
    raw: item,
  };
}

function nvidiaKind(name: string): 'chat' | 'embed' | 'image' | 'audio' | undefined {
  if (/embed|retrieval|nv-embed/i.test(name)) {
    return 'embed';
  }
  if (/flux|sdxl|stable-diffusion|imagen|kosmos/i.test(name) && !/vision/i.test(name)) {
    return 'image';
  }
  if (/whisper|parakeet|canary|asr|tts/i.test(name)) {
    return 'audio';
  }
  if (/rerank/i.test(name)) {
    return undefined;
  }
  return 'chat';
}
