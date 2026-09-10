import type { PackConfig } from '@harnesys/studio-shared';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { Textarea } from '@/shared/ui/textarea';

/** Studio-known pack specs until catalog exposes `specSchema` for a generic form. */
export const PACKS_WITH_SETTINGS = new Set(['files', 'shell']);

const DEFAULT_SHELL_TIMEOUT_MS = 30_000;
const DEFAULT_FILES_BLOCKLIST = [
  '.env',
  '.env.*',
  '**/.ssh/**',
  '**/.gnupg/**',
  '**/.aws/**',
  '**/id_rsa',
  '**/id_ed25519',
  '**/*.pem',
  '.git',
  '.svn',
  '.hg',
  'node_modules',
  'dist',
];

export function packHasSettings(name: string, catalogHasSettings: boolean): boolean {
  return catalogHasSettings || PACKS_WITH_SETTINGS.has(name);
}

export function PackSettingsFields({
  packName,
  config,
  onChange,
}: {
  packName: string;
  config: PackConfig;
  onChange: (next: PackConfig) => void;
}) {
  if (packName === 'files') {
    return <FilesSettings config={config} onChange={onChange} />;
  }
  if (packName === 'shell') {
    return <ShellSettings config={config} onChange={onChange} />;
  }
  return (
    <p className="text-[11px] text-muted-foreground leading-snug">
      No Studio form for this pack yet. Spec is stored as JSON on save.
    </p>
  );
}

function FilesSettings({
  config,
  onChange,
}: {
  config: PackConfig;
  onChange: (next: PackConfig) => void;
}) {
  const spec = config.spec ?? {};
  const root = typeof spec.root === 'string' ? spec.root : '';
  const blocklist = Array.isArray(spec.blocklist)
    ? spec.blocklist.filter((item): item is string => typeof item === 'string')
    : undefined;
  const blocklistText =
    blocklist === undefined ? DEFAULT_FILES_BLOCKLIST.join('\n') : blocklist.join('\n');

  function patchSpec(partial: Record<string, unknown>) {
    const nextSpec = { ...spec, ...partial };
    if (typeof nextSpec.root === 'string' && nextSpec.root.trim() === '') {
      delete nextSpec.root;
    }
    onChange({ spec: nextSpec });
  }

  return (
    <FieldGroup className="gap-2">
      <Field>
        <FieldLabel htmlFor="pack-files-root">Root</FieldLabel>
        <Input
          id="pack-files-root"
          placeholder="Thread workdir (default)"
          value={root}
          onChange={(event) => patchSpec({ root: event.target.value })}
        />
        <FieldDescription className="text-[11px] leading-snug">
          Optional path under the thread workdir. Empty keeps the workdir root.
        </FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor="pack-files-blocklist">Blocklist</FieldLabel>
        <Textarea
          id="pack-files-blocklist"
          className="min-h-28 font-mono text-[11px]"
          value={blocklistText}
          onChange={(event) => {
            const lines = event.target.value
              .split('\n')
              .map((line) => line.trim())
              .filter(Boolean);
            patchSpec({ blocklist: lines });
          }}
        />
        <FieldDescription className="text-[11px] leading-snug">
          One glob per line. Defaults match library `DEFAULT_PATH_BLOCKLIST`.
        </FieldDescription>
      </Field>
    </FieldGroup>
  );
}

function ShellSettings({
  config,
  onChange,
}: {
  config: PackConfig;
  onChange: (next: PackConfig) => void;
}) {
  const spec = config.spec ?? {};
  const timeout =
    typeof spec.timeout === 'number' && Number.isFinite(spec.timeout)
      ? spec.timeout
      : DEFAULT_SHELL_TIMEOUT_MS;

  return (
    <FieldGroup className="gap-2">
      <Field>
        <FieldLabel htmlFor="pack-shell-timeout">Default timeout (ms)</FieldLabel>
        <Input
          id="pack-shell-timeout"
          type="number"
          min={1}
          max={600_000}
          value={String(timeout)}
          onChange={(event) => {
            const raw = event.target.value.trim();
            if (raw === '') {
              onChange({ spec: { ...spec, timeout: DEFAULT_SHELL_TIMEOUT_MS } });
              return;
            }
            const next = Number(raw);
            if (!Number.isFinite(next)) {
              return;
            }
            onChange({
              spec: {
                ...spec,
                timeout: Math.min(600_000, Math.max(1, Math.trunc(next))),
              },
            });
          }}
        />
        <FieldDescription className="text-[11px] leading-snug">
          Used when the tool call omits `timeout_ms`. Cap 600000. Default 30000.
        </FieldDescription>
      </Field>
    </FieldGroup>
  );
}
