import { onGamesChanged } from './gameStore';
import { createTokenProvider, googleClientId, loadGoogleIdentity, type TokenProvider } from './googleAuth';
import { syncWithDrive } from './driveSync';
import { createDriveSyncManager, type DriveSyncManager } from './driveSyncManager';

let instance: DriveSyncManager | null = null;

function safeStorage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

/** The one Drive sync of the app (shared by the button, the automatic sync and the banner). */
export function getDriveSync(): DriveSyncManager {
  if (!instance) {
    const clientId = googleClientId();
    let tokens: TokenProvider | null = null;
    instance = createDriveSyncManager({
      clientId,
      tokens: () => (tokens ??= createTokenProvider({ clientId: clientId ?? '' })),
      run: (provider, interactive) => syncWithDrive({ tokens: provider, interactive }),
      onChange: onGamesChanged,
      loadScript: () => loadGoogleIdentity(),
      storage: safeStorage(),
    });
  }
  return instance;
}
