import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameAnalysisResult, MoveAnalysis } from '../types/chess';
import { computePlayerStats } from '../utils/moveAnalysis';
import { packText, unpackText } from '../utils/gzip';
import { BACKUP_APP, BACKUP_FORMAT, PREFERENCE_KEYS, parseBackup } from './backup';
import { SyncError, describeSyncError, syncWithDrive } from './driveSync';
import { AuthError, type TokenProvider } from './googleAuth';
import { DRIVE_FILE_NAME, DriveError, type FetchFn } from './googleDrive';
import { deleteGame, gameId, listGames, saveGame, clearGames, onGamesChanged } from './gameStore';
import { loadPuzzleEntries, savePuzzleEntry } from './puzzleStore';
import { loadCards, saveCard } from './trainingStore';
import { deleteStudy, listStudies, saveStudy, STUDY_SCHEMA_VERSION } from './studyStore';
import { createChapter } from '../utils/studyTree';
import type { Study } from '../types/study';
import type { PuzzleEntry } from '../utils/puzzleReview';

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
function fakeTokens(): TokenProvider & { asked: number; invalidated: number; requests: unknown[] } {
  const tokens = {
    asked: 0,
    invalidated: 0,
    requests: [] as unknown[],
    getToken: async (request?: unknown) => {
      tokens.requests.push(request);
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

describe('syncWithDrive, missed puzzles', () => {
  const entryOf = (id: string, lastSeen: number, level = 0): PuzzleEntry => ({
    id,
    puzzle: { id, fen: '8/8/8/8/8/8/8/8 w - - 0 1', moves: ['e2e4', 'e7e5'], rating: 1000, themes: ['fork'] },
    card: { id, level, dueAt: 1000, lastSeen, attempts: 1, failures: 1 },
  });

  it('sends the missed puzzles, alone if that is all there is', async () => {
    await savePuzzleEntry(entryOf('a', 1));
    const drive = fakeDrive();
    const report = await syncWithDrive({ tokens: fakeTokens(), fetchFn: drive.fetchFn });
    expect(report.sent).toMatchObject({ games: 0, cards: 0, studies: 0, puzzles: 1 });
    const parsed = parseBackup(await unpackText(drive.files.get('file-2') as Uint8Array));
    expect(parsed.ok && parsed.backup.puzzles.map((entry) => entry.id)).toEqual(['a']);
  });

  it('merges the missed puzzles of Drive with the ones here, the one worked on last winning', async () => {
    await savePuzzleEntry(entryOf('same', 50, 3));
    await savePuzzleEntry(entryOf('only-here', 1));
    const drive = fakeDrive(
      await bytesOf(remoteBackup({ puzzles: [entryOf('same', 20, 1), entryOf('only-there', 5)] }))
    );
    const report = await syncWithDrive({ tokens: fakeTokens(), fetchFn: drive.fetchFn });
    expect(report.restore?.puzzles).toEqual({ added: 1, replaced: 0, kept: 1 });
    const entries = await loadPuzzleEntries();
    expect([...entries.keys()].sort()).toEqual(['only-here', 'only-there', 'same']);
    expect(entries.get('same')?.card.level).toBe(3);
    const parsed = parseBackup(await unpackText(drive.files.get('file-1') as Uint8Array));
    expect(parsed.ok && parsed.backup.puzzles).toHaveLength(3);
  });
});

describe('syncWithDrive, studies', () => {
  const studyOf = (id: string, name: string, updatedAt: number): Study => ({
    id,
    name,
    description: '',
    chapters: [createChapter('C')],
    createdAt: 1,
    updatedAt,
    schemaVersion: STUDY_SCHEMA_VERSION,
  });

  it('sends the studies, alone if that is all there is', async () => {
    await saveStudy(studyOf('a', 'A', 1));
    const drive = fakeDrive();
    const report = await syncWithDrive({ tokens: fakeTokens(), fetchFn: drive.fetchFn });
    expect(report.sent).toMatchObject({ games: 0, cards: 0, studies: 1 });
    const parsed = parseBackup(await unpackText(drive.files.get('file-2') as Uint8Array));
    expect(parsed.ok && parsed.backup.studies.map((s) => s.name)).toEqual(['A']);
  });

  it('merges the studies of Drive with the ones here, the more recent version of a study winning', async () => {
    await saveStudy(studyOf('same', 'Locale', 1)); // stamped now by the save
    await saveStudy(studyOf('only-here', 'Ici', 1));
    const drive = fakeDrive(
      await bytesOf(
        remoteBackup({
          studies: [studyOf('same', 'Distante ancienne', 5), studyOf('only-there', 'Là', 5)],
        })
      )
    );
    const report = await syncWithDrive({ tokens: fakeTokens(), fetchFn: drive.fetchFn });
    expect(report.restore?.studies).toMatchObject({ added: 1, kept: 1 });
    expect((await listStudies()).map((s) => s.name).sort()).toEqual(['Ici', 'Locale', 'Là']);
    const parsed = parseBackup(await unpackText(drive.files.get('file-1') as Uint8Array));
    expect(parsed.ok && parsed.backup.studies).toHaveLength(3);
  });

  it('deletes here what was deleted on another device, and sends the deletion of what was deleted here', async () => {
    await saveStudy(studyOf('gone-there', 'G', 1));
    const [{ updatedAt }] = await listStudies();
    await saveStudy(studyOf('gone-here', 'H', 1));
    await deleteStudy('gone-here');
    const drive = fakeDrive(
      await bytesOf(
        remoteBackup({
          studies: [studyOf('gone-here', 'H', 1)],
          studyDeletions: [{ id: 'gone-there', deletedAt: updatedAt }],
        })
      )
    );
    const report = await syncWithDrive({ tokens: fakeTokens(), fetchFn: drive.fetchFn });
    expect(report.restore?.studies).toMatchObject({ deleted: 1, added: 0 });
    expect(await listStudies()).toEqual([]);
    const parsed = parseBackup(await unpackText(drive.files.get('file-1') as Uint8Array));
    expect(parsed.ok && parsed.backup.studies).toEqual([]);
    expect(parsed.ok && parsed.backup.studyDeletions.map((d) => d.id).sort()).toEqual(['gone-here', 'gone-there']);
  });

  it('counts the studies of the copy that were not valid', async () => {
    const drive = fakeDrive(await bytesOf(remoteBackup({ studies: [studyOf('ok', 'Ok', 5), { id: 'broken' }] })));
    const report = await syncWithDrive({ tokens: fakeTokens(), fetchFn: drive.fetchFn });
    expect(report.rejected).toEqual({ games: 0, cards: 0, studies: 1, puzzles: 0 });
  });
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
    expect(report.rejected).toEqual({ games: 1, cards: 1, studies: 0, puzzles: 0 });
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
    expect(report).toEqual({ restore: null, rejected: { games: 0, cards: 0, studies: 0, puzzles: 0 }, sent: null });
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

  it('asks for the token the way it was told (a sync nobody asked for must not open a pop-up)', async () => {
    const drive = fakeDrive();
    const quiet = fakeTokens();
    await syncWithDrive({ tokens: quiet, fetchFn: drive.fetchFn, interactive: false });
    expect(quiet.requests.length).toBeGreaterThan(0);
    expect(quiet.requests.every((r) => (r as { interactive: boolean }).interactive === false)).toBe(true);
    const clicked = fakeTokens();
    await syncWithDrive({ tokens: clicked, fetchFn: drive.fetchFn });
    expect(clicked.requests.every((r) => (r as { interactive: boolean }).interactive === true)).toBe(true);
  });

  it('asks the new token the same way after Google refused the first one', async () => {
    const drive = fakeDrive();
    drive.failures.push(Response.json({}, { status: 401 }));
    const tokens = fakeTokens();
    await syncWithDrive({ tokens, fetchFn: drive.fetchFn, interactive: false });
    expect(tokens.invalidated).toBe(1);
    expect(tokens.requests.every((r) => (r as { interactive: boolean }).interactive === false)).toBe(true);
  });

  it('names the sync file as expected', () => {
    expect(DRIVE_FILE_NAME).toBe('echiquier-ia-sync.json.gz');
  });
});

describe('two devices sharing a Drive, with deletions', () => {
  /** Runs `work` as another device: its own browser storage. */
  const devices = { pc: new IDBFactory(), phone: new IDBFactory() };
  const on = async <T>(device: keyof typeof devices, work: () => Promise<T>): Promise<T> => {
    Object.defineProperty(globalThis, 'indexedDB', { value: devices[device], configurable: true, writable: true });
    return work();
  };
  const sync = (device: keyof typeof devices, drive: ReturnType<typeof fakeDrive>) =>
    on(device, () => syncWithDrive({ tokens: fakeTokens(), fetchFn: drive.fetchFn }));
  const names = (device: keyof typeof devices) =>
    on(device, async () => (await listGames()).map((g) => g.result.metadata.white).sort());

  beforeEach(() => {
    devices.pc = new IDBFactory();
    devices.phone = new IDBFactory();
  });

  it('a game deleted on the PC is deleted on the phone at its next sync, and does not come back', async () => {
    const drive = fakeDrive();
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    await on('pc', async () => {
      await saveGame({ pgn: '1. e4 *', depth: 14, result: result('Alice') });
      await saveGame({ pgn: '1. d4 *', depth: 14, result: result('Bob') });
    });
    await sync('pc', drive);
    await sync('phone', drive);
    expect(await names('phone')).toEqual(['Alice', 'Bob']);

    vi.spyOn(Date, 'now').mockReturnValue(5000);
    await on('pc', () => deleteGame(gameId('1. e4 *')));
    await sync('pc', drive);
    expect(await names('pc')).toEqual(['Bob']);

    // ten minutes later the phone, which still has the game, syncs
    vi.spyOn(Date, 'now').mockReturnValue(5000 + 600_000);
    const report = await sync('phone', drive);
    expect(report.restore?.games).toMatchObject({ deleted: 1 });
    expect(await names('phone')).toEqual(['Bob']);

    // and the PC, syncing again, does not get it back
    await sync('pc', drive);
    expect(await names('pc')).toEqual(['Bob']);
    const copy = parseBackup(await unpackText([...drive.files.values()][0]));
    expect(copy.ok && copy.backup.games.map((g) => g.result.metadata.white)).toEqual(['Bob']);
    expect(copy.ok && copy.backup.deletions).toEqual([{ id: gameId('1. e4 *'), deletedAt: 5000 }]);
  });

  it('a game analysed again on the phone after the deletion comes back everywhere', async () => {
    const drive = fakeDrive();
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    await on('pc', () => saveGame({ pgn: '1. e4 *', depth: 14, result: result('Alice') }));
    await sync('pc', drive);
    await sync('phone', drive);
    vi.spyOn(Date, 'now').mockReturnValue(5000);
    await on('pc', () => deleteGame(gameId('1. e4 *')));
    await sync('pc', drive);

    vi.spyOn(Date, 'now').mockReturnValue(6000);
    await on('phone', () => saveGame({ pgn: '1. e4 *', depth: 20, result: result('Alice') }));
    await sync('phone', drive);
    expect(await names('phone')).toEqual(['Alice']);
    await sync('pc', drive);
    expect(await names('pc')).toEqual(['Alice']);
  });

  it('clearing the history on the PC clears the phone too', async () => {
    const drive = fakeDrive();
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    await on('pc', async () => {
      await saveGame({ pgn: '1. e4 *', depth: 14, result: result('Alice') });
      await saveGame({ pgn: '1. d4 *', depth: 14, result: result('Bob') });
    });
    await sync('pc', drive);
    await sync('phone', drive);
    vi.spyOn(Date, 'now').mockReturnValue(5000);
    await on('pc', () => clearGames());
    await sync('pc', drive);
    await sync('phone', drive);
    expect(await names('phone')).toEqual([]);
    expect(await names('pc')).toEqual([]);
  });

  it('a first sync of a browser that only deleted games still sends the traces', async () => {
    const drive = fakeDrive();
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    await on('pc', async () => {
      await saveGame({ pgn: '1. e4 *', depth: 14, result: result('Alice') });
      await deleteGame(gameId('1. e4 *'));
    });
    const report = await sync('pc', drive);
    expect(report.sent).not.toBeNull();
    const copy = parseBackup(await unpackText([...drive.files.values()][0]));
    expect(copy.ok && copy.backup.deletions).toHaveLength(1);
  });

  it('the sync does not tell the listeners of the games (it would start another sync)', async () => {
    const drive = fakeDrive();
    await on('pc', () => saveGame({ pgn: '1. e4 *', depth: 14, result: result('Alice') }));
    await sync('pc', drive);
    const listener = vi.fn();
    const stop = onGamesChanged(listener);
    await sync('phone', drive); // brings a game
    stop();
    expect(await names('phone')).toEqual(['Alice']);
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('describeSyncError', () => {
  it('says what to do for each cause', () => {
    expect(describeSyncError(new AuthError('cancelled', ''))).toMatch(/annulée/);
    expect(describeSyncError(new AuthError('blocked', ''))).toMatch(/fenêtres surgissantes/);
    expect(describeSyncError(new AuthError('denied', ''))).toMatch(/cochant/);
    expect(describeSyncError(new AuthError('unavailable', ''))).toMatch(/chargé/);
    expect(describeSyncError(new AuthError('other', ''))).toMatch(/Réessayez/);
    expect(describeSyncError(new AuthError('interaction', ''))).toBe('Google demande de vous reconnecter.');
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
