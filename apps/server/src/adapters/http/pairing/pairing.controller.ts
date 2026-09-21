import type { Hono } from 'hono';
import { redeemPairing, startPairing } from '../../../application/pairing/pairing-code.ts';
import { logger } from '../../../config/logger.ts';
import type { MachineConfigPort } from '../../../domain/machine-config.ts';
import { pairingRedeemBody } from './pairing.body.ts';
export type PairingControllerDeps = {
  machineConfig: MachineConfigPort;
};
export class PairingController {
  constructor(private readonly deps: PairingControllerDeps) {}
  register(app: Hono): void {
    app.post('/api/host/pair/start', (c) => {
      const started = startPairing();
      logger.info(
        { scope: 'pairing' },
        `pairing code ${started.code} expires ${started.expiresAt}`,
      );
      return c.json(started);
    });
    app.post('/api/host/pair/redeem', async (c) => {
      const body = pairingRedeemBody.parse(await c.req.json());
      const outcome = redeemPairing(body.code);
      if (outcome === 'no_challenge') {
        return c.json({ error: 'pairing_code_missing' }, 410);
      }
      if (outcome === 'expired') {
        return c.json({ error: 'pairing_code_expired' }, 410);
      }
      if (outcome === 'mismatch') {
        return c.json({ error: 'pairing_code_invalid' }, 401);
      }
      const host = this.deps.machineConfig.read().host;
      return c.json({
        hostId: host.id,
        name: host.name,
        listen: host.listen,
        credential: host.token,
      });
    });
  }
}
