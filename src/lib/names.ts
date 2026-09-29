/**
 * The name a computer has in the admin: its admin-only label, else the name it
 * reports (COMPUTER_NAME, shown in its panel), else the host name.
 */
export function displayName(c: { host: string; label?: string | null; computerName?: string | null }): string {
  return c.label || c.computerName || c.host;
}
