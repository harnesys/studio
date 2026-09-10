import { isAbsolute, join, relative, resolve } from 'node:path';
import { ValidationError } from '../../domain/studio.error.ts';

/** Resolve a workspace-relative path and reject escapes outside the root. */
export function resolveWorkspaceRelPath(workspaceRoot: string, relPath: string): string {
  const rel = relPath.replace(/^\/+/, '').replaceAll('\\', '/');
  if (!rel || rel.includes('\0') || rel.split('/').includes('..')) {
    throw new ValidationError('invalid path');
  }

  const absPath = resolve(join(workspaceRoot, rel));
  const fromRoot = relative(resolve(workspaceRoot), absPath);
  if (!fromRoot || fromRoot.startsWith('..') || isAbsolute(fromRoot)) {
    throw new ValidationError('path outside workspace');
  }

  return absPath;
}
