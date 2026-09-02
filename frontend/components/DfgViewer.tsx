"use client";

import { useMemo } from "react";
import type { DfgEdge } from "@/types";

interface Props {
  dfg: DfgEdge[];
  startActivities?: Record<string, number>;
  endActivities?: Record<string, number>;
}

/**
 * Lightweight force-free circular DFG renderer using pure SVG.
 * Good enough for moderate graphs without heavy dependencies.
 */
export function DfgViewer({ dfg, startActivities = {}, endActivities = {} }: Props) {
  const { nodes, edges, maxCount } = useMemo(() => {
    const nodeSet = new Set<string>();
    let max = 1;
    dfg.forEach((e) => {
      nodeSet.add(e.source);
      nodeSet.add(e.target);
      if (e.count > max) max = e.count;
    });
    Object.keys(startActivities).forEach((k) => nodeSet.add(k));
    Object.keys(endActivities).forEach((k) => nodeSet.add(k));
    const list = Array.from(nodeSet);
    return { nodes: list, edges: dfg, maxCount: max };
  }, [dfg, startActivities, endActivities]);

  const size = 640;
  const cx = size / 2;
  const cy = size / 2;
  const radius = Math.min(size / 2 - 80, 40 + nodes.length * 8);

  const positions = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    nodes.forEach((n, i) => {
      const angle = (2 * Math.PI * i) / Math.max(nodes.length, 1) - Math.PI / 2;
      map.set(n, {
        x: cx + radius * Math.cos(angle),
        y: cy + radius * Math.sin(angle),
      });
    });
    return map;
  }, [nodes, cx, cy, radius]);

  if (nodes.length === 0) {
    return (
      <p className="text-sm text-slate-400 py-8 text-center">
        No process model to display.
      </p>
    );
  }

  return (
    <div className="w-full overflow-auto rounded-xl border border-slate-800 bg-slate-950/50">
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="w-full max-w-3xl mx-auto"
        style={{ minHeight: 400 }}
      >
        <defs>
          <marker
            id="arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#64748b" />
          </marker>
        </defs>

        {edges.map((e, i) => {
          const s = positions.get(e.source);
          const t = positions.get(e.target);
          if (!s || !t) return null;
          const strokeW = 1 + (e.count / maxCount) * 4;
          // Slight curve for self-loops
          if (e.source === e.target) {
            return (
              <path
                key={i}
                d={`M ${s.x} ${s.y - 18} C ${s.x + 40} ${s.y - 60}, ${s.x - 40} ${s.y - 60}, ${s.x} ${s.y - 18}`}
                fill="none"
                stroke="#64748b"
                strokeWidth={strokeW}
                markerEnd="url(#arrow)"
              />
            );
          }
          const dx = t.x - s.x;
          const dy = t.y - s.y;
          const len = Math.sqrt(dx * dx + dy * dy) || 1;
          const nx = dx / len;
          const ny = dy / len;
          const startX = s.x + nx * 28;
          const startY = s.y + ny * 28;
          const endX = t.x - nx * 28;
          const endY = t.y - ny * 28;
          return (
            <g key={i}>
              <line
                x1={startX}
                y1={startY}
                x2={endX}
                y2={endY}
                stroke="#64748b"
                strokeWidth={strokeW}
                markerEnd="url(#arrow)"
              />
              <text
                x={(startX + endX) / 2}
                y={(startY + endY) / 2 - 6}
                fill="#94a3b8"
                fontSize="10"
                textAnchor="middle"
              >
                {e.count}
              </text>
            </g>
          );
        })}

        {nodes.map((n) => {
          const p = positions.get(n)!;
          const isStart = n in startActivities;
          const isEnd = n in endActivities;
          return (
            <g key={n}>
              <circle
                cx={p.x}
                cy={p.y}
                r={26}
                fill={isStart ? "#1d4ed8" : isEnd ? "#047857" : "#1e293b"}
                stroke={isStart ? "#3b82f6" : isEnd ? "#10b981" : "#475569"}
                strokeWidth={2}
              />
              <text
                x={p.x}
                y={p.y + 4}
                fill="#e2e8f0"
                fontSize="10"
                textAnchor="middle"
                className="select-none"
              >
                {n.length > 12 ? n.slice(0, 11) + "…" : n}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="flex gap-4 justify-center pb-4 text-xs text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-brand-700 border border-brand-500" />
          Start
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-emerald-700 border border-emerald-500" />
          End
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-slate-800 border border-slate-500" />
          Activity
        </span>
      </div>
    </div>
  );
}
