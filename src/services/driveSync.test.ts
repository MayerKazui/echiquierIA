import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameAnalysisResult, MoveAnalysis } from '../types/chess';
import { computePlayerStats } from '../utils/moveAnalysis';
import { packText, unpackText } from '../utils/gzip';
import { BACKUP_APP, BACKUP_FORMAT, PREFERENCE_KEYS, parseBackup } from './backup';
import { SyncError, describeSyncError, syncWithDrive } from './driveSync';
import { AuthError, type TokenProvider } from './googleAuth';
import { DRIVE_FILE_NAME, DriveError, type FetchFn } from './googleDrive';
import { listGames, saveGame } from './gameStore';
import { loadCards, saveCard } from './trainingStore';

const move = {
  san: 'e4',
  fenBefore: 'start',
  ply: 0,
  color: 'w',
  classification: 'best',
  centipawnLoss: 0,
} as MoveAnalysis;

const result = (white: string): GameAnalysisResult => ({
  metadata: { white, black: 'B' },
  moves: [move],
  statsWhite: computePlayerStats([move]),
  statsBlack: computePlayerStats([]),
  userColor: 'w',
  userPseudo: white,
});

const freshDatabase = () =>
  Object.defineProperty(globalThis, 'indexedDB', { value: new IDBFactory(), configurable: true, writable: true });

/** A Google Drive with the application data folder, speaking the few routes the sync uses. */
function fakeDrive(initial?: Uint8Array) {
  const files = new Map<string, Uint8Array>();
  if (initial) files.set('file-1', initial);
  const calls: string[] = [];
  const failures: Response[] = [];
  let nextId = 2;

  const fetchFn: FetchFn = async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    calls.push(`${method} ${url.pathname}${url.searchParams.get('alt') ? '?alt' : ''}`);
    const failure = failures.shift();
    if (failure) return failure;
    if (method === 'GET' && url.pathname === '/drive/v3/files') {
      const ids = [...files.keys()];
      return Response.json({ files: ids.slice(0, 1).map((id) => ({ id, size: String(files.get(id)?.length) })) });
    }
    if (method === 'GET') {
      const bytes = files.get(decodeURIComponent(url.pathname.split('/').pop() ?? ''));
      return bytes ? new Response(bytes as BlobPart) : Response.json({}, { status: 404 });
    }
    // multipart upload: metadata part then the bytes
    const body = new Uint8Array(await (init?.body as Blob).arrayBuffer());
    const text = new TextDecoder('latin1').decode(body);
    const start = text.indexOf('application/octet-stream\r\n\r\n') + 'application/octet-stream\r\n\r\n'.length;
    const end = text.lastIndexOf('\r\n--');
    const id = method === 'PATCH' ? decodeURIComponent(url.pathname.split('/').pop() ?? '') : `file-${nextId++}`;
    files.set(id, body.slice(start, end));
    return Response.json({ id });
  };
  return { files, calls, failures, fetchFn };
}

/** A token provider that gives `token` and counts how often it was asked. */
function fakeTokens(): TokenProvider & { asked: number; invalidated: number } {
  const tokens = {
    asked: 0,
    invalidated: 0,
    getToken: async () => {
      tokens.asked += 1;
      return `token-${tokens.asked}`;
    },
    invalidate: () => {
      tokens.invalidated += 1;
    },
  };
  return tokens;
}

const remoteBackup = (over: Record<string, unknown> = {}) => ({
  app: BACKUP_APP,
  format: BACKUP_FORMAT,
  exportedAt: '2026-10-01T00:00:00.000Z',
  games: [] as unknown[],
  cards: [] as unknown[],
  preferences: {},
  ...over,
});

const bytesOf = (value: unknown) => packText(JSON.stringify(value));

/** The settings the sync reads and writes (localStorage), in memory. */
const store = new Map<string, string>();

