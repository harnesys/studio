import type { ToolCallGate } from '../../ports/tools.ts';
import { firstMatchingCommandPattern } from './command-glob.ts';
export function gateShellCommand(
  input: unknown,
  allowlist: readonly string[],
  blocklist: readonly string[],
): ToolCallGate | undefined {
  const command =
    typeof (
      input as {
        command?: unknown;
      }
    )?.command === 'string'
      ? (
          input as {
            command: string;
          }
        ).command
      : '';
  if (command.length === 0) {
    return undefined;
  }
  const blocked = firstMatchingCommandPattern(command, blocklist);
  if (blocked !== undefined) {
    return {
      decision: 'deny',
      reason: `command blocked by shell blocklist (${blocked}): ${command}`,
    };
  }
  if (allowlist.length > 0) {
    const allowed = firstMatchingCommandPattern(command, allowlist);
    if (allowed !== undefined) {
      return { decision: 'allow' };
    }
  }
  return undefined;
}
