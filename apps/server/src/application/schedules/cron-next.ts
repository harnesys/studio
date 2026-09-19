import { Cron } from 'croner';

/** Next fire instant after `from` (exclusive of an exact match at `from`). */
export function nextCronRunAt(cron: string, from: Date = new Date()): string {
  const job = new Cron(cron.trim(), { paused: true });
  const next = job.nextRun(new Date(from.getTime() + 1));
  if (!next) {
    throw new Error(`cron has no next run: ${cron}`);
  }
  return next.toISOString();
}

export function isValidCron(cron: string): boolean {
  try {
    const job = new Cron(cron.trim(), { paused: true });
    return job.nextRun() != null;
  } catch {
    return false;
  }
}
