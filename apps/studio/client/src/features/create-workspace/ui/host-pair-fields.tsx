import { useState } from 'react';
import { Button } from '@/shared/ui/button';
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldTitle } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { type StudioHost, useStudioHostsStore } from '../model/hosts.store';

/** Host linking inside the new workspace form. Pairing backend lands with remote-host v1. */
export function HostPairFields({ onPaired }: { onPaired: (host: StudioHost) => void }) {
  const pairHost = useStudioHostsStore((state) => state.pairHost);
  const [address, setAddress] = useState('');
  const [code, setCode] = useState('');
  const [pairing, setPairing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canPair = address.trim().length > 0 && code.trim().length > 0 && !pairing;

  const pair = () => {
    setPairing(true);
    setError(null);
    void pairHost({ address: address.trim(), code: code.trim() })
      .then((host) => onPaired(host))
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'Pairing failed');
      })
      .finally(() => setPairing(false));
  };

  return (
    <div
      className="rounded-lg border border-border/60 border-dashed bg-muted/30 p-3"
      data-testid="host-pair-fields"
    >
      <FieldTitle>Connect a new host</FieldTitle>
      <FieldGroup className="pt-2">
        <Field>
          <FieldLabel htmlFor="host-pair-address">Host address</FieldLabel>
          <Input
            id="host-pair-address"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            placeholder="100.64.0.5"
            autoComplete="off"
          />
        </Field>
        <FieldDescription>
          Run <code>harnesys host pair</code> on the new host and enter the code from its output.
          The code lives 10 minutes, one attempt.
        </FieldDescription>
        <Field>
          <FieldLabel htmlFor="host-pair-code">Pairing code</FieldLabel>
          <Input
            id="host-pair-code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="481 516"
            className="tracking-[0.2em]"
            autoComplete="off"
          />
        </Field>
      </FieldGroup>
      <div className="flex items-center gap-2 pt-2">
        <Button type="button" size="sm" disabled={!canPair} onClick={pair}>
          {pairing ? 'Pairing…' : 'Pair'}
        </Button>
        {error ? <span className="text-destructive text-xs">{error}</span> : null}
      </div>
    </div>
  );
}
