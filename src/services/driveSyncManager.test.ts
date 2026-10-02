import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DriveSyncReport } from './driveSync';
import { AuthError, type TokenProvider } from './googleAuth';
import { DriveError } from './googleDrive';
import {
  AUTO_SYNC_KEY,
  LAST_SYNC_KEY,
  SYNC_DELAY_MS,
  START_DELAY_MS,
  createDriveSyncManager,
  type DriveSyncManagerDeps,
} from './driveSyncManager';

const report = (over: Partial<DriveSyncReport> = {}): DriveSyncReport => ({
  restore: null,
  rejected: { games: 0, cards: 0, studies: 0 },
  sent: { games: 1, cards: 0, studies: 0, bytes: 100 },
  ...over,
});

/** A clock and timers the test moves by hand. */
function fakeClock() {
  let time = 1_000_000;
  const timers = new Map<number, { at: number; callback: () => void }>();
  let nextId = 1;
  return {
    now: () => time,
    setTimer: (callback: () => void, ms: number) => {
      const id = nextId++;
      timers.set(id, { at: time + ms, callback });
      return id as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimer: (id: ReturnType<typeof setTimeout>) => void timers.delete(id as unknown as number),
    pending: () => timers.size,
    /** Moves the time forward, running the timers that come due. */
    async advance(ms: number) {
      time += ms;
      for (const [id, timer] of [...timers]) {
        if (timer.at <= time) {
          timers.delete(id);
          timer.callback();
        }
      }
      await flush();
    },
  };
}

const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}

