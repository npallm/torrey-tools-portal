export type BarDatum = { label: string; value: number; hint?: string };

export function BarChart({
  data,
  format = (v: number) => String(v),
  color = "#1f7a6d",
  height = 160,
}: {
  data: BarDatum[];
  format?: (v: number) => string;
  color?: string;
  height?: number;
}) {
  const max = Math.max(...data.map((d) => d.value), 0.0001);
  const barW = 48;
  const gap = 20;
  const width = data.length * (barW + gap);

  return (
    <svg
      viewBox={`0 0 ${width} ${height + 36}`}
      className="w-full"
      role="img"
    >
      {data.map((d, i) => {
        const h = (d.value / max) * (height - 20);
        const x = i * (barW + gap) + gap / 2;
        const y = height - h;
        return (
          <g key={d.label}>
            <rect x={x} y={y} width={barW} height={h} rx={4} fill={color} />
            <text
              x={x + barW / 2}
              y={y - 5}
              textAnchor="middle"
              className="fill-slate-600"
              fontSize={11}
            >
              {format(d.value)}
            </text>
            <text
              x={x + barW / 2}
              y={height + 16}
              textAnchor="middle"
              className="fill-slate-500"
              fontSize={10}
            >
              {d.label}
            </text>
            {d.hint && (
              <text
                x={x + barW / 2}
                y={height + 29}
                textAnchor="middle"
                className="fill-slate-400"
                fontSize={9}
              >
                {d.hint}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
