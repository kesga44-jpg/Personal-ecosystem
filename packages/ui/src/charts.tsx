/** Lichte, toegankelijke SVG-grafieken zonder externe bibliotheek. */

export interface ChartPoint {
  label: string;
  value: number;
}

export function niceMax(values: number[]): number {
  const max = Math.max(0, ...values.filter((value) => Number.isFinite(value)));
  if (max === 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(max));
  for (const step of [1, 2, 2.5, 5, 10]) {
    if (max <= step * magnitude) return step * magnitude;
  }
  return 10 * magnitude;
}

function summary(points: ChartPoint[], unit: string): string {
  return points.map((point) => `${point.label}: ${formatValue(point.value)}${unit ? ` ${unit}` : ''}`).join(', ');
}

function formatValue(value: number): string {
  return new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 1 }).format(value);
}

function DataTable({ title, points, unit }: { title: string; points: ChartPoint[]; unit: string }) {
  return (
    <div className="visually-hidden">
    <table>
      <caption>{title}</caption>
      <tbody>
        {points.map((point) => (
          <tr key={point.label}>
            <th scope="row">{point.label}</th>
            <td>{formatValue(point.value)}{unit ? ` ${unit}` : ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  );
}

export function BarChart({ title, points, unit = '', height = 120 }: { title: string; points: ChartPoint[]; unit?: string; height?: number }) {
  const width = 320;
  const max = niceMax(points.map((point) => point.value));
  const gap = 8;
  const barWidth = points.length ? (width - gap * (points.length - 1)) / points.length : 0;
  const chartHeight = height;
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${width} ${height}`} style={{ height }} role="img" aria-label={`${title}. ${summary(points, unit)}`} preserveAspectRatio="none">
        <line x1="0" x2={width} y1={chartHeight - 0.5} y2={chartHeight - 0.5} className="chart-axis" />
        {points.map((point, index) => {
          const barHeight = Math.max(point.value > 0 ? 3 : 0, (point.value / max) * (chartHeight - 6));
          const x = index * (barWidth + gap);
          return <rect key={point.label} x={x} y={chartHeight - barHeight} width={barWidth} height={barHeight} rx="3" className="chart-bar" />;
        })}
      </svg>
      <div className="chart-labels" aria-hidden="true" style={{ gridTemplateColumns: `repeat(${Math.max(points.length, 1)}, minmax(0, 1fr))` }}>
        {points.map((point) => <span key={point.label}>{point.label}</span>)}
      </div>
      <DataTable title={title} points={points} unit={unit} />
    </figure>
  );
}

/** Schaal voor een lijngrafiek. Vanaf nul voor tellingen; anders rond de gemeten waarden (bijv. gewicht). */
export function lineScale(values: number[], zeroBased: boolean): { min: number; max: number } {
  const finite = values.filter((value) => Number.isFinite(value));
  if (zeroBased || !finite.length) return { min: 0, max: niceMax(finite) };
  const low = Math.min(...finite);
  const high = Math.max(...finite);
  const padding = Math.max((high - low) * 0.15, 1);
  return { min: Math.floor(low - padding), max: Math.ceil(high + padding) };
}

export function LineChart({
  title,
  points,
  unit = '',
  height = 110,
  zeroBased = true
}: {
  title: string;
  points: ChartPoint[];
  unit?: string;
  height?: number;
  zeroBased?: boolean;
}) {
  const width = 320;
  const values = points.map((point) => point.value);
  const { min, max } = lineScale(values, zeroBased);
  const chartHeight = height;
  const step = points.length > 1 ? width / (points.length - 1) : 0;
  const x = (index: number) => (points.length > 1 ? index * step : width / 2);
  const coords = points.map((point, index) => [x(index), chartHeight - ((point.value - min) / (max - min)) * (chartHeight - 8)] as const);
  const path = coords.map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = coords.length ? `${path} L${width},${chartHeight} L0,${chartHeight} Z` : '';
  const labelEvery = Math.max(1, Math.ceil(points.length / 7));
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${width} ${height}`} style={{ height }} role="img" aria-label={`${title}. ${summary(points, unit)}`} preserveAspectRatio="none">
        <line x1="0" x2={width} y1={chartHeight - 0.5} y2={chartHeight - 0.5} className="chart-axis" />
        {area && <path d={area} className="chart-area" />}
        {path && <path d={path} className="chart-line" fill="none" />}
        {coords.length === 1 && <circle cx={coords[0]![0]} cy={coords[0]![1]} r="3" className="chart-dot" />}
      </svg>
      <div className="chart-labels chart-labels-spread" aria-hidden="true">
        {points.filter((_, index) => index % labelEvery === 0 || index === points.length - 1).map((point) => <span key={point.label}>{point.label}</span>)}
      </div>
      <DataTable title={title} points={points} unit={unit} />
    </figure>
  );
}

export function Sparkline({ title, values }: { title: string; values: number[] }) {
  const width = 100;
  const height = 28;
  const max = niceMax(values);
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  const path = values.map((value, index) => `${index ? 'L' : 'M'}${(index * step).toFixed(1)},${(height - 2 - (value / max) * (height - 4)).toFixed(1)}`).join(' ');
  return (
    <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title}: ${values.map(formatValue).join(', ')}`} preserveAspectRatio="none">
      {path && <path d={path} className="chart-line" fill="none" />}
    </svg>
  );
}

/** Kalender-heatmap: één vakje per dag, intensiteit 0–4. */
export function Heatmap({ title, days }: { title: string; days: { date: string; value: number }[] }) {
  const max = Math.max(1, ...days.map((day) => day.value));
  const level = (value: number) => (value <= 0 ? 0 : Math.min(4, Math.ceil((value / max) * 4)));
  return (
    <figure className="chart">
      <div className="heatmap" role="img" aria-label={`${title}. ${days.filter((day) => day.value > 0).length} van ${days.length} dagen actief`}>
        {days.map((day) => (
          <span key={day.date} className={`heat heat-${level(day.value)}`} title={`${day.date}: ${day.value}`} />
        ))}
      </div>
      <DataTable title={title} points={days.map((day) => ({ label: day.date, value: day.value }))} unit="" />
    </figure>
  );
}

/** Voortgangsring. `text` vervangt de standaardtekst "waarde/max" (bijv. een percentage bij grote getallen). */
export function ProgressRing({ label, value, max, text }: { label: string; value: number; max: number; text?: string }) {
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  return (
    <svg className="progress-ring" viewBox="0 0 64 64" role="img" aria-label={`${label}: ${value} van ${max}`}>
      <circle cx="32" cy="32" r={radius} className="ring-track" />
      <circle cx="32" cy="32" r={radius} className="ring-value" strokeDasharray={`${(ratio * circumference).toFixed(1)} ${circumference.toFixed(1)}`} transform="rotate(-90 32 32)" />
      <text x="32" y="37" textAnchor="middle" className="ring-text">{text ?? `${value}/${max}`}</text>
    </svg>
  );
}
