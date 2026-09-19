import matter from 'gray-matter';
import type { SkillDocument } from '../../domain/skill.ts';
export class InvalidSkillFileError extends Error {
  readonly path: string;
  constructor(message: string, path: string) {
    super(message);
    this.name = 'InvalidSkillFileError';
    this.path = path;
  }
}
function requireFrontmatterString(
  data: Record<string, unknown>,
  key: string,
  fileLabel: string,
): string {
  const value = data[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new InvalidSkillFileError(
      `Skill file ${fileLabel}: frontmatter field "${key}" must be a non-empty string`,
      fileLabel,
    );
  }
  return value;
}
function optionalFrontmatterString(data: Record<string, unknown>, key: string): string | undefined {
  const value = data[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'string') {
    return undefined;
  }
  if (value.length === 0) {
    return undefined;
  }
  return value;
}
export function parseSkillFile(content: string, fileLabel: string): SkillDocument {
  let parsed: matter.GrayMatterFile<string>;
  try {
    parsed = matter(content);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    throw new InvalidSkillFileError(message, fileLabel);
  }
  const data = parsed.data;
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new InvalidSkillFileError(
      `Skill file ${fileLabel}: missing or invalid YAML frontmatter`,
      fileLabel,
    );
  }
  const record: Record<string, unknown> = { ...data };
  const name = requireFrontmatterString(record, 'name', fileLabel);
  const description = requireFrontmatterString(record, 'description', fileLabel);
  const whenToUse =
    optionalFrontmatterString(record, 'when_to_use') ??
    optionalFrontmatterString(record, 'whenToUse');
  const instructions = parsed.content.trim();
  if (instructions.length === 0) {
    throw new InvalidSkillFileError(
      `Skill file ${fileLabel}: instructions body is empty`,
      fileLabel,
    );
  }
  if (whenToUse === undefined) {
    return { name, description, instructions };
  }
  return { name, description, whenToUse, instructions };
}
