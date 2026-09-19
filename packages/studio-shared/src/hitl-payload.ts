export type ConfirmPayload = {
  approved: boolean;
};
export type AskPayload = {
  text?: string;
  optionIds?: string[];
};
export type PermissionPayload = {
  approved: boolean;
};
export type HitlPayload = ConfirmPayload | AskPayload | PermissionPayload;
export function payloadForSource(
  source: string,
  input: {
    approved?: boolean;
    text?: string;
    optionIds?: string[];
  },
): HitlPayload {
  if (source === 'permission' || source === 'approve') {
    return { approved: input.approved ?? false };
  }
  return { text: input.text, optionIds: input.optionIds };
}
