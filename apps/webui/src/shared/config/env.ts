import { DEFAULT_DEV_SERVER_PORT } from './constants';

function readPort(raw: string | undefined, fallback: number): number {
  const value = Number(raw ?? fallback);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function readBool(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }
  const value = raw.trim().toLowerCase();
  if (value === 'true' || value === '1') {
    return true;
  }
  if (value === 'false' || value === '0') {
    return false;
  }
  return fallback;
}

function readString(raw: string | undefined, fallback: string): string {
  const value = raw?.trim();
  return value ? value : fallback;
}

export const env = {
  devServerPort: readPort(import.meta.env.VITE_DEV_SERVER_PORT, DEFAULT_DEV_SERVER_PORT),
  trace: readBool(import.meta.env.CLIENT_TRACE, false),
  /** Running inside a Tauri webview (packaged desktop): no same-origin API proxy. */
  isTauri: typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window,
  /**
   * Absolute origin of the local host API. Desktop build targets 127.0.0.1:47474
   * directly (override at build time with CLIENT_HOST_ORIGIN); web builds keep
   * window.location.origin so harnesys-web / vite proxy keep fronting the API.
   */
  localHostOrigin: readString(
    import.meta.env.CLIENT_HOST_ORIGIN,
    typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
      ? 'http://127.0.0.1:47474'
      : window.location.origin,
  ),
} as const;

/** ws(s)://host:port base derived from localHostOrigin (terminal, LSP bridge). */
export function hostWsBase(): string {
  const url = new URL(env.localHostOrigin);
  const proto = url.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${url.host}`;
}
