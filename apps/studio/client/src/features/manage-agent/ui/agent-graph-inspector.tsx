import './agent-graph-flow.css';

import type { Diagnostic, Edge, Node } from 'harnesys';

import { Field, FieldGroup, FieldLabel } from '@/shared/ui/field';
import { specByType } from '../model/agent-graph-catalog';
import { GraphInput } from './agent-graph-input';
import { AgentGraphNodeFields, JsonNodeEditor } from './agent-graph-node-fields';

export type AgentGraphSelection =
  | { kind: 'node'; id: string; node: Node }
  | { kind: 'edge'; index: number; edge: Edge }
  | null;

export type AgentGraphInspectorProps = {
  selection: AgentGraphSelection;
  diagnostics?: Diagnostic[];
  onChangeNode: (id: string, node: Node) => void;
  onRenameNode: (fromId: string, toId: string) => void;
  onChangeEdge: (index: number, edge: Edge) => void;
};

export function AgentGraphInspector({
  selection,
  diagnostics = [],
  onChangeNode,
  onRenameNode,
  onChangeEdge,
}: AgentGraphInspectorProps) {
  return (
    <aside className="agent-graph-inspector flex h-full w-64 shrink-0 flex-col overflow-hidden border-border border-l bg-popover">
      <div className="border-border border-b px-2.5 py-1.5">
        <p className="font-medium text-[10px] text-muted-foreground uppercase tracking-[0.08em]">
          Inspector
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-2">
        <InspectorBody
          selection={selection}
          onChangeNode={onChangeNode}
          onRenameNode={onRenameNode}
          onChangeEdge={onChangeEdge}
        />
      </div>
      {diagnostics.length > 0 ? (
        <div className="max-h-40 shrink-0 overflow-y-auto border-border border-t px-3 py-2">
          <p className="mb-1 font-medium text-[11px] text-muted-foreground uppercase tracking-[0.08em]">
            Diagnostics
          </p>
          <ul className="flex flex-col gap-1">
            {diagnostics.map((item) => (
              <li
                key={`${item.code}:${item.path ?? ''}:${item.message}`}
                className="text-[11px] text-destructive leading-snug"
              >
                {item.path ? `${item.path}: ` : null}
                {item.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </aside>
  );
}

function InspectorBody({
  selection,
  onChangeNode,
  onRenameNode,
  onChangeEdge,
}: {
  selection: AgentGraphSelection;
  onChangeNode: (id: string, node: Node) => void;
  onRenameNode: (fromId: string, toId: string) => void;
  onChangeEdge: (index: number, edge: Edge) => void;
}) {
  if (selection == null) {
    return <p className="text-muted-foreground text-sm">Select a node.</p>;
  }
  if (selection.kind === 'edge') {
    return (
      <EdgeWhenFields
        edge={selection.edge}
        onChange={(edge) => onChangeEdge(selection.index, edge)}
      />
    );
  }
  return (
    <NodeInspectorBody
      id={selection.id}
      node={selection.node}
      onChangeNode={onChangeNode}
      onRenameNode={onRenameNode}
    />
  );
}

function NodeInspectorBody({
  id,
  node,
  onChangeNode,
  onRenameNode,
}: {
  id: string;
  node: Node;
  onChangeNode: (id: string, node: Node) => void;
  onRenameNode: (fromId: string, toId: string) => void;
}) {
  const known = specByType(node.type) !== undefined;
  const isCustom = node.type.startsWith('custom:');

  if (!known || isCustom) {
    return (
      <FieldGroup className="gap-2">
        <Field>
          <FieldLabel htmlFor="graph-unknown-id" className="text-[11px]">
            Id
          </FieldLabel>
          <GraphInput
            id="graph-unknown-id"
            value={id}
            onChange={(event) => onRenameNode(id, event.target.value)}
            className="font-mono"
          />
        </Field>
        <JsonNodeEditor node={node} onChange={(next) => onChangeNode(id, next)} />
      </FieldGroup>
    );
  }

  return (
    <AgentGraphNodeFields
      id={id}
      node={node}
      onChangeId={(nextId) => onRenameNode(id, nextId)}
      onChange={(next) => onChangeNode(id, next)}
    />
  );
}

function EdgeWhenFields({ edge, onChange }: { edge: Edge; onChange: (edge: Edge) => void }) {
  return (
    <FieldGroup className="gap-2">
      <p className="font-mono text-[11px] text-muted-foreground">
        {edge.from} → {edge.to}
      </p>
      <Field>
        <FieldLabel htmlFor="graph-edge-when" className="text-[11px]">
          When (expr)
        </FieldLabel>
        <GraphInput
          id="graph-edge-when"
          value={edge.when ?? ''}
          placeholder="optional"
          onChange={(event) => {
            const value = event.target.value;
            if (value === '') {
              onChange({ from: edge.from, to: edge.to });
              return;
            }
            onChange({ from: edge.from, to: edge.to, when: value });
          }}
        />
      </Field>
    </FieldGroup>
  );
}
