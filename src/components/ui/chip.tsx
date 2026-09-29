const TONES = {
  gray: "bg-[#eceef1] text-[#3d444d]",
  own: "bg-select text-select-ink",
  draft: "bg-warn-bg text-warn-ink",
  it: "border border-[#d7dbe0] bg-transparent text-muted text-[10.5px] h-[18px] px-1.5",
} as const;

/** Small label: "Satt här", "Väntar på omstart", "IT" … */
export function Chip({ tone = "gray", children, title }: { tone?: keyof typeof TONES; children: React.ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className={`inline-flex h-[22px] items-center gap-1 whitespace-nowrap rounded-md px-2 text-xs font-bold ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}
