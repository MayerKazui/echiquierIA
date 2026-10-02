// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthError, createTokenProvider, googleClientId, loadGoogleIdentity, type GoogleOAuth2 } from './googleAuth';
import { DRIVE_SCOPE } from './googleDrive';

type Config = Parameters<GoogleOAuth2['initTokenClient']>[0];

/** A Google API that answers each token request with the next scripted outcome. */
function fakeGoogle(...outcomes: ((config: Config) => void)[]) {
  const requests: { config: Config; prompt?: string }[] = [];
  const queue = [...outcomes];
  const api: GoogleOAuth2 = {
    initTokenClient: (config) => ({
      requestAccessToken: (overrides) => {
        requests.push({ config, prompt: overrides?.prompt });
        queue.shift()?.(config);
      },
    }),
  };
  return { api, requests };
}

const grant =
  (token: string, extra: Record<string, unknown> = {}) =>
  (config: Config) =>
    config.callback({ access_token: token, expires_in: 3600, scope: DRIVE_SCOPE, ...extra });

describe('googleClientId', () => {
  it('gives the trimmed ID, or nothing', () => {
    expect(googleClientId(' abc.apps.googleusercontent.com ')).toBe('abc.apps.googleusercontent.com');
    expect(googleClientId('')).toBeUndefined();
    expect(googleClientId('   ')).toBeUndefined();
    expect(googleClientId(undefined)).toBeUndefined();
  });
});

