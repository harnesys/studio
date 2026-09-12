import type { Hono } from 'hono';
import type { CreateModePresetInput } from '../../../application/mode-presets/create-mode-preset.use-case.ts';
import type { DeleteModePresetInput } from '../../../application/mode-presets/delete-mode-preset.use-case.ts';
import type { ListModePresetsInput } from '../../../application/mode-presets/list-mode-presets.use-case.ts';
import type { UpdateModePresetInput } from '../../../application/mode-presets/update-mode-preset.use-case.ts';
import { modePresetBody, modePresetPatchBody } from './mode-preset.body.ts';

export type ModePresetControllerDeps = {
  listModePresets: ListModePresetsInput;
  createModePreset: CreateModePresetInput;
  updateModePreset: UpdateModePresetInput;
  deleteModePreset: DeleteModePresetInput;
};

export class ModePresetController {
  constructor(private readonly deps: ModePresetControllerDeps) {}

  register(app: Hono): void {
    app.get('/api/mode-presets', async (c) => {
      return c.json(await this.deps.listModePresets.execute());
    });

    app.post('/api/mode-presets', async (c) => {
      const body = modePresetBody.parse(await c.req.json());
      const created = await this.deps.createModePreset.execute({
        id: body.id,
        name: body.name,
        description: body.description,
        instructions: body.instructions,
        skills: body.skills,
        packs: body.packs,
        permissions: body.permissions,
        installedByDefault: body.installedByDefault,
      });
      return c.json(created, 201);
    });

    app.patch('/api/mode-presets/:id', async (c) => {
      const body = modePresetPatchBody.parse(await c.req.json());
      const preset = await this.deps.updateModePreset.execute({
        id: c.req.param('id'),
        name: body.name,
        description: body.description,
        instructions: body.instructions,
        skills: body.skills,
        packs: body.packs,
        permissions: body.permissions,
        installedByDefault: body.installedByDefault,
      });
      return c.json(preset);
    });

    app.delete('/api/mode-presets/:id', async (c) => {
      await this.deps.deleteModePreset.execute({ id: c.req.param('id') });
      return c.body(null, 204);
    });
  }
}
