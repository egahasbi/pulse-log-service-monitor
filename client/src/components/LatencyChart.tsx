import React, { useMemo, useState } from 'react';

export interface LatencyDataPoint {
  timestamp: number | string;
  latencyMs: number;
  status?: number;
  isError?: boolean;
}

interface LatencyChartProps {
  data: LatencyDataPoint[];
  width?: number;
  height?: number;
  className?: string;
  showPercentiles?: boolean;
}

function calculatePercentile(sortedValues: number[], percentile: number): number {
  if (sortedValues.length === 0) return 0;
  if (sortedValues.length === 1) return sortedValues[0];
  const rank = (percentile / 100) * (sortedValues.length - 1);
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  const weight = rank - low;
  return sortedValues[low] * (1 - weight) + sortedValues[high] * weight;
}

export const LatencyChart: React.FC<LatencyChartProps> = ({
  data,
  width = 600,
  height = 200,
  className = '',
  showPercentiles = true,
}) => {
  const [hoveredPoint, setHoveredPoint] = useState<{
    point: LatencyDataPoint;
    x: number;
    y: number;
  } | null>(null);

  const padding = { top: 20, right: 65, bottom: 25, left: 45 };
  const innerWidth = Math.max(10, width - padding.left - padding.right);
  const innerHeight = Math.max(10, height - padding.top - padding.bottom);

  const metrics = useMemo(() => {
    if (!data || data.length === 0) {
      return {
        points: [],
        p95: 0,
        p99: 0,
        avg: 0,
        max: 100,
        min: 0,
        pathD: '',
        areaD: '',
      };
    }

    const latencies = data.map((d) => d.latencyMs);
    const sorted = [...latencies].sort((a, b) => a - b);
    const p95 = calculatePercentile(sorted, 95);
    const p99 = calculatePercentile(sorted, 99);
    const sum = sorted.reduce((acc, curr) => acc + curr, 0);
    const avg = Math.round(sum / sorted.length);

    const rawMax = Math.max(...latencies, p99, 10);
    const max = Math.ceil((rawMax * 1.15) / 10) * 10;
    const min = 0;

    const coords = data.map((d, index) => {
      const x =
        data.length === 1
          ? padding.left + innerWidth / 2
          : padding.left + (index / (data.length - 1)) * innerWidth;
      const normalizedY = (d.latencyMs - min) / (max - min || 1);
      const y = padding.top + innerHeight - normalizedY * innerHeight;
      return { x, y, raw: d };
    });

    const pathD = coords.reduce(
      (acc, pt, idx) => `${acc} ${idx === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`,
      ''
    );

    const bottomY = padding.top + innerHeight;
    const firstX = coords[0]?.x ?? padding.left;
    const lastX = coords[coords.length - 1]?.x ?? padding.left;
    const areaD = `${pathD} L ${lastX.toFixed(1)} ${bottomY} L ${firstX.toFixed(1)} ${bottomY} Z`;

    return { points: coords, p95, p99, avg, max, min, pathD, areaD };
  }, [data, innerWidth, innerHeight, padding.left, padding.top]);

  const p95Y =
    padding.top +
    innerHeight -
    ((metrics.p95 - metrics.min) / (metrics.max - metrics.min || 1)) * innerHeight;

  const p99Y =
    padding.top +
    innerHeight -
    ((metrics.p99 - metrics.min) / (metrics.max - metrics.min || 1)) * innerHeight;

  if (!data || data.length === 0) {
    return (
      <div
        className={`flex items-center justify-center bg-slate-900 border border-slate-800 rounded-lg text-slate-500 font-mono text-xs ${className}`}
        style={{ width, height }}
      >
        NO_PROBE_DATA
      </div>
    );
  }

  return (
    <div className={`relative inline-block select-none bg-slate-900 border border-slate-800 rounded-lg p-2 ${className}`}>
      <div className="flex items-center justify-between px-2 pb-1 text-xs font-mono text-slate-400 border-b border-slate-800/60 mb-2">
        <span className="flex items-center gap-1.5 font-semibold text-slate-300">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          LATENCY SPARKLINE
        </span>
        <div className="flex gap-3">
          <span>AVG: <strong className="text-slate-200">{metrics.avg}ms</strong></span>
          <span className="text-amber-400">P95: <strong>{Math.round(metrics.p95)}ms</strong></span>
          <span className="text-rose-400">P99: <strong>{Math.round(metrics.p99)}ms</strong></span>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto overflow-visible"
        onMouseLeave={() => setHoveredPoint(null)}
      >
        <defs>
          <linearGradient id="latencyGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.0" />
          </linearGradient>
          <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Horizontal grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
          const y = padding.top + innerHeight * (1 - pct);
          const val = Math.round(metrics.min + (metrics.max - metrics.min) * pct);
          return (
            <g key={pct}>
              <line
                x1={padding.left}
                y1={y}
                x2={padding.left + innerWidth}
                y2={y}
                stroke="#334155"
                strokeDasharray="2 4"
                strokeWidth="1"
              />
              <text
                x={padding.left - 6}
                y={y + 3}
                fill="#64748b"
                fontSize="9"
                textAnchor="end"
                fontFamily="monospace"
              >
                {val}m
              </text>
            </g>
          );
        })}

        {/* Area fill */}
        <path d={metrics.areaD} fill="url(#latencyGradient)" />

        {/* Latency line */}
        <path
          d={metrics.pathD}
          fill="none"
          stroke="#06b6d4"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* P95 Indicator */}
        {showPercentiles && (
          <g>
            <line
              x1={padding.left}
              y1={p95Y}
              x2={padding.left + innerWidth}
              y2={p95Y}
              stroke="#fbbf24"
              strokeDasharray="4 4"
              strokeWidth="1.5"
            />
            <rect
              x={padding.left + innerWidth + 4}
              y={p95Y - 8}
              width="50"
              height="15"
              fill="#78350f"
              rx="3"
            />
            <text
              x={padding.left + innerWidth + 8}
              y={p95Y + 3}
              fill="#fef3c7"
              fontSize="9"
              fontWeight="bold"
              fontFamily="monospace"
            >
              p95:{Math.round(metrics.p95)}
            </text>
          </g>
        )}

        {/* P99 Indicator */}
        {showPercentiles && (
          <g>
            <line
              x1={padding.left}
              y1={p99Y}
              x2={padding.left + innerWidth}
              y2={p99Y}
              stroke="#f43f5e"
              strokeDasharray="3 3"
              strokeWidth="1.5"
            />
            <rect
              x={padding.left + innerWidth + 4}
              y={p99Y - 8}
              width="50"
              height="15"
              fill="#881337"
              rx="3"
            />
            <text
              x={padding.left + innerWidth + 8}
              y={p99Y + 3}
              fill="#ffe4e6"
              fontSize="9"
              fontWeight="bold"
              fontFamily="monospace"
            >
              p99:{Math.round(metrics.p99)}
            </text>
          </g>
        )}

        {/* Interactive nodes & hits */}
        {metrics.points.map((pt, idx) => (
          <g key={idx}>
            <circle
              cx={pt.x}
              cy={pt.y}
              r={pt.raw.isError ? 3.5 : 2}
              fill={pt.raw.isError ? '#f43f5e' : '#22d3ee'}
            />
            <rect
              x={pt.x - (innerWidth / (data.length * 2 || 1))}
              y={padding.top}
              width={innerWidth / (data.length || 1)}
              height={innerHeight}
              fill="transparent"
              className="cursor-crosshair"
              onMouseEnter={() => setHoveredPoint({ point: pt.raw, x: pt.x, y: pt.y })}
            />
          </g>
        ))}

        {/* Hover Crosshair & Point Highlight */}
        {hoveredPoint && (
          <g pointerEvents="none">
            <line
              x1={hoveredPoint.x}
              y1={padding.top}
              x2={hoveredPoint.x}
              y2={padding.top + innerHeight}
              stroke="#94a3b8"
              strokeDasharray="2 2"
              strokeWidth="1"
            />
            <circle
              cx={hoveredPoint.x}
              cy={hoveredPoint.y}
              r="5"
              fill={hoveredPoint.point.isError ? '#f43f5e' : '#06b6d4'}
              stroke="#0f172a"
              strokeWidth="2"
              filter="url(#glow)"
            />
          </g>
        )}
      </svg>

      {/* Floating tooltip */}
      {hoveredPoint && (
        <div
          className="absolute z-10 pointer-events-none transform -translate-x-1/2 -translate-y-full bg-slate-950/90 border border-slate-700 backdrop-blur-sm px-2.5 py-1.5 rounded shadow-xl text-left"
          style={{
            left: `${(hoveredPoint.x / width) * 100}%`,
            top: `${Math.max(10, hoveredPoint.y - 12)}px`,
          }}
        >
          <div className="font-mono text-[11px] font-bold text-cyan-400">
            {hoveredPoint.point.latencyMs} ms
          </div>
          {hoveredPoint.point.status && (
            <div
              className={`font-mono text-[10px] ${
                hoveredPoint.point.isError ? 'text-rose-400' : 'text-emerald-400'
              }`}
            >
              HTTP {hoveredPoint.point.status}
            </div>
          )}
          <div className="font-mono text-[9px] text-slate-400">
            {new Date(hoveredPoint.point.timestamp).toLocaleTimeString()}
          </div>
        </div>
      )}
    </div>
  );
};

export default LatencyChart;