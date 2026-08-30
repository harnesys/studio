import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  ATTACHMENTS_DIR,
  HOME_DIR_NAME,
  STUDIO_DIR,
  WORKSPACES_DIR,
} from '../../config/constants.ts';
import { env } from '../../config/env.ts';

export {
  ATTACHMENTS_DIR,
  DB_FILE,
  HOME_DIR_NAME,
  STUDIO_DIR,
  WORKSPACES_DIR,
} from '../../config/constants.ts';

export function defaultHomePath(): string {
  return env.harnesysHome ?? join(homedir(), HOME_DIR_NAME);
}

export function defaultWorkspacePath(home: string, name: string): string {
  const slug = name.replace(/[/\\]/g, '-').replace(/^\.+/, '').trim() || 'workspace';
  return join(home, WORKSPACES_DIR, slug);
}

export function studioDir(workspacePath: string): string {
  return join(workspacePath, STUDIO_DIR);
}

export function attachmentsDir(workspacePath: string, threadId: string): string {
  return join(studioDir(workspacePath), 'threads', threadId, ATTACHMENTS_DIR);
}
