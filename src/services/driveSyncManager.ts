import { AuthError, type TokenProvider } from './googleAuth';
import { DriveError } from './googleDrive';
import { describeSyncError, type DriveSyncReport } from './driveSync';

/**
 * Keeps the Google Drive sync going without a click, once the user turned it on: at the opening of the app, then a
 * moment after each game is added or deleted. It also holds what the screens show (the state, the date of the last
 * sync) and is shared by the sync button, so that a click and an automatic sync never run at once and share the
 * Google token.
 *
 * A sync nobody asked for must not open a Google pop-up (the browser blocks it without a click, and it would be
 * rude). It asks Google for the token silently; when that does not work (token expired and Google wants the user
 * back) the state becomes `needs-signin`, a button offers to sign in again, and the changes wait.
 */

export type SyncPhase =
  /** The automatic sync is off. */
  | 'off'
  /** On, nothing to do. */
  | 'idle'
  /** On, a change was seen: the sync starts after a quiet moment. */
  | 'waiting'
  | 'syncing'
  /** Google wants the user to sign in again (the token expired): waits for a click. */
  | 'needs-signin'
  | 'error';

export interface SyncStatus {
  phase: SyncPhase;
  /** The user turned the automatic sync on. */
  enabled: boolean;
  /** When the last sync (automatic or not) succeeded, on this device. */
  lastSync: number | null;
  /** What went wrong, when `phase` is `needs-signin` or `error`. */
  message: string | null;
  /** The Google sign-in script: loaded before the click, a pop-up opened after an `await` is blocked. */
  script: 'loading' | 'ready' | 'failed';
}

type Listener = () => void;
type Timer = ReturnType<typeof setTimeout>;

/** Where the manager keeps what is specific to this device (not part of the backup). */
export const AUTO_SYNC_KEY = 'chess_drive_auto_sync';
export const LAST_SYNC_KEY = 'chess_drive_last_sync';

/** A quiet moment after a change: a batch analysis saves a game every few seconds, one sync is enough. */
export const SYNC_DELAY_MS = 30_000;
/** Wait after the opening of the app, so that the page is not slowed down while it starts. */
export const START_DELAY_MS = 3_000;

export interface DriveSyncManagerDeps {
  /** Without a client ID the sync is not offered at all. */
  clientId: string | undefined;
  tokens: () => TokenProvider;
  /** One sync. `interactive` is false when nobody clicked. */
  run: (tokens: TokenProvider, interactive: boolean) => Promise<DriveSyncReport>;
  /** Subscribes to the changes of the games here; returns the unsubscription. */
  onChange: (listener: Listener) => () => void;
  loadScript: () => Promise<void>;
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  delayMs?: number;
  startDelayMs?: number;
  now?: () => number;
  setTimer?: (callback: () => void, ms: number) => Timer;
  clearTimer?: (timer: Timer) => void;
  isOnline?: () => boolean;
}

export interface DriveSyncManager {
  /** Whether the sync is offered (a client ID was given at build time). */
  readonly available: boolean;
  getStatus(): SyncStatus;
  subscribe(listener: Listener): () => void;
  /** Called after a sync brought something into this browser (the screens read the games again). */
  subscribeRestored(listener: Listener): () => void;
  /** Loads the Google script (a failure can be tried again). */
  prepare(): Promise<void>;
  /** The opening of the app: if the automatic sync is on, it starts watching and syncs soon. */
  start(): void;
  setEnabled(enabled: boolean): void;
  /** A sync now, from a click (may open the Google pop-up). Joins one that is already running. Throws on failure. */
  syncNow(): Promise<DriveSyncReport>;
  /** The network is back: tries again what could not be done. */
  resume(): void;
}

/** Whether the failure means "the user has to sign in again" rather than a fault. */
function needsSignIn(err: unknown): boolean {
  if (err instanceof AuthError) return err.kind !== 'unavailable' && err.kind !== 'other';
  return err instanceof DriveError && err.kind === 'unauthorized';
}

