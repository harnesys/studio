import { z } from 'zod';

export const pairingRedeemBody = z.object({
  code: z.string().min(1),
});
