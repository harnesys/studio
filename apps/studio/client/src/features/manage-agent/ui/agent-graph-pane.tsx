import '@xyflow/react/dist/style.css';

import { ReactFlowProvider } from '@xyflow/react';
import type { Diagnostic, Edge, Node } from 'harnesys';
import { useCallback, useEffect, useRef, useState } from 'react';

import { nextNodeId, specByType } from '../model/agent-graph-catalog';
import {
  type AgentGraphFlowEdge,
  type AgentGraphFlowNode,
  defaultReactGraph,
  fromFlow,
  type GraphRankdir,
  type StudioGraphDocument,
  toFlow,
} from '../model/agent-graph-document';
import { layoutGraph } from '../model/agent-graph-layout';
import { AgentGraphCanvas } from './agent-graph-canvas';
import { AgentGraphInspector, type AgentGraphSelection } from './agent-graph-inspector';
import { AgentGraphPalette } from './agent-graph-palette';

export type AgentGraphPaneProps = {
  value?: StudioGraphDocument | null;
  onChange?: (doc: StudioGraphDocument) => void;
  diagnostics?: Diagnostic[];
};

export function AgentGraphPane(props: AgentGraphPaneProps) {
  return (
    <ReactFlowProvider>
      <AgentGraphPaneInner {...props} />
    </ReactFlowProvider>
  );
}

function AgentGraphPaneInner({ value, onChange, diagnostics = [] }: AgentGraphPaneProps) {
  const [initialDoc] = useState(() => ensurePositions(value ?? defaultReactGraph()));
  const [nodes, setNodes] = useState<AgentGraphFlowNode[]>(() => toFlow(initialDoc).nodes);
  const [edges, setEdges] = useState<AgentGraphFlowEdge[]>(() => toFlow(initialDoc).edges);
  const [rankdir, setRankdir] = useState<GraphRankdir>(initialDoc.layout?.rankdir ?? 'TB');
  const [selection, setSelection] = useState<AgentGraphSelection>(null);
  const seeded = useRef(false);

  useEffect(() => {
    if (seeded.current) {
      return;
    }
    seeded.current = true;
    const doc = ensurePositions(value ?? defaultReactGraph());
    onChange?.(doc);
  }, [onChange, value]);

  const emit = useCallback(
    (
      nextNodes: AgentGraphFlowNode[],
      nextEdges: AgentGraphFlowEdge[],
      nextRankdir: GraphRankdir,
    ) => {
      onChange?.(fromFlow(nextNodes, nextEdges, nextRankdir));
    },
    [onChange],
  );

  const replaceNodes = useCallback(
    (next: AgentGraphFlowNode[]) => {
      setNodes(next);
      emit(next, edges, rankdir);
    },
    [edges, emit, rankdir],
  );

  const replaceEdges = useCallback(
    (next: AgentGraphFlowEdge[]) => {
      setEdges(next);
      emit(nodes, next, rankdir);
    },
    [emit, nodes, rankdir],
  );

  const addNode = useCallback(
    (type: string, position?: { x: number; y: number }) => {
      const catalog = specByType(type);
      if (!catalog) {
        return;
      }
      const id = nextNodeId(
        type,
        nodes.map((node) => node.id),
      );
      const nextNode: AgentGraphFlowNode = {
        id,
        type: 'agent-graph-node',
        position: position ?? { x: 80 + nodes.length * 24, y: 80 + nodes.length * 16 },
        data: { spec: catalog.defaults(), rankdir },
      };
      const nextNodes = [...nodes, nextNode];
      const nextEdges = withDefaultEdges(nodes, edges, nextNode);
      setNodes(nextNodes);
      setEdges(nextEdges);
      emit(nextNodes, nextEdges, rankdir);
    },
    [edges, emit, nodes, rankdir],
  );

  const onChangeNode = useCallback(
    (id: string, node: Node) => {
      const nextNodes = nodes.map((item) =>
        item.id === id ? { ...item, data: { ...item.data, spec: node } } : item,
      );
      setNodes(nextNodes);
      emit(nextNodes, edges, rankdir);
      setSelection({ kind: 'node', id, node });
    },
    [edges, emit, nodes, rankdir],
  );

  const onRenameNode = useCallback(
    (fromId: string, toId: string) => {
      const trimmed = toId.trim();
      if (trimmed === '' || trimmed === fromId) {
        return;
      }
      if (nodes.some((node) => node.id === trimmed)) {
        return;
      }
      const nextNodes = nodes.map((node) => (node.id === fromId ? { ...node, id: trimmed } : node));
      const nextEdges = edges.map((edge) => ({
        ...edge,
        source: edge.source === fromId ? trimmed : edge.source,
        target: edge.target === fromId ? trimmed : edge.target,
      }));
      setNodes(nextNodes);
      setEdges(nextEdges);
      emit(nextNodes, nextEdges, rankdir);
      const renamed = nextNodes.find((node) => node.id === trimmed);
      if (renamed) {
        setSelection({ kind: 'node', id: trimmed, node: renamed.data.spec });
      }
    },
    [edges, emit, nodes, rankdir],
  );

  const onChangeEdge = useCallback(
    (index: number, edge: Edge) => {
      const current = edges[index];
      if (!current) {
        return;
      }
      const nextEdges = edges.map((item, i) =>
        i === index
          ? {
              ...item,
              source: edge.from,
              target: edge.to,
              data: edge.when !== undefined ? { when: edge.when } : {},
            }
          : item,
      );
      setEdges(nextEdges);
      emit(nodes, nextEdges, rankdir);
      setSelection({ kind: 'edge', index, edge });
    },
    [edges, emit, nodes, rankdir],
  );

  const onSelectionChange = useCallback(
    ({ nodeIds, edgeIds }: { nodeIds: string[]; edgeIds: string[] }) => {
      if (nodeIds.length === 1) {
        const node = nodes.find((item) => item.id === nodeIds[0]);
        if (node) {
          setSelection({ kind: 'node', id: node.id, node: node.data.spec });
          return;
        }
      }
      if (edgeIds.length === 1) {
        const index = edges.findIndex((item) => item.id === edgeIds[0]);
        const flowEdge = edges[index];
        if (flowEdge) {
          setSelection({
            kind: 'edge',
            index,
            edge: {
              from: flowEdge.source,
              to: flowEdge.target,
              ...(flowEdge.data?.when !== undefined ? { when: flowEdge.data.when } : {}),
            },
          });
          return;
        }
      }
      setSelection(null);
    },
    [edges, nodes],
  );

  const onRankdirChange = useCallback(
    (next: GraphRankdir) => {
      setRankdir(next);
      emit(nodes, edges, next);
    },
    [edges, emit, nodes],
  );

  return (
    <div className="relative min-h-0 w-full min-w-0 flex-1 overflow-hidden rounded-md border border-border">
      <AgentGraphCanvas
        nodes={nodes}
        edges={edges}
        rankdir={rankdir}
        onNodesChange={replaceNodes}
        onEdgesChange={replaceEdges}
        onRankdirChange={onRankdirChange}
        onDropType={(type, position) => addNode(type, position)}
        onSelectionChange={onSelectionChange}
      />
      <div className="pointer-events-none absolute inset-0 z-10">
        <div className="pointer-events-auto absolute top-2 bottom-2 left-2 flex min-h-0 w-48 flex-col overflow-hidden rounded-lg border border-border/80 bg-popover/95 shadow-md backdrop-blur-sm">
          <AgentGraphPalette onAdd={(type) => addNode(type)} />
        </div>
        <div className="pointer-events-auto absolute top-2 right-2 bottom-2 flex min-h-0 w-64 flex-col overflow-hidden rounded-lg border border-border/80 bg-popover/95 shadow-md backdrop-blur-sm">
          <AgentGraphInspector
            selection={selection}
            diagnostics={diagnostics}
            onChangeNode={onChangeNode}
            onRenameNode={onRenameNode}
            onChangeEdge={onChangeEdge}
          />
        </div>
      </div>
    </div>
  );
}

