import { GOOGLE_DEFAULT_URL } from '../../../constants.ts';
import type { DiscoveredModel, DiscoverInput } from '../../../ports/models.ts';
import { fetchListedModels } from './fetch-list.ts';
import { asNumber, asRecord, asString, asStringList, itemsOf } from './parse.ts';
import { modelsUrl } from './request.ts';

export { GOOGLE_DEFAULT_URL };

export async function listGoogleModels(input: DiscoverInput): Promise<DiscoveredModel[]> {
  const found: DiscoveredModel[] = [];
  let pageToken: string | undefined;
  do {
    const url = new URL(modelsUrl(input, GOOGLE_DEFAULT_URL));
    url.searchParams.set('pageSize', '1000');
    if (pageToken) {
      url.searchParams.set('pageToken', pageToken);
    }
    pageToken = undefined;
    const page = await fetchListedModels({
      url: url.toString(),
      headers: {
        'x-goog-api-key': input.apiKey,
        ...input.headers,
      },
      fetch: input.fetch,
      parse: (json) => {
        pageToken = asString(asRecord(json)?.nextPageToken);
        return parseGoogleList(json);
      },
    });
    found.push(...page);
  } while (pageToken);
  return found;
}

export function parseGoogleList(json: unknown): DiscoveredModel[] {
  const found: DiscoveredModel[] = [];
  for (const item of itemsOf(json, 'models')) {
    const mapped = mapGoogleModel(item);
    if (mapped) {
      found.push(mapped);
    }
  }
  return found;
}

function mapGoogleModel(item: unknown): DiscoveredModel | undefined {
  const record = asRecord(item);
  const rawName = asString(record?.name);
  if (!record || !rawName) {
    return undefined;
  }
  const name = rawName.replace(/^models\//, '');
  const methods = asStringList(record.supportedGenerationMethods);
  const contextLength = asNumber(record.inputTokenLimit);
  const maxOutput = asNumber(record.outputTokenLimit);
  return {
    name,
    kind: googleKind(name, methods),
    context_length: contextLength,
    top_provider:
      contextLength !== undefined || maxOutput !== undefined
        ? { context_length: contextLength, max_completion_tokens: maxOutput }
        : undefined,
    effort: googleModelEfforts(name),
    raw: item,
  };
}

function googleKind(name: string, methods: string[]): 'chat' | 'embed' | 'image' | undefined {
  if (methods.includes('embedContent') || /embed/i.test(name)) {
    return 'embed';
  }
  if (methods.includes('generateImages') || /imagen/i.test(name)) {
    return 'image';
  }
  if (methods.includes('generateContent') || methods.length === 0) {
    return 'chat';
  }
  return undefined;
}

const NONE_LOW_MEDIUM_HIGH = ['none', 'low', 'medium', 'high'];
const LOW_MEDIUM_HIGH = ['low', 'medium', 'high'];

function googleModelEfforts(name: string): string[] | undefined {
  if (!/gemini/i.test(name)) {
    return undefined;
  }
  if (/pro/i.test(name)) {
    return LOW_MEDIUM_HIGH;
  }
  return NONE_LOW_MEDIUM_HIGH;
}
