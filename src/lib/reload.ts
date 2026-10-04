/**
 * "Hämta nya inställningar nu". Admin sets reloadRequestedAt; the computer's next heartbeat
 * (every 5 min) gets reload=true, and it fetches its config and restarts the session when
 * nobody is using it (publicom: reload_config.sh). The request is done once the computer's
 * session runs the current settings (reported configVersion; older computers: fetched its
 * config after the request), and expires after a day so a computer that can't fetch its
 * config isn't asked over and over.
 */
export const RELOAD_EXPIRES_MS = 24 * 60 * 60 * 1000;

export function reloadPending(
  c: { reloadRequestedAt?: Date | null; configFetchedAt?: Date | null },
  now = new Date(),
  /** Whether the computer's session runs the current settings (newer computers report it); undefined = unknown */
  applied?: boolean
): boolean {
  const at = c.reloadRequestedAt;
  if (!at || now.getTime() - at.getTime() > RELOAD_EXPIRES_MS) return false;
  if (applied !== undefined) return !applied;
  return !c.configFetchedAt || c.configFetchedAt < at;
}

/**
 * "Starta om datorn". Same idea: the next heartbeat gets reboot=true, and the computer reboots
 * when nobody is using it (reload_config.sh reboot). Done once the computer has booted after
 * the request, which the heartbeat shows (receivedAt - uptimeSeconds); expires after a day.
 */
export function rebootPending(
  c: { rebootRequestedAt?: Date | null },
  bootedAt: Date | null,
  now = new Date()
): boolean {
  const at = c.rebootRequestedAt;
  if (!at || now.getTime() - at.getTime() > RELOAD_EXPIRES_MS) return false;
  return !bootedAt || bootedAt <= at;
}