describe('createTokenProvider', () => {
  it('asks Google for the Drive scope with the client ID', async () => {
    const { api, requests } = fakeGoogle(grant('t1'));
    const provider = createTokenProvider({ clientId: 'cid', oauth2: () => api });
    expect(await provider.getToken()).toBe('t1');
    expect(requests[0].config.client_id).toBe('cid');
    expect(requests[0].config.scope).toBe(DRIVE_SCOPE);
    expect(requests[0].prompt).toBe('');
  });

  it('reuses the token until it is about to expire', async () => {
    let time = 0;
    const { api, requests } = fakeGoogle(grant('t1', { expires_in: '3600' }), grant('t2'));
    const provider = createTokenProvider({ clientId: 'c', oauth2: () => api, now: () => time });
    expect(await provider.getToken()).toBe('t1');
    time = 3_539_000; // 61 s before the end
    expect(await provider.getToken()).toBe('t1');
    expect(requests).toHaveLength(1);
    time = 3_540_000; // exactly 60 s before the end: already too close
    expect(await provider.getToken()).toBe('t2');
    expect(requests).toHaveLength(2);
  });

  it('keeps a token that is just outside the safety margin', async () => {
    let time = 0;
    const { api, requests } = fakeGoogle(grant('t1'));
    const provider = createTokenProvider({ clientId: 'c', oauth2: () => api, now: () => time });
    await provider.getToken();
    time = 3_539_999; // 60.001 s before the end: still good
    expect(await provider.getToken()).toBe('t1');
    expect(requests).toHaveLength(1);
  });

  it('assumes an hour when Google gives no duration', async () => {
    let time = 0;
    const { api, requests } = fakeGoogle(grant('t1', { expires_in: undefined }), grant('t2'));
    const provider = createTokenProvider({ clientId: 'c', oauth2: () => api, now: () => time });
    await provider.getToken();
    time = 3_000_000;
    expect(await provider.getToken()).toBe('t1');
    time = 3_600_000;
    expect(await provider.getToken()).toBe('t2');
    expect(requests).toHaveLength(2);
  });

  it('asks again after the token was invalidated', async () => {
    const { api } = fakeGoogle(grant('t1'), grant('t2'));
    const provider = createTokenProvider({ clientId: 'c', oauth2: () => api });
    await provider.getToken();
    provider.invalidate();
    expect(await provider.getToken()).toBe('t2');
  });

  it('refuses when the user did not grant the Drive permission', async () => {
    const { api } = fakeGoogle(grant('t1', { scope: 'openid email' }));
    const provider = createTokenProvider({ clientId: 'c', oauth2: () => api });
    await expect(provider.getToken()).rejects.toMatchObject({ kind: 'denied' });
  });

  it('refuses a scope that merely contains the Drive one as a prefix', async () => {
    const { api } = fakeGoogle(grant('t1', { scope: `${DRIVE_SCOPE}.readonly` }));
    await expect(createTokenProvider({ clientId: 'c', oauth2: () => api }).getToken()).rejects.toMatchObject({
      kind: 'denied',
    });
  });

  it('accepts the Drive scope among others', async () => {
    const { api } = fakeGoogle(grant('t1', { scope: `openid ${DRIVE_SCOPE}` }));
    expect(await createTokenProvider({ clientId: 'c', oauth2: () => api }).getToken()).toBe('t1');
  });

  it('tells a refusal from another error', async () => {
    const { api } = fakeGoogle(
      (c) => c.callback({ error: 'access_denied' }),
      (c) => c.callback({ error: 'server_error' }),
      (c) => c.callback({})
    );
    const provider = createTokenProvider({ clientId: 'c', oauth2: () => api });
    await expect(provider.getToken()).rejects.toMatchObject({ kind: 'denied' });
    await expect(provider.getToken()).rejects.toMatchObject({ kind: 'other' });
    await expect(provider.getToken()).rejects.toMatchObject({ kind: 'other' });
  });

  it('maps the pop-up errors', async () => {
    const { api } = fakeGoogle(
      (c) => c.error_callback({ type: 'popup_closed' }),
      (c) => c.error_callback({ type: 'popup_failed_to_open' }),
      (c) => c.error_callback({ type: 'unknown' }),
      (c) => c.error_callback({})
    );
    const provider = createTokenProvider({ clientId: 'c', oauth2: () => api });
    await expect(provider.getToken()).rejects.toMatchObject({ kind: 'cancelled' });
    await expect(provider.getToken()).rejects.toMatchObject({ kind: 'blocked' });
    await expect(provider.getToken()).rejects.toMatchObject({ kind: 'other' });
    await expect(provider.getToken()).rejects.toMatchObject({ kind: 'other' });
  });

  it('does not keep a token after a failure', async () => {
    const { api, requests } = fakeGoogle((c) => c.error_callback({ type: 'popup_closed' }), grant('t1'));
    const provider = createTokenProvider({ clientId: 'c', oauth2: () => api });
    await expect(provider.getToken()).rejects.toBeInstanceOf(AuthError);
    expect(await provider.getToken()).toBe('t1');
    expect(requests).toHaveLength(2);
  });

  it('reports a Google script that is not loaded', async () => {
    const provider = createTokenProvider({ clientId: 'c', oauth2: () => undefined });
    await expect(provider.getToken()).rejects.toMatchObject({ kind: 'unavailable' });
  });
});

