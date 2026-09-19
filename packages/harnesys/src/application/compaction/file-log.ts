import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { resolveWorkdirPath } from '../../adapters/actions/path-resolve.ts';
import type { CompactionMessage } from '../../domain/compaction.ts';
import type { PathsConfig } from '../../ports/paths.ts';
export function compactionFileName(iso: string): string {
  return `${iso.replaceAll(':', '-')}.md`;
}
export function compactionRelPath(sessionId: string, fileName: string): string {
  return `.harnesys/threads/${sessionId}/compactions/${fileName}`;
}
export function compactionFileBody(message: CompactionMessage, modelLabel: string): string {
  const header = [
    `# ${message.createdAt}`,
    `- id: ${message.id}`,
    `- reason: ${message.reason}`,
    `- covered: msgs ${message.coveredFrom}-${message.coveredUntil}`,
    `- tokens: ${message.stats.tokensBefore} → ${message.stats.tokensAfter}`,
    `- model: ${modelLabel}`,
  ].join('\n');
  return `${header}\n\n${message.content}\n`;
}
export async function writeCompactionFile(input: {
  paths?: PathsConfig;
  sessionId: string;
  message: CompactionMessage;
  modelLabel: string;
}): Promise<string | null> {
  const cwd = input.paths?.cwd;
  if (!cwd) {
    return null;
  }
  const rel = compactionRelPath(input.sessionId, compactionFileName(input.message.createdAt));
  const absolute = resolveWorkdirPath(cwd, rel);
  let target = absolute;
  if (await Bun.file(target).exists()) {
    target = absolute.replace(/\.md$/, `-${crypto.randomUUID().slice(0, 4)}.md`);
  }
  await mkdir(path.dirname(target), { recursive: true });
  await Bun.write(target, compactionFileBody(input.message, input.modelLabel));
  return rel;
}
