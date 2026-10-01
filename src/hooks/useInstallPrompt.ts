import { useCallback, useEffect, useState } from 'react';

/** The event Chrome and Edge fire when the app can be installed (not in the DOM typings). */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * The install offer of the browser, kept to be shown from a button of the app. `canInstall` is false when the app
 * is already installed, when the browser has no such offer (Firefox, Safari) or before it makes it.
 */
export function useInstallPrompt() {
  const [offer, setOffer] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const onBeforeInstall = (event: Event) => {
      event.preventDefault(); // the browser's own banner is replaced by the button
      setOffer(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setOffer(null);
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!offer) return;
    await offer.prompt();
    // An offer can be used once, accepted or not
    setOffer(null);
  }, [offer]);

  return { canInstall: offer !== null, install };
}
