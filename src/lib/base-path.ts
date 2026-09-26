/**
 * Prefixes a root-relative path with BASE_PATH (see next.config.ts), for
 * URLs built by hand — <Link> and redirect() add it automatically.
 * Server-side only: BASE_PATH isn't exposed to the browser bundle.
 */
export function withBasePath(path: string): string {
  return `${process.env.BASE_PATH ?? ""}${path}`;
}
