import type {
  HostNetworkAddress,
  HostNetworkResponse,
  PairingStartResponse,
} from '@harnesys/studio-shared';
import { useEffect, useState } from 'react';
import { Button } from '@/shared/ui/button';
import { FieldDescription, FieldTitle } from '@/shared/ui/field';
import { useStudioHostsStore } from '../model/hosts.store';

function formatPairingCode(code: string): string {
  return code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
}

function PairingCountdown({ expiresAt }: { expiresAt: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const remainingMs = Math.max(0, new Date(expiresAt).getTime() - now);
  const totalSeconds = Math.floor(remainingMs / 1000);
  if (totalSeconds === 0) {
    return <span className="text-destructive">expired</span>;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return (
    <span>
      expires in {minutes}:{seconds}
    </span>
  );
}

function renderAddressText(address: HostNetworkAddress, port: number): string {
  return address.scope === 'external' ? address.address : `http://${address.address}:${port}`;
}

function NetworkRow({ address, port }: { address: HostNetworkAddress; port: number }) {
  const [copied, setCopied] = useState(false);
  const text = renderAddressText(address, port);
  const copy = () => {
    void navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {});
  };
  return (
    <button type="button" onClick={copy} className="text-left font-mono text-xs hover:underline">
      {address.scope === 'vpn' ? <span>VPN </span> : null}
      {text}
      {address.scope === 'external' ? <span> needs port forwarding or VPN</span> : null}
      {copied ? <span> Copied</span> : null}
    </button>
  );
}

function NetworkBlock({ info }: { info: HostNetworkResponse }) {
  if (info.addresses.length === 0 && info.mdnsName === null) {
    return null;
  }
  return (
    <div className="flex flex-col gap-1 pt-2">
      <div className="text-xs">Connect from another machine</div>
      {info.addresses.map((address) => (
        <NetworkRow
          key={`${address.scope}:${address.address}`}
          address={address}
          port={info.port}
        />
      ))}
      {info.mdnsName ? (
        <div className="text-muted-foreground text-xs">
          or {info.mdnsName}:{info.port} if both machines are on the same network
        </div>
      ) : null}
    </div>
  );
}

export function HostPairingCodeCard() {
  const showPairingCode = useStudioHostsStore((state) => state.showPairingCode);
  const fetchNetworkInfo = useStudioHostsStore((state) => state.fetchNetworkInfo);
  const [pairing, setPairing] = useState<PairingStartResponse | null>(null);
  const [network, setNetwork] = useState<HostNetworkResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reveal = () => {
    setLoading(true);
    setError(null);
    void fetchNetworkInfo()
      .then((response) => setNetwork(response))
      .catch(() => {});
    void showPairingCode()
      .then((response) => setPairing(response))
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'Failed to show pairing code');
      })
      .finally(() => setLoading(false));
  };
  return (
    <div
      className="rounded-lg border border-border/60 bg-muted/30 p-3"
      data-testid="host-pairing-code-card"
    >
      <FieldTitle>Pairing code for this machine</FieldTitle>
      {pairing ? (
        <div className="flex flex-col gap-1 pt-2">
          <div className="font-medium font-mono text-3xl tracking-[0.25em]">
            {formatPairingCode(pairing.code)}
          </div>
          <div className="text-muted-foreground text-xs">
            <PairingCountdown expiresAt={pairing.expiresAt} />
          </div>
          {network ? <NetworkBlock info={network} /> : null}
          <FieldDescription>
            Enter this code on the machine that connects to this one.
          </FieldDescription>
        </div>
      ) : (
        <div className="pt-2">
          <Button type="button" size="sm" disabled={loading} onClick={reveal}>
            {loading ? 'Loading…' : 'Show pairing code'}
          </Button>
        </div>
      )}
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
    </div>
  );
}
