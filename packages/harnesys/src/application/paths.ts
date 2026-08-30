import type { PathsConfig } from '../ports/paths.ts';

export type ResolvedPaths = {
  allow: string[];
  cwd: string;
};

function intersectArrays(arrays: string[][]): string[] {
  if (arrays.length === 0) {
    return [];
  }
  if (arrays.length === 1) {
    return arrays[0] as string[];
  }
  let result = arrays[0] as string[];
  for (let i = 1; i < arrays.length; i++) {
    const next = arrays[i] as string[];
    result = result.filter((p) => next.some((n) => p.startsWith(n) || n.startsWith(p)));
  }
  return result;
}

export function resolvePaths(
  agentPaths?: PathsConfig,
  runtimePaths?: PathsConfig,
  sessionPaths?: PathsConfig,
): ResolvedPaths {
  const allowArrays: string[][] = [];
  if (agentPaths?.allow) {
    allowArrays.push(agentPaths.allow);
  }
  if (runtimePaths?.allow) {
    allowArrays.push(runtimePaths.allow);
  }
  if (sessionPaths?.allow) {
    allowArrays.push(sessionPaths.allow);
  }

  const allow = intersectArrays(allowArrays);

  const cwd =
    sessionPaths?.cwd ??
    agentPaths?.cwd ??
    runtimePaths?.cwd ??
    (allow[0] as string | undefined) ??
    process.cwd();

  if (allow.length > 0 && !allow.some((a) => cwd.startsWith(a) || a.startsWith(cwd))) {
    throw new Error(`cwd "${cwd}" is not under any allowed path`);
  }

  return { allow, cwd };
}
