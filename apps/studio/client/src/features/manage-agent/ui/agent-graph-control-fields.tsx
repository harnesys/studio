import type { Node } from 'harnesys';

import { Field, FieldLabel } from '@/shared/ui/field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { Textarea } from '@/shared/ui/textarea';

import { ConcurrencyField, concurrencyString } from './agent-graph-concurrency-field';
import {
  INTERRUPT_REASONS,
  inputAsText,
  isInterruptReason,
  parseInputField,
  safeJson,
  tryParseJsonSchema,
  tryParseObject,
  tryParseStringArray,
} from './agent-graph-control-parse';
import { GraphInput } from './agent-graph-input';

type ControlNode = Extract<
  Node,
  | { type: 'control:assign' }
  | { type: 'control:spawn' }
  | { type: 'control:handoff' }
  | { type: 'control:goto' }
  | { type: 'control:map' }
  | { type: 'control:yield' }
  | { type: 'control:wait' }
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
            <GraphInput
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
            <GraphInput
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
          <GraphInput
            id="graph-goto-target"
            value={typeof node.target === 'string' ? node.target : String(node.target)}
            onChange={(event) => onChange({ type: 'control:goto', target: event.target.value })}
          />
        </Field>
      );
    case 'control:map':
      return (
        <>
          <Field>
            <FieldLabel htmlFor="graph-map-items">Items (expr)</FieldLabel>
            <GraphInput
              id="graph-map-items"
              value={node.items}
              onChange={(event) =>
                onChange({
                  ...node,
                  type: 'control:map',
                  items: event.target.value,
                })
              }
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="graph-map-enter">Enter (node id)</FieldLabel>
            <GraphInput
              id="graph-map-enter"
              value={node.enter}
              onChange={(event) =>
                onChange({
                  ...node,
                  type: 'control:map',
                  enter: event.target.value,
                })
              }
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="graph-map-body">Body (JSON string[])</FieldLabel>
            <Textarea
              id="graph-map-body"
              className="min-h-20 font-mono text-xs"
              value={safeJson(node.body)}
              onChange={(event) => {
                const parsed = tryParseStringArray(event.target.value);
                if (parsed !== undefined) {
                  onChange({ ...node, type: 'control:map', body: parsed });
                }
              }}
            />
          </Field>
          <ConcurrencyField
            value={concurrencyString(node.concurrency)}
            onChange={(concurrency) => onChange({ ...node, type: 'control:map', concurrency })}
          />
          <Field>
            <FieldLabel htmlFor="graph-map-instruction">
              Instruction (template, $item/$index, optional)
            </FieldLabel>
            <Textarea
              id="graph-map-instruction"
              className="min-h-20 font-mono text-xs"
              value={node.instruction ?? ''}
              onChange={(event) => {
                const raw = event.target.value;
                if (!raw.trim()) {
                  const { instruction: _i, ...rest } = node;
                  onChange({ ...rest, type: 'control:map' });
                  return;
                }
                onChange({ ...node, type: 'control:map', instruction: raw });
              }}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="graph-map-maxtokens">Max tokens per item (optional)</FieldLabel>
            <GraphInput
              id="graph-map-maxtokens"
              value={node.maxTokensPerItem !== undefined ? String(node.maxTokensPerItem) : ''}
              onChange={(event) => {
                const raw = event.target.value.trim();
                if (!raw) {
                  const { maxTokensPerItem: _m, ...rest } = node;
                  onChange({ ...rest, type: 'control:map' });
                  return;
                }
                const n = Number(raw);
                if (Number.isInteger(n) && n >= 1) {
                  onChange({ ...node, type: 'control:map', maxTokensPerItem: n });
                }
              }}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="graph-map-timeout">Timeout ms (optional)</FieldLabel>
            <GraphInput
              id="graph-map-timeout"
              value={node.timeoutMs !== undefined ? String(node.timeoutMs) : ''}
              onChange={(event) => {
                const raw = event.target.value.trim();
                if (!raw) {
                  const { timeoutMs: _t, onTimeout: _o, ...rest } = node;
                  onChange({ ...rest, type: 'control:map' });
                  return;
                }
                const n = Number(raw);
                if (Number.isFinite(n) && n > 0) {
                  onChange({ ...node, type: 'control:map', timeoutMs: n });
                }
              }}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="graph-map-ontimeout">On timeout</FieldLabel>
            <Select
              value={node.onTimeout ?? 'fail'}
              onValueChange={(value) => {
                if (value !== 'fail' && value !== 'partial') {
                  return;
                }
                onChange({ ...node, type: 'control:map', onTimeout: value });
              }}
            >
              <SelectTrigger id="graph-map-ontimeout" className="w-full" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fail">fail</SelectItem>
                <SelectItem value="partial">partial</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </>
      );
    case 'control:yield':
      return (
        <Field>
          <FieldLabel htmlFor="graph-yield-value">Value (expr, optional)</FieldLabel>
          <GraphInput
            id="graph-yield-value"
            value={typeof node.value === 'string' ? node.value : ''}
            onChange={(event) => {
              const v = event.target.value.trim();
              if (!v) {
                onChange({ type: 'control:yield' });
                return;
              }
              onChange({ type: 'control:yield', value: event.target.value });
            }}
          />
        </Field>
      );
    case 'control:wait':
      return (
        <>
          <Field>
            <FieldLabel htmlFor="graph-wait-delay">Delay ms (sleep)</FieldLabel>
            <GraphInput
              id="graph-wait-delay"
              value={node.delayMs !== undefined ? String(node.delayMs) : ''}
              onChange={(event) => {
                const raw = event.target.value.trim();
                if (!raw) {
                  const { delayMs: _d, ...rest } = node;
                  onChange({ ...rest, type: 'control:wait' });
                  return;
                }
                const n = Number(raw);
                if (Number.isFinite(n) && n >= 1) {
                  const { untilMs: _u, timeoutMs: _t, onTimeout: _o, ...rest } = node;
                  onChange({ ...rest, type: 'control:wait', delayMs: n });
                }
              }}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="graph-wait-until">Until ms (expr, sleep)</FieldLabel>
            <GraphInput
              id="graph-wait-until"
              value={typeof node.untilMs === 'string' ? node.untilMs : ''}
              onChange={(event) => {
                const v = event.target.value.trim();
                if (!v) {
                  const { untilMs: _u, ...rest } = node;
                  onChange({ ...rest, type: 'control:wait' });
                  return;
                }
                const { delayMs: _d, timeoutMs: _t, onTimeout: _o, ...rest } = node;
                onChange({ ...rest, type: 'control:wait', untilMs: event.target.value });
              }}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="graph-wait-timeout">Gate timeout ms</FieldLabel>
            <GraphInput
              id="graph-wait-timeout"
              value={node.timeoutMs !== undefined ? String(node.timeoutMs) : ''}
              onChange={(event) => {
                const raw = event.target.value.trim();
                if (!raw) {
                  const { timeoutMs: _t, onTimeout: _o, ...rest } = node;
                  onChange({ ...rest, type: 'control:wait' });
                  return;
                }
                const n = Number(raw);
                if (Number.isFinite(n) && n >= 1) {
                  const { delayMs: _d, untilMs: _u, ...rest } = node;
                  onChange({ ...rest, type: 'control:wait', timeoutMs: n });
                }
              }}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="graph-wait-schema">Resume schema (JSON, gate)</FieldLabel>
            <Textarea
              id="graph-wait-schema"
              className="min-h-20 font-mono text-xs"
              value={safeJson(node.resumeSchema ?? { type: 'object' })}
              onChange={(event) => {
                const parsed = tryParseJsonSchema(event.target.value);
                if (parsed !== undefined) {
                  const { delayMs: _d, untilMs: _u, ...rest } = node;
                  onChange({ ...rest, type: 'control:wait', resumeSchema: parsed });
                }
              }}
            />
          </Field>
        </>
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
