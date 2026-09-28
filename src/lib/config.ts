import "server-only";
import { db } from "@/lib/db";
import { withBasePath } from "@/lib/base-path";

/**
 * Guest computer configuration, served to the computers instead of the static
 * GitHub .config files. The effective config is base ⊕ profile ⊕ host overrides.
 * See docs/config-via-publicomtools.md in the publicom repo.
 *
 * Config only — never secrets (those stay in /usr/local/bin/secrets/.secrets on
 * each computer). Values are strings; the computer reads them with load_config
 * (printf -v, never source), so nothing here can execute code.
 */

export type ConfigValues = Record<string, string>;

function asValues(json: unknown): ConfigValues {
  if (!json || typeof json !== "object") return {};
  const out: ConfigValues = {};
  for (const [k, v] of Object.entries(json as Record<string, unknown>)) {
    if (v !== null && v !== undefined) out[k] = String(v);
  }
  return out;
}

/** base ⊕ profile ⊕ host overrides, plus the identity keys the computer needs. */
export async function getEffectiveConfig(
  host: string,
  origin: string
): Promise<ConfigValues | null> {
  const computer = await db.computer.findUnique({ where: { host } });
  if (!computer) return null;

  const [base, profile] = await Promise.all([
    db.configLayer.findUnique({ where: { kind_name: { kind: "base", name: "" } } }),
    computer.profile
      ? db.configLayer.findUnique({ where: { kind_name: { kind: "profile", name: computer.profile } } })
      : Promise.resolve(null),
  ]);

  return {
    ...asValues(base?.values),
    ...asValues(profile?.values),
    ...asValues(computer.overrides),
    PUBLICOM_HOST: host,
    // heartbeat.sh skickar PUBLICOM_PROFILE tillbaka; utan den skulle profilen nollställas
    // vid heartbeat och nästa config-hämtning tappa profil-lagret.
    ...(computer.profile ? { PUBLICOM_PROFILE: computer.profile } : {}),
    REMOTE_CONFIG_URL: `${origin}${withBasePath(`/api/device/config?host=${encodeURIComponent(host)}`)}`,
  };
}

/**
 * Serialize to the env format the computers already parse (KEY="value" per line).
 * Values are double-quoted; embedded double quotes are rejected by validation so
 * load_config (which strips one quote layer) stays correct.
 */
export function serializeEnv(values: ConfigValues): string {
  return (
    Object.keys(values)
      .sort()
      .map((k) => `${k}="${values[k]}"`)
      .join("\n") + "\n"
  );
}

export type ValidationIssue = { key: string; problem: string };

/** Validate a layer's values against the ConfigKey catalog. Used by the admin UI. */
export async function validateLayer(values: ConfigValues): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];
  const catalog = new Map((await db.configKey.findMany()).map((k) => [k.key, k]));

  for (const [key, raw] of Object.entries(values)) {
    if (raw.includes('"')) issues.push({ key, problem: 'värdet får inte innehålla dubbelcitattecken (")' });

    const meta = catalog.get(key);
    if (!meta) {
      issues.push({ key, problem: "okänd nyckel (finns inte i katalogen)" });
      continue;
    }
    switch (meta.type) {
      case "int":
        if (!/^-?\d+$/.test(raw)) issues.push({ key, problem: "måste vara ett heltal" });
        break;
      case "bool":
        if (raw !== "true" && raw !== "false") issues.push({ key, problem: 'måste vara "true" eller "false"' });
        break;
      case "url":
        if (raw && !/^https?:\/\//.test(raw)) issues.push({ key, problem: "måste börja med http:// eller https://" });
        break;
      case "enum": {
        const allowed = (meta.enumValues ?? "").split(",").map((s) => s.trim()).filter(Boolean);
        if (raw && !allowed.includes(raw))
          issues.push({ key, problem: `måste vara ett av: ${allowed.join(", ")}` });
        break;
      }
    }
  }
  return issues;
}
