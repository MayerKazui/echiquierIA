/**
 * URLs the app builds at run time. Two things can differ from "everything at the root of one server":
 * - the site may live in a sub-folder (GitHub Pages project site: `/echiquierIA/`), which is Vite's `base`;
 * - the API may live on another host (static front-end on GitHub Pages, API on Cloud Run): `VITE_API_URL`.
 */

/** URL of a file served next to the app (the engine, the openings), under the site's base path. */
export function assetUrl(path: string, base: string = import.meta.env.BASE_URL): string {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

/** URL of an API route: relative to the page by default, or on the host named by `VITE_API_URL`. */
export function apiUrl(path: string, apiBase: string | undefined = import.meta.env.VITE_API_URL): string {
  return `${(apiBase ?? '').trim().replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}