function setup(over: Partial<DriveSyncManagerDeps> = {}, stored: Record<string, string> = {}) {
  const clock = fakeClock();
  const storage = memoryStorage(stored);
  const changes = new Set<() => void>();
  const tokens = { getToken: vi.fn(), invalidate: vi.fn() } as unknown as TokenProvider;
  const run = vi.fn<DriveSyncManagerDeps['run']>(() => Promise.resolve(report()));
  const online = { value: true };
  const deps: DriveSyncManagerDeps = {
    clientId: 'client',
    tokens: () => tokens,
    run,
    onChange: (listener) => {
      changes.add(listener);
      return () => void changes.delete(listener);
    },
    loadScript: () => Promise.resolve(),
    storage,
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    isOnline: () => online.value,
    ...over,
  };
  const manager = createDriveSyncManager(deps);
  const phases: string[] = [];
  manager.subscribe(() => {
    const phase = manager.getStatus().phase;
    if (phases.at(-1) !== phase) phases.push(phase);
  });
  return {
    manager,
    clock,
    storage,
    run,
    tokens,
    online,
    phases,
    changeGames: () => changes.forEach((listener) => listener()),
    watchers: () => changes.size,
  };
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('availability and start state', () => {
  it('is not available without a client ID, and does nothing', async () => {
    const t = setup({ clientId: undefined }, { [AUTO_SYNC_KEY]: '1' });
    expect(t.manager.available).toBe(false);
    t.manager.start();
    t.manager.setEnabled(true);
    expect(t.manager.getStatus()).toMatchObject({ enabled: false, phase: 'off' });
    expect(t.watchers()).toBe(0);
    await t.manager.prepare();
    expect(t.manager.getStatus().script).toBe('loading');
  });

  it('starts off, with the date of the last sync remembered on this device', () => {
    expect(setup().manager.getStatus()).toEqual({
      phase: 'off',
      enabled: false,
      lastSync: null,
      message: null,
      script: 'loading',
    });
    expect(setup({}, { [LAST_SYNC_KEY]: '12345' }).manager.getStatus().lastSync).toBe(12345);
  });

  it('ignores a last sync date that is not one', () => {
    expect(setup({}, { [LAST_SYNC_KEY]: 'abc' }).manager.getStatus().lastSync).toBeNull();
    expect(setup({}, { [LAST_SYNC_KEY]: '0' }).manager.getStatus().lastSync).toBeNull();
    expect(setup({}, { [LAST_SYNC_KEY]: '-5' }).manager.getStatus().lastSync).toBeNull();
  });

  it('is on when the user turned it on before', () => {
    expect(setup({}, { [AUTO_SYNC_KEY]: '1' }).manager.getStatus()).toMatchObject({ enabled: true, phase: 'idle' });
  });

  it('survives a storage that throws', () => {
    const throwing = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    const t = setup({ storage: throwing });
    expect(t.manager.getStatus().enabled).toBe(false);
    t.manager.setEnabled(true);
    expect(t.manager.getStatus().enabled).toBe(true);
  });
});

describe('opening of the app', () => {
  it('syncs shortly after the opening when the automatic sync is on, without a pop-up', async () => {
    const t = setup({}, { [AUTO_SYNC_KEY]: '1' });
    t.manager.start();
    await flush();
    expect(t.manager.getStatus()).toMatchObject({ phase: 'waiting', script: 'ready' });
    expect(t.run).not.toHaveBeenCalled();
    await t.clock.advance(START_DELAY_MS - 1);
    expect(t.run).not.toHaveBeenCalled();
    await t.clock.advance(1);
    expect(t.run).toHaveBeenCalledTimes(1);
    expect(t.run.mock.calls[0][1]).toBe(false);
    expect(t.manager.getStatus()).toMatchObject({ phase: 'idle', lastSync: t.clock.now() });
  });

  it('does nothing when it is off', async () => {
    const t = setup();
    t.manager.start();
    await t.clock.advance(60_000);
    expect(t.run).not.toHaveBeenCalled();
    expect(t.watchers()).toBe(0);
  });

  it('starts only once', async () => {
    const t = setup({}, { [AUTO_SYNC_KEY]: '1' });
    t.manager.start();
    t.manager.start();
    await flush();
    await t.clock.advance(START_DELAY_MS);
    expect(t.run).toHaveBeenCalledTimes(1);
    expect(t.watchers()).toBe(1);
  });

  it('says so when the Google script cannot be loaded', async () => {
    const t = setup({ loadScript: () => Promise.reject(new Error('blocked')) }, { [AUTO_SYNC_KEY]: '1' });
    t.manager.start();
    await flush();
    expect(t.manager.getStatus()).toMatchObject({ phase: 'error', script: 'failed' });
    expect(t.manager.getStatus().message).toContain('connexion de Google');
  });
});

describe('after a change', () => {
  const on = async () => {
    const t = setup({}, { [AUTO_SYNC_KEY]: '1' });
    t.manager.start();
    await flush();
    await t.clock.advance(START_DELAY_MS);
    t.run.mockClear();
    return t;
  };

  it('syncs after a quiet moment, once, whatever the number of changes', async () => {
    const t = await on();
    t.changeGames();
    expect(t.manager.getStatus().phase).toBe('waiting');
    await t.clock.advance(SYNC_DELAY_MS - 1000);
    t.changeGames();
    await t.clock.advance(SYNC_DELAY_MS - 1000); // the wait restarted
    expect(t.run).not.toHaveBeenCalled();
    t.changeGames();
    await t.clock.advance(SYNC_DELAY_MS);
    expect(t.run).toHaveBeenCalledTimes(1);
    expect(t.manager.getStatus().phase).toBe('idle');
  });

  it('does not sync for a change when it is off', async () => {
    const t = setup();
    t.manager.start();
    t.changeGames();
    await t.clock.advance(SYNC_DELAY_MS * 2);
    expect(t.run).not.toHaveBeenCalled();
  });

  it('syncs again for a change that came during a sync', async () => {
    const t = await on();
    let finish: (value: DriveSyncReport) => void = () => {};
    t.run.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    t.changeGames();
    await t.clock.advance(SYNC_DELAY_MS);
    expect(t.manager.getStatus().phase).toBe('syncing');
    t.changeGames();
    finish(report());
    await flush();
    expect(t.manager.getStatus().phase).toBe('waiting');
    await t.clock.advance(SYNC_DELAY_MS);
    expect(t.run).toHaveBeenCalledTimes(2);
  });

  it('does not sync again when nothing changed during the sync', async () => {
    const t = await on();
    t.changeGames();
    await t.clock.advance(SYNC_DELAY_MS);
    await t.clock.advance(SYNC_DELAY_MS * 5);
    expect(t.run).toHaveBeenCalledTimes(1);
    expect(t.clock.pending()).toBe(0);
  });

  it('waits for the network and syncs when it is back', async () => {
    const t = await on();
    t.online.value = false;
    t.changeGames();
    await t.clock.advance(SYNC_DELAY_MS);
    expect(t.run).not.toHaveBeenCalled();
    expect(t.manager.getStatus().phase).toBe('waiting');
    t.online.value = true;
    t.manager.resume();
    await t.clock.advance(START_DELAY_MS);
    expect(t.run).toHaveBeenCalledTimes(1);
  });

  it('resume does nothing when there is nothing to retry', async () => {
    const t = await on();
    t.manager.resume();
    expect(t.clock.pending()).toBe(0);
    const off = setup();
    off.manager.resume();
    expect(off.clock.pending()).toBe(0);
  });

  it('resume does not start a second wait, nor shorten the one running', async () => {
    const t = await on();
    t.changeGames();
    t.manager.resume();
    expect(t.clock.pending()).toBe(1);
    await t.clock.advance(START_DELAY_MS);
    expect(t.run).not.toHaveBeenCalled();
    await t.clock.advance(SYNC_DELAY_MS - START_DELAY_MS);
    expect(t.run).toHaveBeenCalledTimes(1);
  });

  it('resume does not interrupt a sync that is running', async () => {
    const t = await on();
    let finish: (value: DriveSyncReport) => void = () => {};
    t.run.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    t.changeGames();
    await t.clock.advance(SYNC_DELAY_MS);
    t.manager.resume();
    expect(t.clock.pending()).toBe(0);
    finish(report());
    await flush();
    expect(t.run).toHaveBeenCalledTimes(1);
  });

  it('retries after an error at the next change', async () => {
    const t = await on();
    t.run.mockRejectedValueOnce(new DriveError('unavailable', 'down'));
    t.changeGames();
    await t.clock.advance(SYNC_DELAY_MS);
    expect(t.manager.getStatus()).toMatchObject({ phase: 'error' });
    expect(t.manager.getStatus().message).toContain('indisponible');
    t.changeGames();
    await t.clock.advance(SYNC_DELAY_MS);
    expect(t.manager.getStatus().phase).toBe('idle');
    expect(t.run).toHaveBeenCalledTimes(2);
  });

  it('retries after an error when the network is back', async () => {
    const t = await on();
    t.run.mockRejectedValueOnce(new DriveError('network', 'offline'));
    t.changeGames();
    await t.clock.advance(SYNC_DELAY_MS);
    expect(t.manager.getStatus().phase).toBe('error');
    t.manager.resume();
    await t.clock.advance(START_DELAY_MS);
    expect(t.manager.getStatus().phase).toBe('idle');
  });
});

describe('when Google wants the user to sign in again', () => {
  const needsSignIn = async (err: unknown = new AuthError('interaction', 'x')) => {
    const t = setup({}, { [AUTO_SYNC_KEY]: '1' });
    t.run.mockRejectedValueOnce(err);
    t.manager.start();
    await flush();
    await t.clock.advance(START_DELAY_MS);
    return t;
  };

  it('waits for a click: the state says so, and nothing is tried again by itself', async () => {
    const t = await needsSignIn();
    expect(t.manager.getStatus()).toMatchObject({
      phase: 'needs-signin',
      message: 'Google demande de vous reconnecter.',
    });
    t.changeGames();
    await t.clock.advance(SYNC_DELAY_MS * 3);
    t.manager.resume();
    await t.clock.advance(SYNC_DELAY_MS * 3);
    expect(t.run).toHaveBeenCalledTimes(1);
    expect(t.manager.getStatus().phase).toBe('needs-signin');
  });

  it('a click syncs interactively and gets back to normal; the changes that waited went with it', async () => {
    const t = await needsSignIn();
    t.changeGames();
    const result = await t.manager.syncNow();
    expect(t.run).toHaveBeenCalledTimes(2);
    expect(t.run.mock.calls[1][1]).toBe(true);
    expect(result.sent).not.toBeNull();
    expect(t.manager.getStatus()).toMatchObject({ phase: 'idle', message: null });
    await t.clock.advance(SYNC_DELAY_MS * 2);
    expect(t.run).toHaveBeenCalledTimes(2);
  });

  it('a change during the click sync is sent afterwards', async () => {
    const t = await needsSignIn();
    let finish: (value: DriveSyncReport) => void = () => {};
    t.run.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    const click = t.manager.syncNow();
    t.changeGames();
    finish(report());
    await click;
    expect(t.manager.getStatus().phase).toBe('waiting');
    await t.clock.advance(SYNC_DELAY_MS);
    expect(t.run).toHaveBeenCalledTimes(3);
  });

  it('is the state too for a token Google refused twice', async () => {
    const t = await needsSignIn(new DriveError('unauthorized', 'x'));
    expect(t.manager.getStatus().phase).toBe('needs-signin');
  });

  it.each(['cancelled', 'blocked', 'denied'] as const)('is the state too after a %s sign-in', async (kind) => {
    const t = await needsSignIn(new AuthError(kind, 'x'));
    expect(t.manager.getStatus().phase).toBe('needs-signin');
  });

  it.each([
    new AuthError('unavailable', 'x'),
    new AuthError('other', 'x'),
    new DriveError('quota', 'x'),
    new Error('boom'),
  ])('is an error, not a sign-in, for %s', async (err) => {
    const t = await needsSignIn(err);
    expect(t.manager.getStatus().phase).toBe('error');
  });

  it('a click that is cancelled leaves the state as it was and throws', async () => {
    const t = await needsSignIn();
    t.run.mockRejectedValueOnce(new AuthError('cancelled', 'closed'));
    await expect(t.manager.syncNow()).rejects.toMatchObject({ kind: 'cancelled' });
    expect(t.manager.getStatus().phase).toBe('needs-signin');
  });
});

describe('syncNow', () => {
  it('syncs with a click, records the date, and tells the screens when games came', async () => {
    const t = setup();
    const restored = vi.fn();
    t.manager.subscribeRestored(restored);
    const games = { added: 1, replaced: 0, kept: 0, trimmed: 0, deleted: 0 };
    t.run.mockResolvedValueOnce(report({ restore: { games, cards: null, studies: null, preferencesApplied: 0 } }));
    await t.manager.syncNow();
    expect(restored).toHaveBeenCalledTimes(1);
    expect(t.manager.getStatus()).toMatchObject({ phase: 'off', lastSync: t.clock.now() });
    expect(t.storage.data.get(LAST_SYNC_KEY)).toBe(String(t.clock.now()));
  });

  it('does not tell the screens when Drive had nothing', async () => {
    const t = setup();
    const restored = vi.fn();
    t.manager.subscribeRestored(restored);
    await t.manager.syncNow();
    expect(restored).not.toHaveBeenCalled();
  });

  it('joins the sync that is running instead of starting another', async () => {
    const t = setup();
    let finish: (value: DriveSyncReport) => void = () => {};
    t.run.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    const first = t.manager.syncNow();
    const second = t.manager.syncNow();
    finish(report());
    await Promise.all([first, second]);
    expect(t.run).toHaveBeenCalledTimes(1);
  });

  it('cancels the wait of an automatic sync it replaces', async () => {
    const t = setup({}, { [AUTO_SYNC_KEY]: '1' });
    t.manager.start();
    await flush();
    t.changeGames();
    expect(t.clock.pending()).toBe(1);
    await t.manager.syncNow();
    expect(t.clock.pending()).toBe(0);
    await t.clock.advance(SYNC_DELAY_MS * 2);
    expect(t.run).toHaveBeenCalledTimes(1);
  });

  it('throws the failure and keeps the date of the last good sync', async () => {
    const t = setup({}, { [LAST_SYNC_KEY]: '777' });
    t.run.mockRejectedValueOnce(new DriveError('quota', 'full'));
    await expect(t.manager.syncNow()).rejects.toMatchObject({ kind: 'quota' });
    expect(t.manager.getStatus()).toMatchObject({ lastSync: 777, phase: 'off' });
    expect(t.manager.getStatus().message).toContain('plein');
  });

  it('gives the sync the token provider it was built with', async () => {
    const t = setup();
    await t.manager.syncNow();
    expect(t.run.mock.calls[0][0]).toBe(t.tokens);
  });

  it('shows the state while it runs', async () => {
    const t = setup();
    await t.manager.syncNow();
    expect(t.phases).toEqual(['syncing', 'off']);
  });
});

describe('turning it on and off', () => {
  it('remembers the choice on this device and syncs soon after turning it on', async () => {
    const t = setup();
    t.manager.setEnabled(true);
    expect(t.storage.data.get(AUTO_SYNC_KEY)).toBe('1');
    expect(t.manager.getStatus()).toMatchObject({ enabled: true, phase: 'waiting' });
    expect(t.watchers()).toBe(1);
    await t.clock.advance(START_DELAY_MS);
    expect(t.run).toHaveBeenCalledTimes(1);
  });

  it('turning it off stops watching, cancels the wait and forgets the choice', async () => {
    const t = setup({}, { [AUTO_SYNC_KEY]: '1' });
    t.manager.start();
    await flush();
    t.changeGames();
    t.manager.setEnabled(false);
    expect(t.storage.data.has(AUTO_SYNC_KEY)).toBe(false);
    expect(t.manager.getStatus()).toMatchObject({ enabled: false, phase: 'off' });
    expect(t.watchers()).toBe(0);
    expect(t.clock.pending()).toBe(0);
    t.changeGames();
    await t.clock.advance(SYNC_DELAY_MS * 2);
    expect(t.run).not.toHaveBeenCalled();
  });

  it('does not change anything when set to what it already is', () => {
    const t = setup();
    t.manager.setEnabled(false);
    expect(t.storage.data.size).toBe(0);
    t.manager.setEnabled(true);
    const before = t.manager.getStatus();
    t.manager.setEnabled(true);
    expect(t.manager.getStatus()).toBe(before);
  });

  it('turned off during a sync: the sync ends and the state is off', async () => {
    const t = setup({}, { [AUTO_SYNC_KEY]: '1' });
    let finish: (value: DriveSyncReport) => void = () => {};
    t.run.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    t.manager.start();
    await flush();
    await t.clock.advance(START_DELAY_MS);
    expect(t.manager.getStatus().phase).toBe('syncing');
    t.manager.setEnabled(false);
    expect(t.manager.getStatus().phase).toBe('syncing');
    finish(report());
    await flush();
    expect(t.manager.getStatus()).toMatchObject({ phase: 'off', enabled: false });
    t.changeGames();
    await t.clock.advance(SYNC_DELAY_MS);
    expect(t.run).toHaveBeenCalledTimes(1);
  });

  it('turning it on again after off watches once only', () => {
    const t = setup();
    t.manager.setEnabled(true);
    t.manager.setEnabled(false);
    t.manager.setEnabled(true);
    expect(t.watchers()).toBe(1);
  });
});

describe('prepare (the Google script)', () => {
  it('loads it once and says when it is ready', async () => {
    const loadScript = vi.fn(() => Promise.resolve());
    const t = setup({ loadScript });
    await t.manager.prepare();
    await t.manager.prepare();
    expect(loadScript).toHaveBeenCalledTimes(1);
    expect(t.manager.getStatus().script).toBe('ready');
  });

  it('says when it failed, and tries again the next time', async () => {
    const loadScript = vi.fn().mockRejectedValueOnce(new Error('blocked')).mockResolvedValue(undefined);
    const t = setup({ loadScript });
    await expect(t.manager.prepare()).rejects.toThrow('blocked');
    expect(t.manager.getStatus().script).toBe('failed');
    await t.manager.prepare();
    expect(loadScript).toHaveBeenCalledTimes(2);
    expect(t.manager.getStatus().script).toBe('ready');
  });

  it('tells the subscribers of each change, and stops once unsubscribed', async () => {
    const t = setup();
    const listener = vi.fn();
    const stop = t.manager.subscribe(listener);
    await t.manager.prepare();
    const calls = listener.mock.calls.length;
    expect(calls).toBeGreaterThan(0);
    stop();
    t.manager.setEnabled(true);
    expect(listener).toHaveBeenCalledTimes(calls);
  });

  it('gives the same status object until something changes (for the screens)', () => {
    const t = setup();
    expect(t.manager.getStatus()).toBe(t.manager.getStatus());
  });
});
