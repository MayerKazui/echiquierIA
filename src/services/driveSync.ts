import {
  EMPTY_BACKUP_ERROR,
  createBackup,
  parseBackup,
  restoreBackup,
  serializeBackup,
  type RestoreReport,
} from './backup';
import { isHistoryEmpty } from './puzzleHistoryStore';
import { AuthError, type TokenProvider } from './googleAuth';
import { DriveError, downloadFile, findBackupFile, uploadFile, type FetchFn } from './googleDrive';
import { packText, unpackText } from '../utils/gzip';

/**
 * Keeps a copy of the backup in the user's Google Drive (hidden application data folder) and brings it back:
 * what Drive holds is merged into the browser (same rules as importing a file: the most recent version of a game
 * or of a study wins, nothing is lost), then the merged result is sent back, so every browser the user syncs ends
 * with the same data. Deletions travel as traces (see `gameStore`, `studyStore`). Two limits of a merge: a study is
 * taken whole (two devices that edited it in the meantime keep the version changed last), and the file is not
 * encrypted (it is private to the user's Google account, like the rest of their Drive).
 */

export interface DriveSyncReport {
  /** What Drive held, merged into the browser. Null when Drive had no copy yet. */
  restore: RestoreReport | null;
  /** Items of the copy that were not valid and were left out. */
  rejected: { games: number; cards: number; studies: number; puzzles: number; notes?: number };
  /** What was sent to Drive. Null when there was nothing to send. */
  sent: { games: number; cards: number; studies: number; puzzles: number; bytes: number } | null;
}

/** A sync that stopped before changing anything on Drive; `message` is meant for the user. */
export class SyncError extends Error {
  constructor(
    readonly kind: 'remote-unreadable' | 'remote-newer',
    message: string
  ) {
    super(message);
    this.name = 'SyncError';
  }
}

export interface DriveSyncDeps {
  tokens: TokenProvider;
  fetchFn?: FetchFn;
  /** False for a sync nobody asked for (no click): it must not open a pop-up. Default: true. */
  interactive?: boolean;
}

export async function syncWithDrive({
  tokens,
  fetchFn = fetch,
  interactive = true,
}: DriveSyncDeps): Promise<DriveSyncReport> {
  /** Runs a Drive call; when Google says the token is no longer valid, asks for a new one and tries once more. */
  const withToken = async <T>(call: (token: string) => Promise<T>): Promise<T> => {
    try {
      return await call(await tokens.getToken({ interactive }));
    } catch (err) {
      if (!(err instanceof DriveError) || err.kind !== 'unauthorized') throw err;
      tokens.invalidate();
      return call(await tokens.getToken({ interactive }));
    }
  };

  const remote = await withToken((token) => findBackupFile(token, fetchFn));

  let restore: RestoreReport | null = null;
  let rejected = { games: 0, cards: 0, studies: 0, puzzles: 0, notes: 0 };
  if (remote) {
    const bytes = await withToken((token) => downloadFile(token, remote.id, fetchFn));
    let text: string;
    try {
      text = await unpackText(bytes);
    } catch {
      throw new SyncError('remote-unreadable', 'La copie sur Drive est illisible.');
    }
    const parsed = parseBackup(text);
    if (parsed.ok) {
      restore = await restoreBackup(parsed.backup, undefined, { mode: 'sync', silent: true });
      rejected = parsed.rejected;
    } else if (parsed.error !== EMPTY_BACKUP_ERROR) {
      // Never overwrite a copy that cannot be read (a newer version of the app may have written it)
      throw new SyncError(
        parsed.error.includes('plus récente') ? 'remote-newer' : 'remote-unreadable',
        parsed.error.includes('plus récente')
          ? parsed.error
          : `La copie sur Drive est illisible (${parsed.error.replace(/\.$/, '')}).`
      );
    }
  }

  const backup = await createBackup();
  if (
    backup.games.length === 0 &&
    backup.cards.length === 0 &&
    backup.deletions.length === 0 &&
    backup.studies.length === 0 &&
    backup.studyDeletions.length === 0 &&
    backup.puzzles.length === 0 &&
    backup.woodpecker === null &&
    backup.woodpeckerArchive.length === 0 &&
    isHistoryEmpty(backup.puzzleHistory) &&
    backup.gameNotes.length === 0 &&
    Object.keys(backup.preferences).length === 0
  ) {
    return { restore, rejected, sent: null };
  }
  const payload = await packText(serializeBackup(backup));
  await withToken((token) => uploadFile(token, remote?.id ?? null, payload, fetchFn));
  return {
    restore,
    rejected,
    sent: {
      games: backup.games.length,
      cards: backup.cards.length,
      studies: backup.studies.length,
      puzzles: backup.puzzles.length,
      bytes: payload.length,
    },
  };
}

/** What went wrong, in a sentence for the user. */
export function describeSyncError(err: unknown): string {
  if (err instanceof SyncError) return `${err.message} Elle n'a pas été modifiée.`;
  if (err instanceof AuthError) {
    switch (err.kind) {
      case 'cancelled':
        return 'Connexion à Google annulée.';
      case 'interaction':
        return 'Google demande de vous reconnecter.';
      case 'blocked':
        return 'Le navigateur a bloqué la fenêtre de connexion Google : autorisez les fenêtres surgissantes pour ce site.';
      case 'denied':
        return "L'accès au dossier de données de l'application dans Drive n'a pas été accordé. Recommencez en cochant la case correspondante.";
      case 'unavailable':
        return "Le service de connexion de Google n'a pas pu être chargé (hors ligne, ou bloqué par une extension).";
      default:
        return 'La connexion à Google a échoué. Réessayez.';
    }
  }
  if (err instanceof DriveError) {
    switch (err.kind) {
      case 'unauthorized':
        return 'Google a refusé la connexion. Réessayez.';
      case 'api-disabled':
        return "L'API Google Drive n'est pas activée pour cette application (réglage côté développeur).";
      case 'quota':
        return 'Votre Google Drive est plein, ou Google demande de patienter. Réessayez plus tard.';
      case 'forbidden':
        return "L'accès au dossier de données de l'application dans Drive n'a pas été accordé.";
      case 'unavailable':
        return 'Google Drive est momentanément indisponible. Réessayez plus tard.';
      case 'network':
        return "Google Drive n'a pas répondu : vérifiez votre connexion.";
      default:
        return 'La synchronisation avec Google Drive a échoué.';
    }
  }
  return 'La synchronisation avec Google Drive a échoué.';
}
