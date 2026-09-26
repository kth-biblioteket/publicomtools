"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Re-renders the current page's server data every `intervalMs`, so the
 * status page stays current on a screen left open. Renders nothing. */
export function AutoRefresh({ intervalMs = 30000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);

  return null;
}
