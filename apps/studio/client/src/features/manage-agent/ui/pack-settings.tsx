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
      No Studio form for this pack yet.
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
          placeholder="Workspace (default)"
          value={root}
          onChange={(event) => patchSpec({ root: event.target.value })}
        />
        <FieldDescription className="text-[11px] leading-snug">
          Empty inherits the workspace thread workdir. Set a path to override for this agent.
        </FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor="pack-files-blocklist">Blocklist</FieldLabel>
        <Textarea
          id="pack-files-blocklist"
          className="min-h-28 font-mono text-[11px]"
          value={blocklistText}
          onChange={(event) => {
            patchSpec({ blocklist: linesFromTextarea(event.target.value) });
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
  const allowlist = stringList(spec.allowlist);
  const blocklist = stringList(spec.blocklist);

  function patchSpec(partial: Record<string, unknown>) {
    const nextSpec = { ...spec, ...partial };
    for (const key of ['allowlist', 'blocklist'] as const) {
      const value = nextSpec[key];
      if (Array.isArray(value) && value.length === 0) {
        delete nextSpec[key];
      }
    }
    onChange({ spec: nextSpec });
  }

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
              patchSpec({ timeout: DEFAULT_SHELL_TIMEOUT_MS });
              return;
            }
            const next = Number(raw);
            if (!Number.isFinite(next)) {
              return;
            }
            patchSpec({ timeout: Math.min(600_000, Math.max(1, Math.trunc(next))) });
          }}
        />
        <FieldDescription className="text-[11px] leading-snug">
          Used when the tool call omits `timeout_ms`. Cap 600000. Default 30000.
        </FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor="pack-shell-allowlist">Allowlist</FieldLabel>
        <Textarea
          id="pack-shell-allowlist"
          className="min-h-20 font-mono text-[11px]"
          placeholder={'git status\ngit diff*\nbun test*'}
          value={allowlist.join('\n')}
          onChange={(event) => {
            patchSpec({ allowlist: linesFromTextarea(event.target.value) });
          }}
        />
        <FieldDescription className="text-[11px] leading-snug">
          One pattern per line on the full command (`*` / `?` wildcards; bare line is exact). Match
          skips confirmation. Empty keeps the normal permission ask.
        </FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor="pack-shell-blocklist">Blocklist</FieldLabel>
        <Textarea
          id="pack-shell-blocklist"
          className="min-h-20 font-mono text-[11px]"
          placeholder={'*rm -rf*\n*mkfs*\nsudo *'}
          value={blocklist.join('\n')}
          onChange={(event) => {
            patchSpec({ blocklist: linesFromTextarea(event.target.value) });
          }}
        />
        <FieldDescription className="text-[11px] leading-snug">
          Same matching. Hit is a hard deny before permission ask; the agent gets the blocked reason
          (covers `ls && rm -rf /` via `*rm -rf*`).
        </FieldDescription>
      </Field>
    </FieldGroup>
  );
}

function linesFromTextarea(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string');
}
