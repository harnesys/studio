import type { CapabilityConfig } from '@studio/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { workspaceCapabilitiesQuery } from '@/shared/api';
import { Switch } from '@/shared/ui/switch';

export function DraftCapabilityPacks({
  workspaceId,
  value,
  onChange,
}: {
  workspaceId: string;
  value: Record<string, CapabilityConfig | null>;
  onChange: (next: Record<string, CapabilityConfig | null>) => void;
}) {
  const [packs, setPacks] = useState(value);
  const query = useQuery({
    ...workspaceCapabilitiesQuery(workspaceId),
    enabled: Boolean(workspaceId),
  });
  const catalog = (query.data?.capabilities ?? []).filter((pack) => !pack.name.endsWith('-memory'));

  function toggle(name: string, enable: boolean) {
    const next = { ...packs, [name]: enable ? (packs[name] ?? {}) : null };
    setPacks(next);
    onChange(next);
  }

  return (
    <section className="flex flex-col gap-2">
      <h3 className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
        Capability packs
      </h3>
      {!query.isPending &&
        (catalog.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">No capability packs.</p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {catalog.map((pack) => (
              <div key={pack.name} className="flex items-start gap-2">
                <Switch
                  size="sm"
                  className="mt-0.5"
                  checked={isPackEnabled(packs, pack.name)}
                  onCheckedChange={(next) => toggle(pack.name, Boolean(next))}
                />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-[12px] leading-snug">
                    {pack.name} v{pack.version} — {pack.description}
                  </p>
                  {pack.toolNames.length > 0 ? (
                    <p className="truncate text-[11px] text-muted-foreground leading-snug">
                      {pack.toolNames.join(', ')}
                    </p>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ))}
    </section>
  );
}

/**
 * Runtime truth: absent key is default-on for `skills` only, off for the rest;
 * explicit null is off; explicit spec or {} is on.
 */
function isPackEnabled(value: Record<string, CapabilityConfig | null>, name: string): boolean {
  const config = value[name];
  if (config === undefined) {
    return name === 'skills';
  }
  return config != null;
}