function withDefaultEdges(
  nodes: AgentGraphFlowNode[],
  edges: AgentGraphFlowEdge[],
  added: AgentGraphFlowNode,
): AgentGraphFlowEdge[] {
  const type = added.data.spec.type;
  if (type === 'core:start') {
    return edges;
  }
  const source =
    nodes.find((node) => node.data.spec.type === 'core:start') ??
    nodes.find((node) => node.data.spec.type !== 'core:end');
  if (!source) {
    return edges;
  }
  const defaultOut = edges.find(
    (edge) => edge.source === source.id && (edge.data?.when === undefined || edge.data.when === ''),
  );
  const stamp = Date.now();
  if (defaultOut && type !== 'core:end') {
    return [
      ...edges.filter((edge) => edge.id !== defaultOut.id),
      {
        id: `e-${stamp}-${source.id}-${added.id}`,
        source: source.id,
        target: added.id,
        data: {},
      },
      {
        id: `e-${stamp}-${added.id}-${defaultOut.target}`,
        source: added.id,
        target: defaultOut.target,
        data: defaultOut.data ?? {},
      },
    ];
  }
  return [
    ...edges,
    {
      id: `e-${stamp}-${source.id}-${added.id}`,
      source: source.id,
      target: added.id,
      data: {},
    },
  ];
}

function ensurePositions(doc: StudioGraphDocument): StudioGraphDocument {
  const rankdir = doc.layout?.rankdir ?? 'TB';
  const positions = doc.layout?.positions;
  const nodeIds = Object.keys(doc.nodes);
  const hasAll = positions !== undefined && nodeIds.every((id) => positions[id] !== undefined);
  if (hasAll && positions) {
    return {
      ...doc,
      layout: { rankdir, positions },
    };
  }
  const laidOut = layoutGraph(
    nodeIds.map((id) => ({ id })),
    doc.edges.map((edge) => ({ source: edge.from, target: edge.to })),
    rankdir,
  );
  return {
    ...doc,
    layout: { rankdir, positions: laidOut },
  };
}
