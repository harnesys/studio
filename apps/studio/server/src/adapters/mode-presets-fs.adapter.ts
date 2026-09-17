import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { isAbsolute, join, resolve, sep } from 'node:path';
import { MODE_ID_RE, type ModePreset, type PackAssignment } from '@harnesys/studio-shared';
import { z } from 'zod';
import { ValidationError } from '../domain/studio.error.ts';
import { bundledAssetsPath, bundledPresetsPath, systemPresetsPath } from './store/studio-layout.ts';

/** PackAssignment-литералы как в HTTP-body (`agent.body.ts:8-11`): `true`/объект =
 *  вкл, `false`/`null`/отсутствие = выкл; `true` нормализуется в `{}`, `false` —
 *  в `null`. Массивы строк больше не принимаются (миграция `capability_set_v1`). */
const packsBody = z
  .record(
    z.string(),
    z
      .union([
        z.literal(true),
        z.literal(false),
        z.object({ spec: z.record(z.string(), z.unknown()).optional() }),
        z.null(),
      ])
      .transform(toStoredAssignment),
  )
  .optional();

function toStoredAssignment(value: true | false | PackAssignment | null): PackAssignment | null {
  if (value === true) {
    return {};
  }
  if (value === false || value === null) {
    return null;
  }
  return value;
}

const modePresetBodySchema = z.object({
  id: z.string().regex(MODE_ID_RE),
  name: z.string().trim().min(1),
  description: z.string().optional(),
  instructions: z.string().optional(),
  instructionsFile: z.string().optional(),
  skills: z.array(z.string()).optional(),
  packs: packsBody,
  permissions: z.record(z.string(), z.enum(['allow', 'ask', 'deny'])).optional(),
  installedByDefault: z.boolean().default(false),
});

type ModePresetRoot = { dir: string; builtin: boolean };

/** Preset roots, ascending precedence (home shadows bundle). Bundled rows are builtin. */
function presetRoots(): ModePresetRoot[] {
  return [
    { dir: bundledPresetsPath('modes'), builtin: true },
    { dir: systemPresetsPath('modes'), builtin: false },
  ];
}

function presetIdsIn(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => name.slice(0, -'.json'.length))
    .filter((id) => MODE_ID_RE.test(id));
}

/**
 * Read mode presets from bundled app assets (`apps/studio/assets/presets/modes`) and
 * `~/.harnesys/presets/modes` (id = filename stem). A same-id preset in home shadows the
 * bundled one and loads as non-builtin — only while it parses: a broken home file is
 * skipped with a warning (the bundled copy survives), a broken bundled file still throws.
 * `instructionsFile` is a path relative to the Studio assets root;
 * `builtinModePresetSeed()` wraps this for bootstrap.
 */
export function readModePresets(
  onSkip: (message: string) => void = (message) => console.warn(message),
): Omit<ModePreset, 'workspaceId' | 'createdAt' | 'updatedAt'>[] {
  const byId = new Map<string, Omit<ModePreset, 'workspaceId' | 'createdAt' | 'updatedAt'>>();
  for (const root of presetRoots()) {
    for (const id of presetIdsIn(root.dir)) {
      const path = join(root.dir, `${id}.json`);
      try {
        byId.set(id, parsePreset(id, path, root.builtin));
      } catch (err) {
        if (root.builtin) {
          throw err;
        }
        onSkip(
          `[presets] mode preset "${id}" skipped (${path}): ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function parsePreset(
  id: string,
  path: string,
  builtin: boolean,
): Omit<ModePreset, 'workspaceId' | 'createdAt' | 'updatedAt'> {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new ValidationError(
      `invalid mode preset JSON ${id}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const parsed = modePresetBodySchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(`invalid mode preset ${id}: ${parsed.error.message}`);
  }
  const body = parsed.data;
  if (body.id !== id) {
    throw new ValidationError(`mode preset id mismatch: ${id} vs ${body.id}`);
  }
  if (body.instructions !== undefined && body.instructionsFile !== undefined) {
    throw new ValidationError(`mode preset ${id}: set only one of instructions/instructionsFile`);
  }
  const instructions = body.instructionsFile
    ? readInstructionsFile(id, body.instructionsFile)
    : body.instructions;
  return {
    id,
    name: body.name,
    ...(body.description !== undefined ? { description: body.description } : {}),
    ...(instructions !== undefined ? { instructions } : {}),
    ...(body.skills !== undefined ? { skills: body.skills } : {}),
    ...(body.packs !== undefined ? { packs: body.packs } : {}),
    ...(body.permissions !== undefined ? { permissions: body.permissions } : {}),
    installedByDefault: body.installedByDefault,
    builtin,
  };
}

/** Instructions text from a file under the Studio assets root (`plan` preset ships `plan-mode.md`). */
function readInstructionsFile(id: string, rel: string): string {
  const root = bundledAssetsPath();
  const path = resolve(root, rel);
  if (isAbsolute(rel) || !path.startsWith(`${root}${sep}`)) {
    throw new ValidationError(`mode preset ${id}: instructionsFile escapes assets root: ${rel}`);
  }
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (err) {
    throw new ValidationError(
      `mode preset ${id}: instructionsFile ${rel}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  return text.trim();
}
