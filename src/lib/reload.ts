/**
 * "Hämta nya inställningar nu". Admin sets reloadRequestedAt; the computer's next heartbeat
 * (every 5 min) gets reload=true, and it fetches its config and restarts the session when
 * nobody is using it (publicom: reload_config.sh). The request is done once the computer has
 * fetched its config after it, and expires after a day so a computer that can't fetch its
 * config isn't asked over and over.
 */
export const RELOAD_EXPIRES_MS = 24 * 60 * 60 * 1000;

export function reloadPending(
  c: { reloadRequestedAt?: Date | null; configFetchedAt?: Date | null },
  now = new Date()
): boolean {
  const at = c.reloadRequestedAt;
  if (!at || now.getTime() - at.getTime() > RELOAD_EXPIRES_MS) return false;
  return !c.configFetchedAt || c.configFetchedAt < at;
}
