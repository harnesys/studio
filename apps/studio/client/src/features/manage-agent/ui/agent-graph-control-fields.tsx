import type { InterruptReason, JsonSchema, Node } from 'harnesys';

import { Field, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { Textarea } from '@/shared/ui/textarea';

import { ConcurrencyField, concurrencyString } from './agent-graph-concurrency-field';

const INTERRUPT_REASONS: InterruptReason[] = [
  'human_review',
  'policy',
  'uncertain_effect',
  'definition_migrated',
  'work',
  'wait',
];

type ControlNode = Extract<
  Node,
  | { type: 'control:assign' }
  | { type: 'control:spawn' }
  | { type: 'control:handoff' }
  | { type: 'control:goto' }
  | { type: 'control:interrupt' }
>;

export function ControlNodeFields({
  node,
  onChange,
}: {
  node: ControlNode;
  onChange: (node: Node) => void;
}) {
  switch (node.type) {
    case 'control:assign':
      return (
        <Field>
          <FieldLabel htmlFor="graph-assign-patch">Patch (JSON)</FieldLabel>
          <Textarea
            id="graph-assign-patch"
            className="min-h-24 font-mono text-xs"
            value={safeJson(node.patch)}
            onChange={(event) => {
              const parsed = tryParseObject(event.target.value);
              if (parsed !== undefined) {
                onChange({ type: 'control:assign', patch: parsed });
              }
            }}
          />
        </Field>
      );
    case 'control:spawn':
      return (
        <>
          <Field>
            <FieldLabel htmlFor="graph-spawn-calls">Calls (expr)</FieldLabel>
            <Input
              id="graph-spawn-calls"
              value={node.calls}
              onChange={(event) =>
                onChange({
                  type: 'control:spawn',
                  calls: event.target.value,
                  concurrency: node.concurrency,
                })
              }
            />
          </Field>
          <ConcurrencyField
            value={concurrencyString(node.concurrency)}
            onChange={(concurrency) =>
              onChange({ type: 'control:spawn', calls: node.calls, concurrency })
            }
          />
        </>
      );
    case 'control:handoff':
      return (
        <>
          <Field>
            <FieldLabel htmlFor="graph-handoff-agent">Agent id</FieldLabel>
            <Input
              id="graph-handoff-agent"
              value={typeof node.agentId === 'string' ? node.agentId : String(node.agentId)}
              onChange={(event) =>
                onChange({
                  type: 'control:handoff',
                  agentId: event.target.value,
                  input: node.input,
                })
              }
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="graph-handoff-input">Input (expr or JSON)</FieldLabel>
            <Textarea
              id="graph-handoff-input"
              className="min-h-20 font-mono text-xs"
              value={inputAsText(node.input)}
              onChange={(event) => {
                onChange({
                  type: 'control:handoff',
                  agentId: node.agentId,
                  input: parseInputField(event.target.value),
                });
              }}
            />
          </Field>
        </>
      );
    case 'control:goto':
      return (
        <Field>
          <FieldLabel htmlFor="graph-goto-target">Target (expr)</FieldLabel>
          <Input
            id="graph-goto-target"
            value={typeof node.target === 'string' ? node.target : String(node.target)}
            onChange={(event) => onChange({ type: 'control:goto', target: event.target.value })}
          />
        </Field>
      );
    case 'control:interrupt':
      return (
        <>
          <Field>
            <FieldLabel htmlFor="graph-interrupt-reason">Reason</FieldLabel>
            <Select
              value={node.reason}
              onValueChange={(value) => {
                if (value == null || !isInterruptReason(value)) {
                  return;
                }
                onChange({
                  type: 'control:interrupt',
                  reason: value,
                  resumeSchema: node.resumeSchema,
                });
              }}
            >
              <SelectTrigger id="graph-interrupt-reason" className="w-full" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INTERRUPT_REASONS.map((reason) => (
                  <SelectItem key={reason} value={reason}>
                    {reason}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="graph-interrupt-schema">Resume schema (JSON)</FieldLabel>
            <Textarea
              id="graph-interrupt-schema"
              className="min-h-24 font-mono text-xs"
              value={safeJson(node.resumeSchema)}
              onChange={(event) => {
                const parsed = tryParseJsonSchema(event.target.value);
                if (parsed !== undefined) {
                  onChange({
                    type: 'control:interrupt',
                    reason: node.reason,
                    resumeSchema: parsed,
                  });
                }
              }}
            />
          </Field>
        </>
      );
  }
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '';
  }
}

function tryParseObject(raw: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function tryParseJsonSchema(raw: string): JsonSchema | undefined {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as JsonSchema;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function inputAsText(input: unknown): string {
  if (typeof input === 'string') {
    return input;
  }
  return safeJson(input);
}

function parseInputField(raw: string): string | Record<string, unknown> {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    const obj = tryParseObject(trimmed);
    if (obj !== undefined) {
      return obj;
    }
  }
  return raw;
}

function isInterruptReason(value: string): value is InterruptReason {
  return (INTERRUPT_REASONS as string[]).includes(value);
}
