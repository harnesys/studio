import { createHash, timingSafeEqual } from 'node:crypto';

export const WEB_COOKIE = 'harnesys_web_token';

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

/** Timing-safe token comparison: digests have constant length regardless of input. */
export function tokenMatches(expected: string, candidate: string | undefined): boolean {
  if (!candidate) {
    return false;
  }
  return timingSafeEqual(digest(expected), digest(candidate));
}

export function readWebCookie(request: Request): string | undefined {
  const header = request.headers.get('cookie');
  if (!header) {
    return undefined;
  }
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) {
      continue;
    }
    if (part.slice(0, eq).trim() === WEB_COOKIE) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

export function bearerToken(request: Request): string | undefined {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) {
    return undefined;
  }
  return header.slice('Bearer '.length).trim() || undefined;
}

/** Cookie OR `Authorization: Bearer` — the two access routes pinned by the brief. */
export function isAuthorized(request: Request, token: string): boolean {
  return tokenMatches(token, readWebCookie(request)) || tokenMatches(token, bearerToken(request));
}

function loginHtml(withError: boolean): string {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>harnesys-web</title></head>
<body style="font-family: system-ui, sans-serif; max-width: 22rem; margin: 20vh auto; text-align: center">
<h1>harnesys</h1>
<p>Access token required.</p>
${withError ? '<p style="color: #b00">Invalid token.</p>\n' : ''}<form method="post" action="/login">
<input type="password" name="token" placeholder="Token" autofocus required
  style="width: 100%; padding: 0.5rem; box-sizing: border-box">
<button type="submit" style="margin-top: 0.75rem; padding: 0.5rem 1.5rem">Sign in</button>
</form>
</body>
</html>`;
}

export function loginPage(withError = false): Response {
  return new Response(loginHtml(withError), {
    status: 401,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

export function unauthorizedJson(): Response {
  return Response.json({ error: 'unauthorized' }, { status: 401 });
}

/** POST /login handler: validates the posted token, sets the gate cookie, redirects to /. */
export async function handleLogin(request: Request, token: string): Promise<Response> {
  let candidate: unknown = null;
  try {
    candidate = (await request.formData()).get('token');
  } catch {
    candidate = null;
  }
  if (typeof candidate !== 'string' || !tokenMatches(token, candidate)) {
    return loginPage(true);
  }
  const cookie = `${WEB_COOKIE}=${encodeURIComponent(candidate)}; HttpOnly; SameSite=Lax; Path=/`;
  return new Response(null, { status: 303, headers: { location: '/', 'set-cookie': cookie } });
}
