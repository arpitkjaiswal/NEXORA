import { useId, useState } from "react";
import { Minus, Plus, Scan, Network } from "lucide-react";
import type { Repository, GraphNode } from "./types";

export default function Graph({
  repository,
  expanded = false,
}: {
  repository?: Repository;
  expanded?: boolean;
}) {
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [zoom, setZoom] = useState(1);
  const grid = useId();
  const width = 720,
    height = expanded ? 450 : 265;
  const nodes = repository?.graph.nodes || [];
  const count = nodes.length;
  const positions = new Map(
    nodes.map((node, i) => {
      if (count === 6)
        return [
          node.id,
          [
            { x: 360, y: 48 },
            { x: 140, y: height * 0.46 },
            { x: 360, y: height * 0.46 },
            { x: 580, y: height * 0.46 },
            { x: 250, y: height - 47 },
            { x: 490, y: height - 47 },
          ][i],
        ];
      const columns = Math.min(4, Math.max(1, Math.ceil(Math.sqrt(count))));
      const rows = Math.ceil(count / columns);
      return [
        node.id,
        {
          x: (((i % columns) + 0.5) * width) / columns,
          y: ((Math.floor(i / columns) + 0.5) * height) / rows,
        },
      ];
    }),
  );
  return (
    <div className={`graph ${expanded ? "graph-expanded" : ""}`}>
      {count ? (
        <svg
          viewBox={`0 0 ${width} ${height}`}
          aria-label="Repository dependency graph"
        >
          <defs>
            <pattern
              id={grid}
              width="18"
              height="18"
              patternUnits="userSpaceOnUse"
            >
              <circle cx="1" cy="1" r=".7" fill="#344035" />
            </pattern>
          </defs>
          <rect width={width} height={height} fill={`url(#${grid})`} />
          <g
            transform={`translate(${width / 2} ${height / 2}) scale(${zoom}) translate(${-width / 2} ${-height / 2})`}
          >
            {repository?.graph.edges.map((edge, i) => {
              const start = positions.get(edge.source),
                end = positions.get(edge.target);
              if (!start || !end) return null;
              const active =
                !selected ||
                selected.id === edge.source ||
                selected.id === edge.target;
              return (
                <path
                  key={i}
                  d={`M ${start.x} ${start.y + 17} C ${start.x} ${(start.y + end.y) / 2} ${end.x} ${(start.y + end.y) / 2} ${end.x} ${end.y - 17}`}
                  fill="none"
                  stroke={active ? "#63764a" : "#2b302c"}
                  strokeWidth="1.4"
                  strokeDasharray={active ? undefined : "4 4"}
                />
              );
            })}
            {nodes.map((node) => {
              const p = positions.get(node.id)!;
              const active = selected?.id === node.id;
              return (
                <g
                  key={node.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`Inspect ${node.label}`}
                  onClick={() => setSelected(active ? null : node)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelected(active ? null : node);
                    }
                  }}
                  className="graph-node"
                >
                  <rect
                    x={p.x - 75}
                    y={p.y - 19}
                    width="150"
                    height="38"
                    rx="7"
                    fill={active ? "#28381e" : "#1c211d"}
                    stroke={active ? "#b4e37a" : "#3a463a"}
                  />
                  <circle
                    cx={p.x - 57}
                    cy={p.y}
                    r="4"
                    fill={node.type === "database" ? "#b3a4d4" : "#a6d97b"}
                  />
                  <text
                    x={p.x - 44}
                    y={p.y + 4}
                    fill="#d0d7ce"
                    fontSize="11"
                    fontFamily="inherit"
                  >
                    {node.label.length > 19
                      ? `${node.label.slice(0, 18)}…`
                      : node.label}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      ) : (
        <div className="empty graph-empty">
          <Network size={28} />
          <h3>No dependency graph yet</h3>
          <p>
            Analyze a repository to discover its modules and relative imports.
          </p>
        </div>
      )}
      <div className="graph-controls">
        <button
          aria-label="Zoom out"
          onClick={() => setZoom(Math.max(0.6, zoom - 0.2))}
        >
          <Minus size={14} />
        </button>
        <button
          aria-label="Reset graph zoom"
          onClick={() => {
            setZoom(1);
            setSelected(null);
          }}
        >
          <Scan size={14} />
        </button>
        <button
          aria-label="Zoom in"
          onClick={() => setZoom(Math.min(1.8, zoom + 0.2))}
        >
          <Plus size={14} />
        </button>
      </div>
      <div className="graph-legend">
        <i /> Module <i className="purple" /> Data layer
      </div>
      {selected && (
        <div className="graph-detail">
          <strong>{selected.label}</strong>
          <span>
            {selected.files} source files ·{" "}
            {
              repository?.graph.edges.filter(
                (e) => e.source === selected.id || e.target === selected.id,
              ).length
            }{" "}
            connections
          </span>
          <button
            onClick={() => setSelected(null)}
            aria-label="Close node details"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
