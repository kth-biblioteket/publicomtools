/**
 * The icons the Android tablets show on their app buttons (Lucide, same names as APP_ICONS in
 * settings-shared), so the admin shows the same picture as the tablet.
 */
const PATHS: Record<string, string[]> = {
  house: ["M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8", "M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"],
  search: ["m21 21-4.34-4.34", "M3 11a8 8 0 1 0 16 0a8 8 0 1 0-16 0Z"],
  map: [
    "M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0Z",
    "M15 5.764v15",
    "M9 3.236v15",
  ],
  "map-pin": ["M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0", "M9 10a3 3 0 1 0 6 0a3 3 0 1 0-6 0Z"],
  calendar: ["M8 2v4", "M16 2v4", "M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z", "M3 10h18"],
  "book-open": ["M12 7v14", "M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4a4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3a3 3 0 0 0-3-3Z"],
  library: ["m16 6 4 14", "M12 6v14", "M8 8v12", "M4 4v16"],
  info: ["M2 12a10 10 0 1 0 20 0a10 10 0 1 0-20 0Z", "M12 16v-4", "M12 8h.01"],
  "circle-help": ["M2 12a10 10 0 1 0 20 0a10 10 0 1 0-20 0Z", "M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3", "M12 17h.01"],
  printer: [
    "M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2",
    "M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6",
    "M7 14h10a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1Z",
  ],
  monitor: ["M4 3h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z", "M8 21h8", "M12 17v4"],
  user: ["M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2", "M8 7a4 4 0 1 0 8 0a4 4 0 1 0-8 0Z"],
  clock: ["M2 12a10 10 0 1 0 20 0a10 10 0 1 0-20 0Z", "M12 6v6l4 2"],
  "graduation-cap": [
    "M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0Z",
    "M22 10v6",
    "M6 12.5V16a6 3 0 0 0 12 0v-3.5",
  ],
};

/** The tablet's icon by name; nothing for an empty or unknown name (the tablet shows none either) */
export function AppIcon({ name, className }: { name: string | null | undefined; className?: string }) {
  const paths = PATHS[name ?? ""];
  if (!paths) return null;
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={`size-5 shrink-0 fill-none stroke-current stroke-[2.2] [stroke-linecap:round] [stroke-linejoin:round] ${className ?? ""}`}
    >
      {paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
