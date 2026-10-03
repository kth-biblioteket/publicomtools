import "server-only";

/**
 * The EZproxy stanza file (kth-biblioteket/ezproxy, a private repo) lists the domains
 * of the library's licensed databases. Open guest computers allow those domains. It
 * used to be fetched by every computer with a GITHUB_TOKEN in its .secrets; now only
 * this server holds a token (EZPROXY_GITHUB_TOKEN) and the computers fetch the file here.
 */

const SOURCE = process.env.EZPROXY_STANZAS_URL || "https://raw.githubusercontent.com/kth-biblioteket/ezproxy/main/db_stanzas.txt";
const FRESH_MS = 60 * 60 * 1000;

let cache: { text: string; fetchedAt: number } | null = null;

/** The stanza file, cached for an hour. If GitHub fails, the last good copy is returned (or null). */
export async function getEzproxyStanzas(): Promise<{ text: string; stale: boolean } | null> {
  if (cache && Date.now() - cache.fetchedAt < FRESH_MS) return { text: cache.text, stale: false };

  const token = process.env.EZPROXY_GITHUB_TOKEN;
  if (token) {
    try {
      const res = await fetch(SOURCE, {
        headers: { Authorization: `token ${token}`, "User-Agent": "publicomtools" },
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
      const text = res.ok ? await res.text() : "";
      // A real stanza file has URL/HJ/DJ lines; anything else (an error page) is not cached.
      if (/^(URL|HJ|DJ)\s/m.test(text)) {
        cache = { text, fetchedAt: Date.now() };
        return { text, stale: false };
      }
      console.error(`ezproxy: GitHub svarade ${res.status} för stanzafilen`);
    } catch (e) {
      console.error("ezproxy: kunde inte hämta stanzafilen", e);
    }
  } else {
    console.error("ezproxy: EZPROXY_GITHUB_TOKEN saknas");
  }
  return cache ? { text: cache.text, stale: true } : null;
}
