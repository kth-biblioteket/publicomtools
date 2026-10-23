/** KTH's line pattern (KTH grafisk manual, Linjemönster 16x9). Decoration only. */
export function KthPattern({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 1920 1080"
      preserveAspectRatio="xMaxYMid slice"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <polyline points="1925.5 853.91 1492.84 853.91 1279.82 640 1279.82 1067 1708.29 640 1925.89 640" />
      <path d="m427.13,1080.31c0-124.95-101.29-226.25-226.25-226.25H-4.5" />
      <polyline points="-5.5 213.5 213.5 213.5 -4.5 648.5" />
      <path d="m426.12-6.5v221.57c0,117.04-94.88,211.93-211.93,211.93H-5.5" />
      <path d="m1066.04-3v429.38c-117.11,0-212.04-94.93-212.04-212.04h1067.5" />
      <path d="m1493,0c0,235.83,191.17,427,427,427" />
    </svg>
  );
}
