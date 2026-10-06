/** Visits per day as a small line, for the device table */
export function Sparkline({ values, label }: { values: number[]; label: string }) {
  const w = 96;
  const h = 26;
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? w / (values.length - 1) : w;
  const points = values.map((v, i) => `${(i * step).toFixed(1)},${(h - 2 - (v / max) * (h - 4)).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-label={label} className="shrink-0">
      <polyline points={points} fill="none" stroke="var(--color-kth-blue)" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}
