import { useId } from "react";

interface RankingBar { id: string; label: string; value: number; description: string }
interface RankingBarChartProps {
  title: string;
  rows: RankingBar[];
  minimum: number;
  maximum: number;
  unit: "ELO" | "gol";
}
const podium = ["var(--gold)", "var(--silver)", "var(--bronze)"];
const format = (value: number, unit: string) => value.toLocaleString("it-IT", { minimumFractionDigits: unit === "ELO" ? 1 : 0, maximumFractionDigits: 1 });

/** SVG keeps the chart server-rendered, sharp and accessible without a chart runtime. */
export function RankingBarChart({ title, rows, minimum, maximum, unit }: RankingBarChartProps) {
  const id = useId();
  if (!rows.length) return <p className="py-8 text-text-muted">Nessun giocatore in questo ruolo.</p>;
  const width = 400;
  const plotWidth = width - 2;
  const step = 76;
  const top = 30;
  const height = top + rows.length * step + 18;
  const range = maximum - minimum || 1;
  const x = (value: number) => 1 + (value - minimum) / range * plotWidth;
  const zero = x(0);
  const ticks = Array.from({ length: 5 }, (_, i) => minimum + range * i / 4);
  return <figure className="mt-5" aria-label={title}>
    <svg viewBox={`0 0 ${width} ${height}`} className="block w-full" role="img" aria-labelledby={`${id}-title ${id}-description`}>
      <title id={`${id}-title`}>{title}</title>
      <desc id={`${id}-description`}>Classifica in ordine decrescente. Valori espressi in {unit}. Primo posto oro, secondo argento, terzo bronzo. {rows.map((r, i) => `${i + 1}. ${r.label}: ${format(r.value, unit)}.`).join(" ")}</desc>
      {ticks.map((tick, i) => <g key={i} aria-hidden="true">
        <line x1={x(tick)} x2={x(tick)} y1={top} y2={height - 12} stroke="currentColor" strokeOpacity="0.08" />
        <text x={x(tick)} y={16} textAnchor={i === 0 ? "start" : i === 4 ? "end" : "middle"} fill="var(--text-muted)" fontSize="12">{Math.round(tick).toLocaleString("it-IT")}</text>
      </g>)}
      {unit === "ELO" && minimum <= 100 && maximum >= 100 && <line x1={x(100)} x2={x(100)} y1={top} y2={height - 12} stroke="var(--text-muted)" strokeOpacity="0.5" strokeDasharray="3 5" aria-hidden="true" />}
      {rows.map((row, index) => {
        const y = top + index * step;
        const color = podium[index] ?? "#6d9ce8";
        return <g key={row.id} tabIndex={0} role="img" aria-label={`${index + 1}. ${row.description}: ${format(row.value, unit)} ${unit}`} className="ranking-bar">
          <title>{row.description}: {format(row.value, unit)} {unit}</title>
          <text x={1} y={y + 19} fill="var(--text-primary)" fontSize="15" fontWeight="600">{index + 1}. {row.label}</text>
          <text x={width - 1} y={y + 19} textAnchor="end" fill={color} fontSize="17" fontWeight="700">{format(row.value, unit)}</text>
          <rect x={1} y={y + 30} width={plotWidth} height={22} rx={5} fill="var(--panel-soft)" />
          <rect x={Math.min(zero, x(row.value))} y={y + 30} width={Math.abs(x(row.value) - zero)} height={22} rx={5} fill={color} />
        </g>;
      })}
    </svg>
    <figcaption className="mt-1 text-xs text-text-muted">{unit === "ELO" ? "ELO individuale · Linea tratteggiata: partenza a 100." : "Gol individuali nelle partite concluse."} Stessa scala nei due grafici.</figcaption>
  </figure>;
}
