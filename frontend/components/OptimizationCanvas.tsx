"use client";
import { useCallback } from "react";
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  type Node,
  type Edge,
  type Connection,
  Handle,
  Position,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

interface Props {
  nodes: Node[];
  edges: Edge[];
}

function ActionNode({ data }: { data: any }) {
  return (
    <div className="bg-slate-800 border-2 border-brand-500/80 rounded-xl px-4 py-3 min-w-[150px] shadow-lg shadow-brand-500/10">
      <Handle type="target" position={Position.Left} className="!bg-brand-400" />
      <p className="text-[10px] uppercase tracking-wider text-brand-400 font-medium mb-0.5">
        {data.type || "step"}
      </p>
      <p className="text-sm text-white font-semibold leading-tight">{data.label}</p>
      {data.metric && (
        <p className="text-xs text-amber-400/90 mt-1.5 font-mono">{data.metric}</p>
      )}
      <Handle type="source" position={Position.Right} className="!bg-brand-400" />
    </div>
  );
}

function AutomationNode({ data }: { data: any }) {
  return (
    <div className="bg-emerald-950/80 border-2 border-emerald-500/70 rounded-xl px-4 py-3 min-w-[150px] shadow-lg shadow-emerald-500/10">
      <Handle type="target" position={Position.Left} className="!bg-emerald-400" />
      <p className="text-[10px] uppercase tracking-wider text-emerald-400 font-medium mb-0.5">
        {data.type || "automation"}
      </p>
      <p className="text-sm text-white font-semibold leading-tight">{data.label}</p>
      {data.tool && (
        <p className="text-xs text-slate-400 mt-1.5">via {data.tool}</p>
      )}
      <Handle type="source" position={Position.Right} className="!bg-emerald-400" />
    </div>
  );
}

const nodeTypes = {
  action: ActionNode,
  automation: AutomationNode,
};

export function OptimizationCanvas({ nodes: initialNodes, edges: initialEdges }: Props) {
  const [nodes, , onNodesChange] = useNodesState(initialNodes || []);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges || []);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({ ...params, animated: true }, eds)),
    [setEdges]
  );

  return (
    <div className="h-full w-full rounded-xl border border-slate-800 bg-slate-950/60 overflow-hidden">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
      >
        <Controls className="!bg-slate-900 !border-slate-700 !shadow-none" />
        <MiniMap
          nodeColor={(node) => (node.type === "automation" ? "#10b981" : "#3b82f6")}
          maskColor="rgba(15, 23, 42, 0.8)"
          className="!bg-slate-900 !border-slate-700"
        />
        <Background color="#1e293b" gap={20} size={1} />
      </ReactFlow>
    </div>
  );
}
