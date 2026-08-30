import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';

function realpathOrResolve(target: string): string {
  try {
    return realpathSync(target);
  } catch {
    return path.resolve(target);
  }
}

function isWithin(workdir: string, resolved: string): boolean {
  if (resolved === workdir) return true;
  const prefix = workdir.endsWith(path.sep) ? workdir : `${workdir}${path.sep}`;
  return resolved.startsWith(prefix);
}

export function resolveWorkdirPath(cwd: string, target: string, root?: string): string {
  const workdir = realpathOrResolve(path.resolve(cwd));
  const jail = root ? realpathOrResolve(path.resolve(root)) : workdir;
  const absolute = path.isAbsolute(target) ? path.resolve(target) : path.resolve(workdir, target);

  if (!isWithin(jail, absolute) || !isWithin(workdir, absolute)) {
    throw new Error(`Path escapes workdir: ${target}`);
  }

  if (existsSync(absolute)) {
    const real = realpathOrResolve(absolute);
    if (!isWithin(jail, real) || !isWithin(workdir, real)) {
      throw new Error(`Path escapes workdir: ${target}`);
    }
    return real;
  }

  return absolute;
}
