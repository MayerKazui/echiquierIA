import { DRIVE_SCOPE } from './googleDrive';

/**
 * Sign-in with Google, to get an access token for the user's Drive. It uses the Google Identity Services "token"
 * model: the token comes from a pop-up and is only valid for about an hour; no secret is involved, so everything
 * runs in the browser (the client ID below is public by design).
 */

const GIS_URL = 'https://accounts.google.com/gsi/client';

/** The OAuth client ID given at build time (`VITE_GOOGLE_CLIENT_ID`); without it the sync is not offered. */
export function googleClientId(raw: string | undefined = import.meta.env.VITE_GOOGLE_CLIENT_ID): string | undefined {
  const id = raw?.trim();
  return id ? id : undefined;
}

interface TokenResponse {
  access_token?: string;
  expires_in?: number | string;
  scope?: string;
  error?: string;
}

interface TokenError {
  type?: string;
}

interface TokenClient {
  requestAccessToken(overrides?: { prompt?: string }): void;
}

interface TokenClientConfig {
  client_id: string;
  scope: string;
  callback: (response: TokenResponse) => void;
  error_callback: (error: TokenError) => void;
}

export interface GoogleOAuth2 {
  initTokenClient(config: TokenClientConfig): TokenClient;
}

declare global {
  interface Window {
    google?: { accounts?: { oauth2?: GoogleOAuth2 } };
  }
}

export type AuthErrorKind =
  /** The pop-up was closed before the end. */
  | 'cancelled'
  /** The browser blocked the pop-up. */
  | 'blocked'
  /** The user refused, or did not tick the Drive permission. */
  | 'denied'
  /** The Google script did not load (offline, content blocker). */
  | 'unavailable'
  | 'other';

export class AuthError extends Error {
  constructor(
    readonly kind: AuthErrorKind,
    message: string
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

let scriptPromise: Promise<void> | null = null;

/** Loads the Google script once (a failure can be retried). */
export function loadGoogleIdentity(doc: Document = document): Promise<void> {
  if (doc.defaultView?.google?.accounts?.oauth2) return Promise.resolve();
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const script = doc.createElement('script');
    script.src = GIS_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      script.remove();
      scriptPromise = null;
      reject(new AuthError('unavailable', 'The Google sign-in script did not load'));
    };
    doc.head.appendChild(script);
  });
  return scriptPromise;
}

export interface TokenProviderOptions {
  clientId: string;
  scope?: string;
  /** The Google API (replaced in tests). */
  oauth2?: () => GoogleOAuth2 | undefined;
  now?: () => number;
}

/** Margin kept before the end of a token: one that is about to expire is not reused. */
const EXPIRY_MARGIN_MS = 60_000;

/** Gives access tokens, asking Google only when the one in memory is missing or about to expire. */
export function createTokenProvider({
  clientId,
  scope = DRIVE_SCOPE,
  oauth2 = () => window.google?.accounts?.oauth2,
  now = Date.now,
}: TokenProviderOptions) {
  let cached: { token: string; expiresAt: number } | null = null;

  const request = (): Promise<string> =>
    new Promise((resolve, reject) => {
      const api = oauth2();
      if (!api) {
        reject(new AuthError('unavailable', 'The Google sign-in is not loaded'));
        return;
      }
      const client = api.initTokenClient({
        client_id: clientId,
        scope,
        callback: (response) => {
          if (response.error || !response.access_token) {
            reject(
              new AuthError(response.error === 'access_denied' ? 'denied' : 'other', response.error ?? 'No token')
            );
            return;
          }
          // The user can untick the Drive permission on the consent screen
          if (!response.scope?.split(' ').includes(scope)) {
            reject(new AuthError('denied', 'The Drive permission was not granted'));
            return;
          }
          const seconds = Number(response.expires_in);
          cached = {
            token: response.access_token,
            expiresAt: now() + (Number.isFinite(seconds) ? seconds : 3600) * 1000,
          };
          resolve(response.access_token);
        },
        error_callback: (error) => {
          const kind: AuthErrorKind =
            error.type === 'popup_closed' ? 'cancelled' : error.type === 'popup_failed_to_open' ? 'blocked' : 'other';
          reject(new AuthError(kind, error.type ?? 'Sign-in failed'));
        },
      });
      client.requestAccessToken({ prompt: '' });
    });

  return {
    /** A valid token: the one in memory, or a new one (which may open the Google pop-up). */
    getToken(): Promise<string> {
      if (cached && now() < cached.expiresAt - EXPIRY_MARGIN_MS) return Promise.resolve(cached.token);
      return request();
    },
    /** Forgets the token (Drive refused it): the next call asks again. */
    invalidate(): void {
      cached = null;
    },
  };
}

export type TokenProvider = ReturnType<typeof createTokenProvider>;
