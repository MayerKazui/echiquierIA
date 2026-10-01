import { useCallback, useEffect, useRef, useState } from 'react';
import { isServiceWorkerEnabled, registerServiceWorker, type ServiceWorkerContainerLike } from '../pwa/register';

/** How often (ms) a tab that stays open asks whether a new version was deployed. */
export const UPDATE_CHECK_MS = 60 * 60 * 1000;

interface Options {
  enabled?: boolean;
  container?: ServiceWorkerContainerLike;
  register?: typeof registerServiceWorker;
  reload?: () => void;
}

/**
 * Registers the service worker (the app then works offline) and tells when a new version is ready: the page keeps
 * running on the version it started with, so that it is never mixed with the files of another one, until the
 * player chooses to `applyUpdate` (the new version takes over and the page reloads).
 */
export function useServiceWorkerUpdate({
  enabled = isServiceWorkerEnabled(),
  container = typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined,
  register = registerServiceWorker,
  reload = () => window.location.reload(),
}: Options = {}) {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const isApplying = useRef(false);

  useEffect(() => {
    if (!enabled || !container) return;
    let isCurrent = true;
    let timer: ReturnType<typeof setInterval> | undefined;
    let registration: ServiceWorkerRegistration | undefined;

    // A worker that is waiting while another one controls the page is an update (the first one is no update)
    const watch = (candidate: ServiceWorker | null) => {
      if (candidate && container.controller && isCurrent) setWaiting(candidate);
    };
    const check = () => void registration?.update().catch(() => {});
    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };

    register(container)
      .then((reg) => {
        if (!isCurrent) return;
        registration = reg;
        watch(reg.waiting);
        reg.addEventListener('updatefound', () => {
          const installing = reg.installing;
          installing?.addEventListener('statechange', () => {
            if (installing.state === 'installed') watch(installing);
          });
        });
        timer = setInterval(check, UPDATE_CHECK_MS);
        document.addEventListener('visibilitychange', onVisible);
      })
      .catch((error) => console.warn('Service worker not registered:', error));

    return () => {
      isCurrent = false;
      if (timer) clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, container, register]);

  const applyUpdate = useCallback(() => {
    if (!waiting || !container || isApplying.current) return;
    isApplying.current = true;
    // The new worker takes control, then the page is reloaded to run on its files
    container.addEventListener('controllerchange', reload, { once: true });
    waiting.postMessage({ type: 'SKIP_WAITING' });
  }, [waiting, container, reload]);

  return { updateReady: waiting !== null, applyUpdate };
}
