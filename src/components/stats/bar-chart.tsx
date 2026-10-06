export type Bar = {
  label: string;
  value: number;
  /** Shown on hover and read by screen readers */
  title: string;
  /** Axis label under the bar (only some bars have one when there are many) */
  tick?: string;
  muted?: boolean;
};

/** Vertical bars without a library: heights in %, so it follows the card's width. */
export function BarChart({ bars, height = 160, caption }: { bars: Bar[]; height?: number; caption: string }) {
  const max = Math.max(1, ...bars.map((b) => b.value));
  const dense = bars.length > 40;
  return (
    <figure>
      <div className="flex items-end gap-[2px]" style={{ height }} role="img" aria-label={caption}>
        {bars.map((b, i) => (
          <div key={i} className="group relative flex h-full min-w-0 flex-1 items-end" title={b.title}>
            <div
              className={`w-full rounded-t-[3px] ${b.muted ? "bg-kth-sky/60" : "bg-kth-blue"} group-hover:bg-kth-navy`}
              style={{ height: `${b.value > 0 ? Math.max(2, (b.value / max) * 100) : 0}%` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-[2px] border-t border-line pt-1 text-[11px] text-faint">
        {bars.map((b, i) => (
          // Datum (tick) får gå ut över grannarna; namn på få staplar centreras under sin stapel
          <div key={i} className={`min-w-0 flex-1 ${b.tick !== undefined ? "overflow-visible whitespace-nowrap" : "truncate text-center"}`}>
            {b.tick ?? (dense ? "" : b.label)}
          </div>
        ))}
      </div>
      <table className="sr-only">
        <caption>{caption}</caption>
        <tbody>
          {bars.map((b, i) => (
            <tr key={i}>
              <th scope="row">{b.label}</th>
              <td>{b.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
