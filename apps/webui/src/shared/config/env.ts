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

export const env = {
  devServerPort: readPort(import.meta.env.VITE_DEV_SERVER_PORT, DEFAULT_DEV_SERVER_PORT),
  trace: readBool(import.meta.env.CLIENT_TRACE, false),
} as const;
