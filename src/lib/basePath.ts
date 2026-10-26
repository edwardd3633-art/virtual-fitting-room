/**
 * URL prefix when the site is served from a sub-path, e.g. GitHub Pages at
 * https://<user>.github.io/<repo>/. next/link adds it automatically; files we
 * fetch ourselves (garment GLBs) need it added here. Empty for local dev.
 */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export function withBasePath(url: string): string {
  return url.startsWith("/") ? `${BASE_PATH}${url}` : url;
}
