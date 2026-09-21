const TTL_MS = 10 * 60 * 1000;
export type PairingStartResult = {
  code: string;
  expiresAt: string;
};
type PairingChallenge = {
  code: string;
  expiresAtMs: number;
};
let active: PairingChallenge | null = null;
export function startPairing(): PairingStartResult {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAtMs = Date.now() + TTL_MS;
  active = { code, expiresAtMs };
  return { code, expiresAt: new Date(expiresAtMs).toISOString() };
}
export type PairingRedeemOutcome = 'ok' | 'no_challenge' | 'expired' | 'mismatch';
export function redeemPairing(code: string): PairingRedeemOutcome {
  const challenge = active;
  active = null;
  if (!challenge) {
    return 'no_challenge';
  }
  if (Date.now() > challenge.expiresAtMs) {
    return 'expired';
  }
  const normalized = code.replace(/\s+/g, '').trim();
  if (normalized !== challenge.code) {
    return 'mismatch';
  }
  return 'ok';
}
