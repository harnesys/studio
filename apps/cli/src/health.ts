import { sleep } from './processes.ts';

const POLL_INTERVAL_MS = 300;
const ATTEMPT_TIMEOUT_MS = 2000;

/**
 * GET-only health probe loop: HEAD is not an option (the web gate answers 401 to
 * anything but GET /healthz). Resolves false after `timeoutMs`.
 */
export async function waitHealthy(url: string, timeoutMs = 15_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await healthyOnce(url)) {
      return true;
    }
    await sleep(POLL_INTERVAL_MS);
  }
  return false;
}

export async function healthyOnce(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
    });
    return response.ok;
  } catch {
    return false;
  }
}
