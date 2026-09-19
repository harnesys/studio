export type SearchResult = {
  title: string;
  url: string;
  snippet: string;
};
export type SearchProvider = {
  search: (query: string) => Promise<SearchResult[]>;
};
const MAX_RESULTS = 5;
const DUCKDUCKGO_MIN_DELAY_MS = 2000;
const SEARXNG_MIN_DELAY_MS = 1000;
const SEARXNG_TIMEOUT_MS = 10000;
const FAILURE_HINT = 'Stop retrying and tell the user that web search is temporarily unavailable.';
function createLimiter(minDelayMs: number): <T>(task: () => Promise<T>) => Promise<T> {
  let lastRequestAt = 0;
  let tail: Promise<unknown> = Promise.resolve();
  return (task) => {
    const next = tail.then(async () => {
      const elapsed = Date.now() - lastRequestAt;
      if (elapsed < minDelayMs) {
        await new Promise((resolve) => setTimeout(resolve, minDelayMs - elapsed));
      }
      lastRequestAt = Date.now();
      return task();
    });
    tail = next.catch(() => undefined);
    return next;
  };
}
function describeFailure(provider: string, error: unknown): Error {
  const detail = error instanceof Error ? error.message : String(error);
  return new Error(`${provider}: ${detail}. ${FAILURE_HINT}`);
}
const duckduckgoLimiter = createLimiter(DUCKDUCKGO_MIN_DELAY_MS);
const DUCKDUCKGO_HEADERS = {
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'en-US,en;q=0.9',
};
export function duckduckgoSearch(): SearchProvider {
  return {
    search: (query) =>
      duckduckgoLimiter(async () => {
        try {
          const response = await fetch('https://html.duckduckgo.com/html/', {
            method: 'POST',
            headers: {
              ...DUCKDUCKGO_HEADERS,
              'content-type': 'application/x-www-form-urlencoded',
              origin: 'https://html.duckduckgo.com',
              referer: 'https://html.duckduckgo.com/',
            },
            body: new URLSearchParams({ q: query, kl: 'wt-wt' }).toString(),
          });
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          return parseDuckduckgoHtml(await response.text());
        } catch (error) {
          throw describeFailure('duckduckgo', error);
        }
      }),
  };
}
const RESULT_LINK_REGEX = /<a[^>]+class="result__a"[^>]+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
const RESULT_SNIPPET_REGEX = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
function parseDuckduckgoHtml(body: string): SearchResult[] {
  if (body.includes('no-results') || body.includes('try to focus')) {
    return [];
  }
  const links: Array<{
    url: string;
    title: string;
  }> = [];
  for (const match of body.matchAll(RESULT_LINK_REGEX)) {
    if (match[1] === undefined) {
      continue;
    }
    links.push({ url: match[1], title: stripTags(match[2] ?? '') });
  }
  const snippets: string[] = [];
  for (const match of body.matchAll(RESULT_SNIPPET_REGEX)) {
    if (match[1] !== undefined) {
      snippets.push(stripTags(match[1]));
    }
  }
  const results: SearchResult[] = [];
  for (let i = 0; i < Math.min(links.length, MAX_RESULTS); i += 1) {
    const link = links[i];
    if (link === undefined) {
      continue;
    }
    results.push({
      title: link.title,
      url: unwrapDuckduckgoRedirect(link.url),
      snippet: snippets[i] ?? '',
    });
  }
  return results;
}
function unwrapDuckduckgoRedirect(url: string): string {
  if (!url.startsWith('//duckduckgo.com/l/')) {
    return url;
  }
  const resolved = new URL(url, 'https://duckduckgo.com');
  return resolved.searchParams.get('uddg') ?? url;
}
function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, '').trim();
}
export type SearxngOptions = {
  url: string;
};
export function searxngSearch(options: SearxngOptions): SearchProvider {
  const limiter = createLimiter(SEARXNG_MIN_DELAY_MS);
  const base = options.url.replace(/\/+$/, '');
  return {
    search: (query) =>
      limiter(async () => {
        try {
          const params = new URLSearchParams({
            q: query,
            format: 'json',
            categories: 'general',
            language: 'en',
          });
          const response = await fetch(`${base}/search?${params.toString()}`, {
            headers: { accept: 'application/json' },
            signal: AbortSignal.timeout(SEARXNG_TIMEOUT_MS),
          });
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          const data = (await response.json()) as SearxngResponse;
          return (data.results ?? []).slice(0, MAX_RESULTS).map((item) => ({
            title: item.title ?? '',
            url: item.url ?? '',
            snippet: item.content ?? '',
          }));
        } catch (error) {
          throw describeFailure('searxng', error);
        }
      }),
  };
}
type SearxngResponse = {
  results?: Array<{
    title?: string;
    url?: string;
    content?: string;
  }>;
};
