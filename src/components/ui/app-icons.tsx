"use client";

import { DynamicIcon } from "lucide-react/dynamic";
import { isIconName } from "@/lib/settings-shared";

/**
 * The icon a kiosk shows on an app button, by its Lucide name (the lucide-react package; the
 * kiosks use the same Lucide version). Each icon is loaded when first shown.
 */
export function AppIcon({ name, className }: { name: string | null | undefined; className?: string }) {
  if (!name || !isIconName(name)) return null;
  return <DynamicIcon name={name} strokeWidth={2.2} aria-hidden="true" className={`size-5 shrink-0 ${className ?? ""}`} />;
}
