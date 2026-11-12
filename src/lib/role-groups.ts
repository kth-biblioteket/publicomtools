/**
 * Roles from KTH groups. librarytools-auth looks the person's groups up in ldap-api at login and
 * hands them over in the identity token (`groups`): the organisation (kthPAGroupMembership, e.g.
 * pa.anstallda.T.TRAB) and UG groups. IT_GROUPS, EDITOR_GROUPS and CONTENT_GROUPS name the groups
 * per role.
 */

export type GroupsVar = "IT_GROUPS" | "EDITOR_GROUPS" | "CONTENT_GROUPS";

/** Comma-separated groups per role */
export function roleGroups(name: GroupsVar): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((g) => g.trim())
    .filter(Boolean);
}

/**
 * Whether a configured group matches one of the person's. Organisation groups (pa.…) match as a
 * prefix, so pa.anstallda.T.TR is the whole library with its units; other groups match exactly
 * (case-insensitive).
 */
export function groupMatches(configured: string, groups: string[]): boolean {
  const c = configured.toLowerCase();
  return groups.some((g) => {
    const v = g.toLowerCase();
    return c.startsWith("pa.") ? v.startsWith(c) : v === c;
  });
}

/** Of the token's groups, those some role names: kept in the session, so the cookie stays small */
export function relevantGroups(groups: unknown): string[] {
  if (!Array.isArray(groups)) return [];
  const wanted = [...roleGroups("IT_GROUPS"), ...roleGroups("EDITOR_GROUPS"), ...roleGroups("CONTENT_GROUPS")];
  return groups.map(String).filter((g) => wanted.some((w) => groupMatches(w, [g])));
}
