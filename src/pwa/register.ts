import { assetUrl } from '../utils/siteUrl';

/** What registering needs of the browser (replaced in tests). */
export interface ServiceWorkerContainerLike extends EventTarget {
  controller: ServiceWorker | null;
  register(url: string, options?: RegistrationOptions): Promise<ServiceWorkerRegistration>;
}

/** The service worker is built with the app: it does not exist in development, where it would only get in the way. */
export const isServiceWorkerEnabled = (): boolean =>
  import.meta.env.PROD && typeof navigator !== 'undefined' && 'serviceWorker' in navigator;

/** Registers `sw.js`, which sits next to the page (under the base path of the site). */
export function registerServiceWorker(
  container: ServiceWorkerContainerLike = navigator.serviceWorker,
  base: string = import.meta.env.BASE_URL
): Promise<ServiceWorkerRegistration> {
  return container.register(assetUrl('sw.js', base), { scope: base });
}
