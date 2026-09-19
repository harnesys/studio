import type { PinRecord } from '@harnesys/studio-shared';
import { z } from 'zod';
export const pinFieldsSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1, 'Key required')
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/, 'Letters, digits, ., _, :, -'),
  text: z.string().trim().min(1, 'Text required'),
});
export type PinFieldsInput = z.input<typeof pinFieldsSchema>;
export type PinFieldsOutput = z.output<typeof pinFieldsSchema>;
export type PinDraft = {
  key: string;
  text: string;
};
export function emptyPinFields(): PinFieldsInput {
  return { key: '', text: '' };
}
export function pinFieldsFrom(pin: PinRecord): PinFieldsInput {
  return { key: pin.key, text: pin.text };
}
export function toPinDraft(values: PinFieldsOutput): PinDraft {
  return { key: values.key, text: values.text };
}