export function createDriveSyncManager(deps: DriveSyncManagerDeps): DriveSyncManager {
  const {
    clientId,
    run,
    onChange,
    loadScript,
    storage,
    delayMs = SYNC_DELAY_MS,
    startDelayMs = START_DELAY_MS,
    now = Date.now,
    setTimer = (callback, ms) => setTimeout(callback, ms),
    clearTimer = (timer) => clearTimeout(timer),
    isOnline = () => (typeof navigator === 'undefined' ? true : navigator.onLine),
  } = deps;

  const read = (key: string): string | null => {
    try {
      return storage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  };
  const write = (key: string, value: string | null): void => {
    try {
      if (value === null) storage?.removeItem(key);
      else storage?.setItem(key, value);
    } catch {
      // Storage unavailable: the choice is just not remembered
    }
  };

  const savedLastSync = Number(read(LAST_SYNC_KEY));
  const enabledAtStart = clientId !== undefined && read(AUTO_SYNC_KEY) === '1';
  let status: SyncStatus = {
    phase: enabledAtStart ? 'idle' : 'off',
    enabled: enabledAtStart,
    lastSync: Number.isFinite(savedLastSync) && savedLastSync > 0 ? savedLastSync : null,
    message: null,
    script: 'loading',
  };

  const listeners = new Set<Listener>();
  const restoredListeners = new Set<Listener>();
  const emit = (set: Set<Listener>) => {
    for (const listener of [...set]) listener();
  };
  const update = (patch: Partial<SyncStatus>) => {
    status = { ...status, ...patch };
    emit(listeners);
  };

  let timer: Timer | null = null;
  let unwatch: (() => void) | null = null;
  let inflight: Promise<DriveSyncReport> | null = null;
  /** A change came while a sync was running or while it could not run. */
  let pending = false;
  let scriptPromise: Promise<void> | null = null;
  let started = false;

  const stopTimer = () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
  };

  const schedule = (ms: number) => {
    if (!status.enabled) return;
    if (inflight) {
      pending = true;
      return;
    }
    if (status.phase === 'needs-signin') {
      pending = true; // a silent try would only fail again: the user's click will sync everything
      return;
    }
    stopTimer();
    update({ phase: 'waiting' });
    timer = setTimer(() => {
      timer = null;
      if (!isOnline()) return; // `resume` starts it again
      void runSync(false).catch(() => {});
    }, ms);
  };

  const runSync = (interactive: boolean): Promise<DriveSyncReport> => {
    if (inflight) return inflight;
    stopTimer();
    pending = false;
    update({ phase: 'syncing', message: null });
    const attempt = (async () => {
      try {
        const report = await run(deps.tokens(), interactive);
        const time = now();
        write(LAST_SYNC_KEY, String(time));
        update({ phase: status.enabled ? 'idle' : 'off', lastSync: time, message: null });
        if (report.restore) emit(restoredListeners);
        return report;
      } catch (err) {
        const message = describeSyncError(err);
        update({
          phase: !status.enabled ? 'off' : needsSignIn(err) ? 'needs-signin' : 'error',
          message,
        });
        throw err;
      } finally {
        inflight = null;
        if (pending && status.phase === 'idle') schedule(delayMs);
      }
    })();
    inflight = attempt;
    return attempt;
  };

  const watch = () => {
    unwatch ??= onChange(() => schedule(delayMs));
  };

  const prepare = (): Promise<void> => {
    if (!clientId) return Promise.resolve();
    if (status.script === 'ready') return Promise.resolve();
    scriptPromise ??= loadScript().then(
      () => update({ script: 'ready' }),
      (err: unknown) => {
        scriptPromise = null;
        update({ script: 'failed' });
        throw err;
      }
    );
    update({ script: 'loading' });
    return scriptPromise;
  };

  return {
    available: clientId !== undefined,
    getStatus: () => status,
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    subscribeRestored(listener) {
      restoredListeners.add(listener);
      return () => void restoredListeners.delete(listener);
    },
    prepare,
    start() {
      if (started || !clientId) return;
      started = true;
      if (!status.enabled) return;
      watch();
      prepare().then(
        () => schedule(startDelayMs),
        () => update({ phase: 'error', message: describeSyncError(new AuthError('unavailable', 'script')) })
      );
    },
    setEnabled(enabled) {
      if (!clientId || enabled === status.enabled) return;
      write(AUTO_SYNC_KEY, enabled ? '1' : null);
      if (enabled) {
        update({ enabled: true, phase: 'idle', message: null });
        watch();
        schedule(startDelayMs);
      } else {
        stopTimer();
        pending = false;
        unwatch?.();
        unwatch = null;
        update({ enabled: false, phase: inflight ? 'syncing' : 'off', message: null });
      }
    },
    syncNow: () => runSync(true),
    resume() {
      if (!status.enabled || inflight || timer !== null) return;
      if (status.phase === 'error' || (status.phase === 'waiting' && isOnline())) schedule(startDelayMs);
    },
  };
}
