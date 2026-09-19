const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host',
]);

function filterHeaders(headers: Headers): Headers {
  const filtered = new Headers();
  headers.forEach((value, name) => {
    if (!HOP_BY_HOP.has(name.toLowerCase())) {
      filtered.set(name, value);
    }
  });
  return filtered;
}

function targetUrl(upstream: URL, pathname: string, search: string): string {
  const prefix = upstream.pathname.replace(/\/$/, '');
  return `${upstream.origin}${prefix}${pathname}${search}`;
}

/**
 * Forwards a proxied HTTP request to the upstream host.
 * Request bodies are buffered (API payloads are small); response bodies stream
 * untouched, which keeps SSE (/api/desk/watch) unbuffered.
 */
export async function proxyRequest(request: Request, upstream: URL): Promise<Response> {
  const url = new URL(request.url);
  const method = request.method;
  const hasBody = method !== 'GET' && method !== 'HEAD';
  const body = hasBody ? await request.arrayBuffer() : undefined;
  const response = await fetch(targetUrl(upstream, url.pathname, url.search), {
    method,
    headers: filterHeaders(request.headers),
    body,
    redirect: 'manual',
  });
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: filterHeaders(response.headers),
  });
}
