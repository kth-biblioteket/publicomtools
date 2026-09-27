"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

// Activity inside the form can't be seen when it is on another origin; while
// the form has focus, allow this much longer before going back
const FOCUSED_IN_FRAME_MS = 5 * 60 * 1000;

/** The account form with a "back" bar, returning to the login after `idleMs` without activity. */
export function RegisterFrame({ url, idleMs }: { url: string; idleMs: number }) {
  const router = useRouter();
  const frameRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Same origin in production (apps.lib.kth.se), so activity in the form can be followed
    let canSeeFrame = false;
    const reset = () => {
      clearTimeout(timer);
      const focusedUnseen = !canSeeFrame && document.activeElement === frameRef.current;
      timer = setTimeout(() => router.replace("/guest"), focusedUnseen ? FOCUSED_IN_FRAME_MS : idleMs);
    };
    const frame = frameRef.current;
    const listenInFrame = () => {
      const doc = (() => {
        try {
          return frame?.contentDocument ?? null;
        } catch {
          return null;
        }
      })();
      canSeeFrame = doc !== null;
      ["mousemove", "keydown", "wheel", "click"].forEach((e) => doc?.addEventListener(e, reset));
      reset();
    };
    const events = ["mousemove", "keydown", "wheel", "click", "blur", "focus"] as const;
    events.forEach((e) => window.addEventListener(e, reset));
    frame?.addEventListener("load", listenInFrame);
    reset();
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
      frame?.removeEventListener("load", listenInFrame);
    };
  }, [router, idleMs]);

  return (
    <div className="flex h-screen w-full flex-col">
      <div className="flex items-center bg-kth-navy px-4 py-3">
        <Link href="/guest" replace className="rounded-md bg-white/10 px-4 py-2 text-lg font-medium hover:bg-white/20">
          ← Tillbaka till inloggningen / Back to login
        </Link>
      </div>
      <iframe ref={frameRef} src={url} className="w-full flex-1 border-0 bg-white" title="Registrera bibliotekskonto" />
    </div>
  );
}
