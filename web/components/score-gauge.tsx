import { cn } from "@/lib/utils";

export function scoreColor(score: number): string {
  if (score >= 85) return "#16a34a";
  if (score >= 70) return "#65a30d";
  if (score >= 50) return "#d97706";
  return "#dc2626";
}

export function ScoreGauge({
  score,
  size = 120,
  stroke = 9,
  grade,
  className,
}: {
  score: number;
  size?: number;
  stroke?: number;
  grade?: string;
  className?: string;
}) {
  const r = (size - stroke - 4) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.max(0, Math.min(100, score)) / 100);
  const color = scoreColor(score);
  return (
    <div
      className={cn("relative inline-grid place-items-center", className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={off}
          style={{ transition: "stroke-dashoffset 0.9s cubic-bezier(0.22,1,0.36,1)" }}
        />
      </svg>
      <div className="absolute text-center leading-none">
        <div className="font-display text-2xl font-bold tabular-nums" style={{ color }}>
          {Math.round(score)}
        </div>
        {grade && <div className="mt-0.5 text-[11px] font-medium text-muted-foreground">{grade}</div>}
      </div>
    </div>
  );
}
