import type { DiscoverInput } from '../../../ports/models.ts';

function withoutTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

export function modelsUrl(input: DiscoverInput, fallback: string, path = '/models'): string {
  const base = input.apiUrl ? withoutTrailingSlash(input.apiUrl) : fallback;
  return `${base}${path}`;
}

export function bearerHeaders(input: DiscoverInput): Record<string, string | undefined> {
  return {
    Authorization: input.apiKey ? `Bearer ${input.apiKey}` : undefined,
    ...input.headers,
  };
}