beforeEach(() => {
  freshDatabase();
  store.clear();
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('syncWithDrive', () => {
  it('creates the copy when Drive has none', async () => {
    await saveGame({ pgn: '1. e4 *', depth: 14, result: result('Alice') });
    await saveCard({ id: 'p1', level: 1, dueAt: 1, lastSeen: 1, attempts: 1, failures: 0 });
    const drive = fakeDrive();

    const report = await syncWithDrive({ tokens: fakeTokens(), fetchFn: drive.fetchFn });

    expect(report.restore).toBeNull();
    expect(report.sent).toMatchObject({ games: 1, cards: 1 });
    expect(report.sent?.bytes).toBe(drive.files.get('file-2')?.length);
    expect(drive.calls).toEqual(['GET /drive/v3/files', 'POST /upload/drive/v3/files']);
    const parsed = parseBackup(await unpackText(drive.files.get('file-2') as Uint8Array));
    expect(parsed.ok && parsed.backup.games).toHaveLength(1);
    expect(parsed.ok && parsed.backup.cards).toHaveLength(1);
  });

  it('merges what Drive holds into the browser, then sends the merged copy back over the same file', async () => {
    await saveGame({ pgn: '1. e4 *', depth: 14, result: result('Alice') });
    const other = freshGameRecord('2. d4 *', 'Bob');
    const drive = fakeDrive(await bytesOf(remoteBackup({ games: [other], cards: [cardOf('remote')] })));

    const report = await syncWithDrive({ tokens: fakeTokens(), fetchFn: drive.fetchFn });

    expect(report.restore?.games).toMatchObject({ added: 1 });
    expect(report.restore?.cards).toMatchObject({ added: 1 });
    expect((await listGames()).map((g) => g.result.metadata.white).sort()).toEqual(['Alice', 'Bob']);
    expect([...(await loadCards()).keys()]).toEqual(['remote']);
    expect(report.sent).toMatchObject({ games: 2, cards: 1 });
    expect(drive.calls).toEqual([
      'GET /drive/v3/files',
      'GET /drive/v3/files/file-1?alt',
      'PATCH /upload/drive/v3/files/file-1',
    ]);
    const sent = parseBackup(await unpackText(drive.files.get('file-1') as Uint8Array));
    expect(sent.ok && sent.backup.games).toHaveLength(2);
    expect(drive.files.size).toBe(1);
  });

  it('brings the settings of another device without overwriting the ones chosen here', async () => {
    store.set('chess_board_theme', 'wood');
    const drive = fakeDrive(
      await bytesOf(remoteBackup({ preferences: { chess_board_theme: 'blue', chess_sound_enabled: 'false' } }))
    );
    const report = await syncWithDrive({ tokens: fakeTokens(), fetchFn: drive.fetchFn });
    expect(report.restore?.preferencesApplied).toBe(1);
    expect(store.get('chess_board_theme')).toBe('wood');
    expect(store.get('chess_sound_enabled')).toBe('false');
    const sent = parseBackup(await unpackText(drive.files.get('file-1') as Uint8Array));
    expect(sent.ok && sent.backup.preferences).toEqual({ chess_board_theme: 'wood', chess_sound_enabled: 'false' });
    expect(PREFERENCE_KEYS).toContain('chess_sound_enabled');
  });

  it('counts the items of the copy that were not valid', async () => {
    const drive = fakeDrive(await bytesOf(remoteBackup({ games: [{ broken: true }], cards: [cardOf('ok'), 3] })));
    const report = await syncWithDrive({ tokens: fakeTokens(), fetchFn: drive.fetchFn });
    expect(report.rejected).toEqual({ games: 1, cards: 1 });
  });

  it('reads a copy written without compression', async () => {
    const plain = new TextEncoder().encode(JSON.stringify(remoteBackup({ cards: [cardOf('plain')] })));
    const drive = fakeDrive(plain);
    await syncWithDrive({ tokens: fakeTokens(), fetchFn: drive.fetchFn });
    expect([...(await loadCards()).keys()]).toEqual(['plain']);
  });

  it('sends nothing when there is nothing here and nothing there', async () => {
    const drive = fakeDrive();
    const report = await syncWithDrive({ tokens: fakeTokens(), fetchFn: drive.fetchFn });
    expect(report).toEqual({ restore: null, rejected: { games: 0, cards: 0 }, sent: null });
    expect(drive.calls).toEqual(['GET /drive/v3/files']);
  });

  it('treats an empty copy as no copy and writes over it', async () => {
    await saveCard({ id: 'p1', level: 1, dueAt: 1, lastSeen: 1, attempts: 1, failures: 0 });
    const drive = fakeDrive(await bytesOf(remoteBackup()));
    const report = await syncWithDrive({ tokens: fakeTokens(), fetchFn: drive.fetchFn });
    expect(report.restore).toBeNull();
    expect(report.sent).toMatchObject({ cards: 1 });
    expect(drive.calls.at(-1)).toBe('PATCH /upload/drive/v3/files/file-1');
  });

  it('does not overwrite a copy it cannot read', async () => {
    await saveCard({ id: 'p1', level: 1, dueAt: 1, lastSeen: 1, attempts: 1, failures: 0 });
    const garbage = new TextEncoder().encode('not json');
    const drive = fakeDrive(garbage);
    const error = await syncWithDrive({ tokens: fakeTokens(), fetchFn: drive.fetchFn }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SyncError);
    expect((error as SyncError).kind).toBe('remote-unreadable');
    expect(drive.files.get('file-1')).toBe(garbage);
    expect(drive.calls.some((call) => call.startsWith('PATCH'))).toBe(false);
  });

  it('does not overwrite a copy written by a newer version of the application', async () => {
    const newer = await bytesOf(remoteBackup({ format: BACKUP_FORMAT + 1 }));
    const drive = fakeDrive(newer);
    const error = await syncWithDrive({ tokens: fakeTokens(), fetchFn: drive.fetchFn }).catch((e: unknown) => e);
    expect((error as SyncError).kind).toBe('remote-newer');
    expect(describeSyncError(error)).toMatch(/version plus récente.*Elle n'a pas été modifiée/);
    expect(drive.files.get('file-1')).toBe(newer);
  });

  it('does not overwrite a copy that is damaged compressed data', async () => {
    const damaged = (await packText('hello hello hello hello hello')).slice(0, 10);
    const drive = fakeDrive(damaged);
    const error = await syncWithDrive({ tokens: fakeTokens(), fetchFn: drive.fetchFn }).catch((e: unknown) => e);
    expect((error as SyncError).kind).toBe('remote-unreadable');
    expect(drive.files.get('file-1')).toBe(damaged);
  });

  it('asks for a new token once when Google says the one it has is no longer valid', async () => {
    await saveCard({ id: 'p1', level: 1, dueAt: 1, lastSeen: 1, attempts: 1, failures: 0 });
    const drive = fakeDrive();
    drive.failures.push(Response.json({}, { status: 401 }));
    const tokens = fakeTokens();
    const report = await syncWithDrive({ tokens, fetchFn: drive.fetchFn });
    expect(report.sent).toMatchObject({ cards: 1 });
    expect(tokens.invalidated).toBe(1);
    expect(tokens.asked).toBe(3); // the search (twice), then the upload with the token kept
  });

  it('gives up when the new token is refused too', async () => {
    const drive = fakeDrive();
    drive.failures.push(Response.json({}, { status: 401 }), Response.json({}, { status: 401 }));
    const tokens = fakeTokens();
    await expect(syncWithDrive({ tokens, fetchFn: drive.fetchFn })).rejects.toMatchObject({ kind: 'unauthorized' });
    expect(tokens.invalidated).toBe(1);
  });

  it('does not retry for another failure', async () => {
    const drive = fakeDrive();
    drive.failures.push(Response.json({}, { status: 500 }));
    const tokens = fakeTokens();
    await expect(syncWithDrive({ tokens, fetchFn: drive.fetchFn })).rejects.toMatchObject({ kind: 'unavailable' });
    expect(tokens.invalidated).toBe(0);
    expect(drive.calls).toHaveLength(1);
  });

  it('stops before touching Drive when the sign-in fails', async () => {
    const drive = fakeDrive();
    const tokens = { ...fakeTokens(), getToken: async () => Promise.reject(new AuthError('cancelled', 'closed')) };
    await expect(syncWithDrive({ tokens, fetchFn: drive.fetchFn })).rejects.toMatchObject({ kind: 'cancelled' });
    expect(drive.calls).toEqual([]);
  });

  it('keeps the browser data when the upload fails after the merge', async () => {
    const drive = fakeDrive(await bytesOf(remoteBackup({ cards: [cardOf('remote')] })));
    // the search and the download pass, the upload fails
    const fetchFn: FetchFn = async (input, init) =>
      init?.method === 'PATCH' ? Response.json({}, { status: 500 }) : drive.fetchFn(input, init);
    await expect(syncWithDrive({ tokens: fakeTokens(), fetchFn })).rejects.toMatchObject({ kind: 'unavailable' });
    expect([...(await loadCards()).keys()]).toEqual(['remote']);
  });

  it('names the sync file as expected', () => {
    expect(DRIVE_FILE_NAME).toBe('echiquier-ia-sync.json.gz');
  });
});

describe('describeSyncError', () => {
  it('says what to do for each cause', () => {
    expect(describeSyncError(new AuthError('cancelled', ''))).toMatch(/annulée/);
    expect(describeSyncError(new AuthError('blocked', ''))).toMatch(/fenêtres surgissantes/);
    expect(describeSyncError(new AuthError('denied', ''))).toMatch(/cochant/);
    expect(describeSyncError(new AuthError('unavailable', ''))).toMatch(/chargé/);
    expect(describeSyncError(new AuthError('other', ''))).toMatch(/Réessayez/);
    expect(describeSyncError(new DriveError('unauthorized', ''))).toMatch(/refusé/);
    expect(describeSyncError(new DriveError('api-disabled', ''))).toMatch(/pas activée/);
    expect(describeSyncError(new DriveError('quota', ''))).toMatch(/plein/);
    expect(describeSyncError(new DriveError('forbidden', ''))).toMatch(/pas été accordé/);
    expect(describeSyncError(new DriveError('unavailable', ''))).toMatch(/indisponible/);
    expect(describeSyncError(new DriveError('network', ''))).toMatch(/connexion/);
    expect(describeSyncError(new DriveError('not-found', ''))).toMatch(/a échoué/);
    expect(describeSyncError(new Error('x'))).toMatch(/a échoué/);
    expect(describeSyncError(new SyncError('remote-unreadable', 'La copie sur Drive est illisible.'))).toBe(
      "La copie sur Drive est illisible. Elle n'a pas été modifiée."
    );
  });
});

function cardOf(id: string) {
  return { id, level: 1, dueAt: 1000, lastSeen: 10, attempts: 1, failures: 0 };
}

/** A stored game, as another device would have exported it. */
function freshGameRecord(pgn: string, white: string) {
  return { id: `id-${white}`, pgn, depth: 14, savedAt: 5000, schemaVersion: 1, result: result(white) };
}
