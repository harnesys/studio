import { DEFAULT_PORT } from './constants.ts';

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
  nodeEnv: process.env.NODE_ENV ?? 'development',
  production: process.env.NODE_ENV === 'production',
  port: readPort(process.env.PORT, DEFAULT_PORT),
  harnesysHome: process.env.HARNESYS_HOME?.trim() || undefined,
  bundledSkills: process.env.HARNESYS_BUNDLED_SKILLS?.trim() || undefined,
  STUDIO_INSTANCE_ID: process.env.STUDIO_INSTANCE_ID?.trim() || undefined,
  /** Console verbosity switch: dev shows trace-level by default, SERVER_TRACE=0 quiets it. */
  trace: readBool(process.env.SERVER_TRACE, true),
} as const;
