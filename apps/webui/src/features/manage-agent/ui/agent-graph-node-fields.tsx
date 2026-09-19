import type { Node, ToolCallBatch } from 'harnesys';
import { Field, FieldGroup, FieldLabel } from '@/shared/ui/field';
import { Textarea } from '@/shared/ui/textarea';
import { ConcurrencyField, concurrencyString } from './agent-graph-concurrency-field';
import { ControlNodeFields } from './agent-graph-control-fields';
import { GraphInput } from './agent-graph-input';
export type AgentGraphNodeFieldsProps = {
  id: string;
  node: Node;
  onChangeId: (nextId: string) => void;
  onChange: (node: Node) => void;
};
export function AgentGraphNodeFields({
  id,
  node,
  onChangeId,
  onChange,
}: AgentGraphNodeFieldsProps) {
  return (
    <FieldGroup className="gap-2">
      <Field>
        <FieldLabel htmlFor="graph-node-id" className="text-[11px]">
          Id
        </FieldLabel>
        <GraphInput
          id="graph-node-id"
          value={id}
          onChange={(event) => onChangeId(event.target.value)}
          className="font-mono"
        />
      </Field>
      <NodeTypeFields node={node} onChange={onChange} />
    </FieldGroup>
  );
}
function NodeTypeFields({ node, onChange }: { node: Node; onChange: (node: Node) => void }) {
  switch (node.type) {
    case 'core:start':
      return <p className="text-[11px] text-muted-foreground">Start has no configurable fields.</p>;
    case 'core:end':
      return (
        <Field>
          <FieldLabel htmlFor="graph-end-output">Output (expr)</FieldLabel>
          <GraphInput
            id="graph-end-output"
            value={typeof node.output === 'string' ? node.output : ''}
            placeholder="optional"
            onChange={(event) => {
              const value = event.target.value;
              onChange(value === '' ? { type: 'core:end' } : { type: 'core:end', output: value });
            }}
          />
        </Field>
      );
    case 'llm:generate':
      return (
        <>
          <Field>
            <FieldLabel htmlFor="graph-llm-prompt">Prompt</FieldLabel>
            <GraphInput
              id="graph-llm-prompt"
              value={node.prompt}
              onChange={(event) => onChange({ ...node, prompt: event.target.value })}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="graph-llm-messages">Messages (expr)</FieldLabel>
            <GraphInput
              id="graph-llm-messages"
              value={typeof node.messages === 'string' ? node.messages : ''}
              onChange={(event) => {
                const value = event.target.value;
                onChange(
                  value === ''
                    ? { type: 'llm:generate', prompt: node.prompt, tools: node.tools }
                    : {
                        type: 'llm:generate',
                        prompt: node.prompt,
                        messages: value,
                        tools: node.tools,
                      },
                );
              }}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="graph-llm-tools">Tools (comma-separated)</FieldLabel>
            <GraphInput
              id="graph-llm-tools"
              value={(node.tools ?? []).join(', ')}
              placeholder="empty = no tools"
              onChange={(event) => {
                const tools = event.target.value
                  .split(',')
                  .map((part) => part.trim())
                  .filter((part) => part.length > 0);
                onChange({
                  type: 'llm:generate',
                  prompt: node.prompt,
                  ...(node.messages !== undefined ? { messages: node.messages } : {}),
                  ...(tools.length > 0 ? { tools } : {}),
                });
              }}
            />
          </Field>
        </>
      );
    case 'tool:call': {
      if (!isToolCallBatch(node)) {
        return <JsonNodeEditor node={node} onChange={onChange} />;
      }
      const batch = node;
      return (
        <>
          <Field>
            <FieldLabel htmlFor="graph-tool-calls">Calls (expr)</FieldLabel>
            <GraphInput
              id="graph-tool-calls"
              value={batch.calls}
              onChange={(event) =>
                onChange({
                  type: 'tool:call',
                  calls: event.target.value,
                  concurrency: batch.concurrency,
                })
              }
            />
          </Field>
          <ConcurrencyField
            value={concurrencyString(batch.concurrency)}
            onChange={(concurrency) =>
              onChange({ type: 'tool:call', calls: batch.calls, concurrency })
            }
          />
        </>
      );
    }
    case 'control:assign':
    case 'control:spawn':
    case 'control:handoff':
    case 'control:goto':
    case 'control:map':
    case 'control:yield':
    case 'control:wait':
    case 'control:interrupt':
      return <ControlNodeFields node={node} onChange={onChange} />;
    default:
      return <JsonNodeEditor node={node} onChange={onChange} />;
  }
}
export function JsonNodeEditor({ node, onChange }: { node: Node; onChange: (node: Node) => void }) {
  return (
    <Field>
      <FieldLabel htmlFor="graph-node-json">Node (JSON)</FieldLabel>
      <Textarea
        id="graph-node-json"
        className="min-h-40 font-mono text-xs"
        value={safeJson(node)}
        onChange={(event) => {
          const parsed = tryParseNode(event.target.value);
          if (parsed !== undefined) {
            onChange(parsed);
          }
        }}
      />
    </Field>
  );
}
function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '';
  }
}
function isToolCallBatch(node: Node): node is ToolCallBatch {
  if (node.type !== 'tool:call') {
    return false;
  }
  return 'calls' in node && typeof node.calls === 'string';
}
function tryParseNode(raw: string): Node | undefined {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      'type' in parsed &&
      typeof (
        parsed as {
          type: unknown;
        }
      ).type === 'string'
    ) {
      return parsed as Node;
    }
  } catch {
    return undefined;
  }
  return undefined;
}
