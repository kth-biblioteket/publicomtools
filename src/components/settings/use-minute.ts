import { useSyncExternalStore } from "react";

const subscribe = (onChange: () => void) => {
  const t = setInterval(onChange, 15_000);
  return () => clearInterval(t);
};

/**
 * The current minute in the browser (null while rendering on the server), so a clock or "Visas nu"
 * never differs between the server's HTML and the browser's first render.
 */
export function useMinute(): Date | null {
  const minute = useSyncExternalStore(
    subscribe,
    () => Math.floor(Date.now() / 60_000),
    () => null,
  );
  return minute === null ? null : new Date(minute * 60_000);
}
