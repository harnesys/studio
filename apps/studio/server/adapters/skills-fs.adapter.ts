import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CreateWorkspaceSkillRequest } from '../../shared/types.ts';
import { SKILL_NAME_RE } from '../config/constants.ts';
import { ConflictError, ValidationError } from '../domain/studio.error.ts';
import { workspaceSkillsPath } from './store/studio-layout.ts';

/** Create `<workspace>/.harnesys/skills/<name>/SKILL.md`. Folder name matches frontmatter name. */
export function createWorkspaceSkillFile(
  workspacePath: string,
  input: CreateWorkspaceSkillRequest,
): void {
  if (!SKILL_NAME_RE.test(input.name)) {
    throw new ValidationError('skill name must be kebab-case ([a-z0-9][a-z0-9-]*)');
  }
  if (input.description.trim().length === 0) {
    throw new ValidationError('description is required');
  }
  if (input.instructions.trim().length === 0) {
    throw new ValidationError('instructions is required');
  }

  const skillDir = join(workspaceSkillsPath(workspacePath), input.name);
  if (existsSync(skillDir)) {
    throw new ConflictError(`skill ${input.name} already exists`);
  }

  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, 'SKILL.md'), formatSkillMarkdown(input), 'utf8');
}

function formatSkillMarkdown(input: CreateWorkspaceSkillRequest): string {
  const lines = [
    '---',
    `name: ${yamlString(input.name)}`,
    `description: ${yamlString(input.description)}`,
  ];
  if (input.whenToUse !== undefined && input.whenToUse.length > 0) {
    lines.push(`when_to_use: ${yamlString(input.whenToUse)}`);
  }
  lines.push('---', '', input.instructions.trim(), '');
  return lines.join('\n');
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}
