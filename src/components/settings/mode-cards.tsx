/** A big choice card with a small picture: "Börja med" (Android) and Datortyp (Linux) */
export function ModeCard({ selected, title, text, picture, onPick }: { selected: boolean; title: string; text: string; picture: React.ReactNode; onPick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onPick}
      className={`flex items-center gap-4 rounded-xl border-2 px-4 py-3.5 text-left ${selected ? "border-kth-blue bg-[#f4f8fd]" : "border-line bg-white hover:border-field"}`}
    >
      <span className="flex h-16 w-[92px] shrink-0 rounded-lg border border-field p-1.5" aria-hidden="true">{picture}</span>
      <span className="flex min-w-0 flex-col gap-1">
        <span className="text-[16px] font-extrabold text-kth-navy">{title}</span>
        <span className="text-[13px] leading-snug text-muted">{text}</span>
      </span>
    </button>
  );
}
