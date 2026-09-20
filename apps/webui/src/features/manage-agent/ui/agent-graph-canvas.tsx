import './agent-graph-flow.css';
import {
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  type Connection,
  type EdgeChange,
  type NodeChange,
  ReactFlow,
  useReactFlow,
} from '@xyflow/react';
import { Maximize2Icon, MinusIcon, PlusIcon } from 'lucide-react';
import { useCallback } from 'react';
import { Button } from '@/shared/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/shared/ui/toggle-group';
import type {
  AgentGraphFlowEdge,
  AgentGraphFlowNode,
  GraphRankdir,
} from '../model/agent-graph-document';
import { layoutGraph } from '../model/agent-graph-layout';
import { AgentGraphNode } from './agent-graph-node';
import { AGENT_GRAPH_DND_TYPE } from './agent-graph-palette';

const NODE_TYPES = { 'agent-graph-node': AgentGraphNode };
const DEFAULT_EDGE_OPTIONS = { type: 'default' as const };
export type AgentGraphCanvasProps = {
  nodes: AgentGraphFlowNode[];
  edges: AgentGraphFlowEdge[];
  rankdir: GraphRankdir;
  onNodesChange: (nodes: AgentGraphFlowNode[]) => void;
  onEdgesChange: (edges: AgentGraphFlowEdge[]) => void;
  onRankdirChange: (rankdir: GraphRankdir) => void;
  onDropType: (
    type: string,
    position: {
      x: number;
      y: number;
    },
  ) => void;
  onSelectionChange: (selection: { nodeIds: string[]; edgeIds: string[] }) => void;
};
export function AgentGraphCanvas({
  nodes,
  edges,
  rankdir,
  onNodesChange,
  onEdgesChange,
  onRankdirChange,
  onDropType,
  onSelectionChange,
}: AgentGraphCanvasProps) {
  const { screenToFlowPosition, fitView, zoomIn, zoomOut } = useReactFlow();
  const handleNodesChange = useCallback(
    (changes: NodeChange<AgentGraphFlowNode>[]) => {
      onNodesChange(applyNodeChanges(changes, nodes));
    },
    [nodes, onNodesChange],
  );
  const handleEdgesChange = useCallback(
    (changes: EdgeChange<AgentGraphFlowEdge>[]) => {
      onEdgesChange(applyEdgeChanges(changes, edges));
    },
    [edges, onEdgesChange],
  );
  const isValidConnection = useCallback(
    (connection: Connection | AgentGraphFlowEdge) => {
      const source = nodes.find((node) => node.id === connection.source);
      const target = nodes.find((node) => node.id === connection.target);
      if (!source || !target) {
        return false;
      }
      if (source.data.spec.type === 'core:end') {
        return false;
      }
      if (target.data.spec.type === 'core:start') {
        return false;
      }
      return true;
    },
    [nodes],
  );
  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) {
        return;
      }
      if (!isValidConnection(connection)) {
        return;
      }
      const id = `e-${Date.now()}-${connection.source}-${connection.target}`;
      onEdgesChange([
        ...edges,
        {
          id,
          source: connection.source,
          target: connection.target,
          data: {},
        },
      ]);
    },
    [edges, isValidConnection, onEdgesChange],
  );
  const runAutoLayout = useCallback(() => {
    const positions = layoutGraph(
      nodes.map((node) => ({ id: node.id })),
      edges.map((edge) => ({ source: edge.source, target: edge.target })),
      rankdir,
    );
    onNodesChange(
      nodes.map((node) => ({
        ...node,
        position: positions[node.id] ?? node.position,
        data: { ...node.data, rankdir },
      })),
    );
    requestAnimationFrame(() => {
      void fitView({ padding: 0.2, duration: 200 });
    });
  }, [edges, fitView, nodes, onNodesChange, rankdir]);
  const setRankdir = useCallback(
    (next: GraphRankdir) => {
      onRankdirChange(next);
      onNodesChange(
        nodes.map((node) => ({
          ...node,
          data: { ...node.data, rankdir: next },
        })),
      );
    },
    [nodes, onNodesChange, onRankdirChange],
  );
  return (
    <div className="agent-graph-flow absolute inset-0 min-h-0 min-w-0">
      <div className="pointer-events-auto absolute right-2 bottom-2 z-20 flex items-center gap-1.5">
        <Button
          type="button"
          size="xs"
          variant="outline"
          className="h-6"
          onClick={() => {
            void zoomOut({ duration: 200 });
          }}
        >
          <MinusIcon />
        </Button>
        <Button
          type="button"
          size="xs"
          variant="outline"
          className="h-6"
          onClick={() => {
            void zoomIn({ duration: 200 });
          }}
        >
          <PlusIcon />
        </Button>
        <Button
          type="button"
          size="xs"
          variant="outline"
          className="h-6"
          onClick={() => {
            void fitView({ padding: 0.2, duration: 200 });
          }}
        >
          <Maximize2Icon />
        </Button>
        <Button type="button" size="xs" variant="outline" className="h-6" onClick={runAutoLayout}>
          Auto
        </Button>
        <ToggleGroup
          variant="segment"
          size="sm"
          value={[rankdir]}
          onValueChange={(value) => {
            const next = value[0];
            if (next === 'TB' || next === 'LR') {
              setRankdir(next);
            }
          }}
        >
          <ToggleGroupItem value="TB" className="h-6 min-h-6 min-w-6 px-2 text-[11px]">
            TB
          </ToggleGroupItem>
          <ToggleGroupItem value="LR" className="h-6 min-h-6 min-w-6 px-2 text-[11px]">
            LR
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      <ReactFlow
        className="h-full w-full bg-background"
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        defaultEdgeOptions={DEFAULT_EDGE_OPTIONS}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        deleteKeyCode={['Backspace', 'Delete']}
        fitView
        proOptions={{ hideAttribution: true }}
        onSelectionChange={({ nodes: selectedNodes, edges: selectedEdges }) => {
          onSelectionChange({
            nodeIds: selectedNodes.map((node) => node.id),
            edgeIds: selectedEdges.map((edge) => edge.id),
          });
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'copy';
        }}
        onDrop={(event) => {
          event.preventDefault();
          const type = event.dataTransfer.getData(AGENT_GRAPH_DND_TYPE);
          if (!type) {
            return;
          }
          const position = screenToFlowPosition({
            x: event.clientX,
            y: event.clientY,
          });
          onDropType(type, position);
        }}
      >
        <Background gap={16} size={1} />
      </ReactFlow>
    </div>
  );
}
