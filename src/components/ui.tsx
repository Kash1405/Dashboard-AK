import { useId, type ReactNode } from "react";

const icons: Record<string, ReactNode> = {
  grid: <><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/></>,
  chart: <><path d="M4 19V9"/><path d="M10 19V5"/><path d="M16 19v-7"/><path d="M22 19H2"/></>,
  heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5a5.5 5.5 0 0 0 1-8.9Z"/>,
  calendar: <><path d="M3 8h18"/><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4"/></>,
  bolt: <path d="m13 2-9 12h7l-1 8 9-12h-7l1-8Z"/>,
  plus: <path d="M12 5v14M5 12h14"/>,
  focus: <><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></>,
  arrow: <path d="M5 12h14m-5-5 5 5-5 5"/>,
  pill: <><path d="m10.5 20.5-7-7a5 5 0 0 1 7-7l7 7a5 5 0 0 1-7 7Z"/><path d="m8 11 5-5"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
  x: <path d="M6 6l12 12M18 6 6 18"/>,
  trash: <><path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/></>,
  edit: <><path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13 7 4 4"/></>,
  download: <><path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/></>,
  upload: <><path d="M12 16V5"/><path d="m7 10 5-5 5 5"/><path d="M5 20h14"/></>,
  refresh: <><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></>,
  key: <><circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3"/></>,
  play: <path d="M7 4v16l13-8Z"/>,
  pause: <path d="M8 5v14M16 5v14"/>,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></>,
  briefcase: <><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><path d="M3 13h18"/></>,
  flag: <><path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/></>,
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>,
  external: <><path d="M14 4h6v6"/><path d="M20 4 11 13"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/></>,
};

export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {icons[name]}
    </svg>
  );
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`panel ${className}`}>{children}</section>;
}

export function PanelTitle({ eyebrow, title, action }: { eyebrow: string; title: ReactNode; action?: ReactNode }) {
  return (
    <div className="panel-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      {action}
    </div>
  );
}

function toPoints(values: number[], width: number, height: number, padding = 0.08) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || Math.abs(max) || 1;
  const lo = min - span * padding;
  const hi = max + span * padding;
  return values.map((v, i) => [(i / Math.max(values.length - 1, 1)) * width, height - ((v - lo) / (hi - lo)) * height] as const);
}

export function Sparkline({ values, positive, tall = false }: { values: number[]; positive?: boolean; tall?: boolean }) {
  const id = `spark${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const series = values.length > 1 ? values : [values[0] ?? 0, values[0] ?? 0];
  const up = positive ?? series[series.length - 1] >= series[0];
  const points = toPoints(series, 124, 52, 0.12).map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return (
    <svg className={`spark ${up ? "positive" : "negative"} ${tall ? "tall" : ""}`} viewBox="0 0 124 52" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity=".3"/>
          <stop offset="1" stopColor="currentColor" stopOpacity="0"/>
        </linearGradient>
      </defs>
      <path d={`M${points} L124,52 L0,52 Z`} fill={`url(#${id})`} stroke="none"/>
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke"/>
    </svg>
  );
}

export function LineChart({ values, labels, format }: { values: number[]; labels: string[]; format: (n: number) => string }) {
  const id = `line${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const points = toPoints(values, 700, 230);
  const line = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const up = values[values.length - 1] >= values[0];
  const color = up ? "var(--green)" : "var(--red)";
  return (
    <div className="line-chart">
      <div className="chart-axis"><span>{format(Math.max(...values))}</span><span>{format(Math.min(...values))}</span></div>
      <svg viewBox="0 0 700 230" preserveAspectRatio="none" aria-label="Value over time" style={{ color }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="currentColor" stopOpacity=".28"/>
            <stop offset="1" stopColor="currentColor" stopOpacity="0"/>
          </linearGradient>
        </defs>
        {[1, 58, 115, 172, 229].map((y) => <line key={y} x1="0" y1={y} x2="700" y2={y} stroke="var(--line)" strokeWidth="1" vectorEffect="non-scaling-stroke"/>)}
        <path d={`M${line} L700,230 L0,230 Z`} fill={`url(#${id})`}/>
        <polyline points={line} fill="none" stroke="currentColor" strokeWidth="2.5" vectorEffect="non-scaling-stroke"/>
      </svg>
      <div className="chart-dates"><span>{labels[0]}</span><span>{labels[labels.length - 1]}</span></div>
    </div>
  );
}

export function Donut({ segments, children }: { segments: { share: number; color: string }[]; children: ReactNode }) {
  let start = 0;
  const stops = segments.map((s) => {
    const stop = `${s.color} ${start}% ${start + s.share}%`;
    start += s.share;
    return stop;
  });
  return (
    <div className="donut" style={{ background: segments.length ? `conic-gradient(${stops.join(", ")})` : "#2a2c31" }}>
      <div>{children}</div>
    </div>
  );
}
