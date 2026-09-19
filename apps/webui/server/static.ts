import { statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';

const MIME: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};
function notFound(): Response {
  return new Response('not found', { status: 404 });
}
function mimeTypeOf(path: string): string {
  return MIME[extname(path).toLowerCase()] ?? 'application/octet-stream';
}
export type StaticHandler = (pathname: string) => Promise<Response>;
export function createStaticHandler(staticDir: string): StaticHandler {
  const root = resolve(staticDir);
  return async (pathname: string) => {
    let relative: string;
    try {
      relative = decodeURIComponent(pathname);
    } catch {
      return new Response('bad request', { status: 400 });
    }
    const candidate = normalize(join(root, relative));
    if (candidate !== root && !candidate.startsWith(root + sep)) {
      return new Response('forbidden', { status: 403 });
    }
    let target = candidate;
    if (statSync(target, { throwIfNoEntry: false })?.isDirectory()) {
      target = join(target, 'index.html');
    }
    if (!(await Bun.file(target).exists())) {
      if (extname(relative) !== '') {
        return notFound();
      }
      target = join(root, 'index.html');
      if (!(await Bun.file(target).exists())) {
        return notFound();
      }
    }
    return new Response(Bun.file(target), {
      headers: { 'content-type': mimeTypeOf(target) },
    });
  };
}