describe('createTokenProvider, silent', () => {
  const silent = { interactive: false };

  it('asks Google without any screen (prompt none)', async () => {
    const { api, requests } = fakeGoogle(grant('t1'));
    const provider = createTokenProvider({ clientId: 'c', oauth2: () => api });
    expect(await provider.getToken(silent)).toBe('t1');
    expect(requests[0].prompt).toBe('none');
  });

  it('still asks with the pop-up when interactive (the default)', async () => {
    const { api, requests } = fakeGoogle(grant('t1'), grant('t2'));
    const provider = createTokenProvider({ clientId: 'c', oauth2: () => api });
    await provider.getToken({ interactive: true });
    provider.invalidate();
    await provider.getToken({});
    expect(requests.map((r) => r.prompt)).toEqual(['', '']);
  });

  it('reuses the token in memory without asking Google', async () => {
    const { api, requests } = fakeGoogle(grant('t1'));
    const provider = createTokenProvider({ clientId: 'c', oauth2: () => api });
    await provider.getToken();
    expect(await provider.getToken(silent)).toBe('t1');
    expect(requests).toHaveLength(1);
  });

  it('says the user has to sign in when Google cannot answer without them', async () => {
    const { api } = fakeGoogle(
      (c) => c.callback({ error: 'interaction_required' }),
      (c) => c.callback({ error: 'access_denied' }),
      (c) => c.error_callback({ type: 'popup_failed_to_open' }),
      (c) => c.error_callback({ type: 'popup_closed' }),
      (c) => c.error_callback({}),
      (c) => c.callback(c && { access_token: 't', scope: 'openid' })
    );
    const provider = createTokenProvider({ clientId: 'c', oauth2: () => api });
    for (let i = 0; i < 6; i++) {
      await expect(provider.getToken(silent)).rejects.toMatchObject({ kind: 'interaction' });
    }
  });

  it('keeps saying the script is missing when it is', async () => {
    const provider = createTokenProvider({ clientId: 'c', oauth2: () => undefined });
    await expect(provider.getToken(silent)).rejects.toMatchObject({ kind: 'unavailable' });
  });

  it('gives up when Google never answers', async () => {
    const { api } = fakeGoogle(() => {});
    const provider = createTokenProvider({ clientId: 'c', oauth2: () => api, silentTimeoutMs: 20 });
    await expect(provider.getToken(silent)).rejects.toMatchObject({ kind: 'interaction' });
  });

  it('does not give up before the timeout, and an answer in time wins', async () => {
    const { api } = fakeGoogle((c) => void setTimeout(() => grant('late')(c), 10));
    const provider = createTokenProvider({ clientId: 'c', oauth2: () => api, silentTimeoutMs: 200 });
    expect(await provider.getToken(silent)).toBe('late');
  });

  it('gives up after 20 seconds by default, not before', async () => {
    vi.useFakeTimers();
    try {
      const { api } = fakeGoogle(() => {});
      const provider = createTokenProvider({ clientId: 'c', oauth2: () => api });
      const outcome = provider.getToken(silent).then(
        () => 'token',
        (err: AuthError) => err.kind
      );
      await vi.advanceTimersByTimeAsync(19_999);
      let settled = false;
      void outcome.then(() => (settled = true));
      await vi.advanceTimersByTimeAsync(0);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(await outcome).toBe('interaction');
    } finally {
      vi.useRealTimers();
    }
  });

  it('waits at least as long as asked before giving up', async () => {
    const { api } = fakeGoogle(() => {});
    const provider = createTokenProvider({ clientId: 'c', oauth2: () => api, silentTimeoutMs: 60 });
    const started = Date.now();
    await provider.getToken(silent).catch(() => {});
    expect(Date.now() - started).toBeGreaterThanOrEqual(50);
  });
});

describe('loadGoogleIdentity', () => {
  afterEach(() => {
    document.head.innerHTML = '';
    delete window.google;
  });

  it('adds the Google script once and resolves when it loads', async () => {
    const first = loadGoogleIdentity();
    const second = loadGoogleIdentity();
    const scripts = document.head.querySelectorAll('script');
    expect(scripts).toHaveLength(1);
    expect(scripts[0].src).toBe('https://accounts.google.com/gsi/client');
    expect(scripts[0].async).toBe(true);
    scripts[0].onload?.(new Event('load'));
    await expect(first).resolves.toBeUndefined();
    await expect(second).resolves.toBeUndefined();
  });

  it('lets a failed load be tried again', async () => {
    vi.resetModules();
    const fresh = await import('./googleAuth');
    const first = fresh.loadGoogleIdentity();
    const script = document.head.querySelector('script');
    script?.onerror?.(new Event('error'));
    await expect(first).rejects.toMatchObject({ kind: 'unavailable' });
    expect(document.head.querySelectorAll('script')).toHaveLength(0);
    const retry = fresh.loadGoogleIdentity();
    expect(document.head.querySelectorAll('script')).toHaveLength(1);
    document.head.querySelector('script')?.onload?.(new Event('load'));
    await expect(retry).resolves.toBeUndefined();
  });

  it('resolves at once when Google is already there', async () => {
    window.google = { accounts: { oauth2: { initTokenClient: vi.fn() } } };
    await expect(loadGoogleIdentity()).resolves.toBeUndefined();
    expect(document.head.querySelectorAll('script')).toHaveLength(0);
  });
});
