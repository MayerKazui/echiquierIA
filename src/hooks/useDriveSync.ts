import { useEffect, useSyncExternalStore } from 'react';
import { getDriveSync } from '../services/driveSyncInstance';
import type { DriveSyncManager, SyncStatus } from '../services/driveSyncManager';

/** The state of the Google Drive sync (re-rendered when it changes). */
export function useDriveSync(manager: DriveSyncManager = getDriveSync()): SyncStatus {
  return useSyncExternalStore(manager.subscribe, manager.getStatus);
}

/**
 * Starts the automatic sync when the app opens (if the user turned it on), and tries again what could not be done
 * when the network is back.
 */
export function useDriveSyncLifecycle(manager: DriveSyncManager = getDriveSync()): void {
  useEffect(() => {
    manager.start();
    const resume = () => manager.resume();
    window.addEventListener('online', resume);
    return () => window.removeEventListener('online', resume);
  }, [manager]);
}
