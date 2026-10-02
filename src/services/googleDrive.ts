/**
 * The few calls to Google Drive the backup sync needs (REST v3, from the browser, with the access token the
 * Google sign-in gave). The file lives in the hidden application data folder of the user's Drive
 * (`drive.appdata`): the app sees no other file, and the user does not see this one among theirs.
 */

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
export const DRIVE_FILE_NAME = 'echiquier-ia-sync.json.gz';

const FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';
/** Above this size the file goes by the resumable protocol (a single multipart request is limited to 5 MB). */
const SIMPLE_UPLOAD_LIMIT = 4 * 1024 * 1024;

export type DriveErrorKind =
  /** The token is no longer valid: sign in again. */
  | 'unauthorized'
  /** The Drive API is not enabled in the Google Cloud project (a setup problem, not the user's). */
  | 'api-disabled'
  /** The user's Drive is full, or Google asks to slow down. */
  | 'quota'
  /** The user did not grant access to the application data folder. */
  | 'forbidden'
  | 'not-found'
  /** Google is down or overloaded. */
  | 'unavailable'
  /** No answer: offline, or the request was blocked. */
  | 'network'
  | 'other';

export class DriveError extends Error {
  constructor(
    readonly kind: DriveErrorKind,
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = 'DriveError';
  }
}

export type FetchFn = typeof fetch;

export interface DriveFile {
  id: string;
  /** Size in bytes, when Drive says it. */
  size?: number;
  modifiedTime?: string;
}

async function errorBody(response: Response): Promise<{ reason: string; message: string }> {
  try {
    const data = (await response.json()) as { error?: { message?: string; errors?: { reason?: string }[] } };
    return { reason: data.error?.errors?.[0]?.reason ?? '', message: data.error?.message ?? '' };
  } catch {
    return { reason: '', message: '' };
  }
}

/** The error a failed response stands for. */
export async function driveErrorOf(response: Response): Promise<DriveError> {
  const { status } = response;
  const { reason, message } = await errorBody(response);
  const detail = `Drive answered ${status}${message ? `: ${message}` : ''}`;
  if (status === 401) return new DriveError('unauthorized', detail, status);
  if (status === 404) return new DriveError('not-found', detail, status);
  if (status === 429 || /quota|ratelimit/i.test(reason)) return new DriveError('quota', detail, status);
  if (status === 403) {
    if (reason === 'accessNotConfigured' || /has not been used|is disabled/i.test(message)) {
      return new DriveError('api-disabled', detail, status);
    }
    return new DriveError('forbidden', detail, status);
  }
  if (status >= 500) return new DriveError('unavailable', detail, status);
  return new DriveError('other', detail, status);
}

async function call(fetchFn: FetchFn, url: string, init: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await fetchFn(url, init);
  } catch (err) {
    throw new DriveError('network', err instanceof Error ? err.message : 'The request did not go through');
  }
  if (!response.ok) throw await driveErrorOf(response);
  return response;
}

const bearer = (token: string): Record<string, string> => ({ Authorization: `Bearer ${token}` });

/** The sync file, when Drive has one (the most recently modified if there are several). */
export async function findBackupFile(token: string, fetchFn: FetchFn = fetch): Promise<DriveFile | null> {
  const params = new URLSearchParams({
    spaces: 'appDataFolder',
    q: `name='${DRIVE_FILE_NAME}' and trashed=false`,
    orderBy: 'modifiedTime desc',
    pageSize: '1',
    fields: 'files(id,size,modifiedTime)',
  });
  const response = await call(fetchFn, `${FILES_URL}?${params}`, { headers: bearer(token) });
  const data = (await response.json()) as { files?: { id?: unknown; size?: unknown; modifiedTime?: unknown }[] };
  const file = data.files?.[0];
  if (!file || typeof file.id !== 'string') return null;
  const size = Number(file.size);
  return {
    id: file.id,
    size: Number.isFinite(size) ? size : undefined,
    modifiedTime: typeof file.modifiedTime === 'string' ? file.modifiedTime : undefined,
  };
}

/** The bytes of a file. */
export async function downloadFile(token: string, id: string, fetchFn: FetchFn = fetch): Promise<Uint8Array> {
  const response = await call(fetchFn, `${FILES_URL}/${encodeURIComponent(id)}?alt=media`, {
    headers: bearer(token),
  });
  return new Uint8Array(await response.arrayBuffer());
}

/** A single request carrying the metadata and the bytes. */
async function uploadMultipart(token: string, id: string | null, bytes: Uint8Array, fetchFn: FetchFn): Promise<string> {
  const boundary = `echiquier-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  const metadata = id ? { name: DRIVE_FILE_NAME } : { name: DRIVE_FILE_NAME, parents: ['appDataFolder'] };
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
    `--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`,
    bytes as BlobPart,
    `\r\n--${boundary}--`,
  ]);
  const url = `${UPLOAD_URL}${id ? `/${encodeURIComponent(id)}` : ''}?uploadType=multipart&fields=id`;
  const response = await call(fetchFn, url, {
    method: id ? 'PATCH' : 'POST',
    headers: { ...bearer(token), 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  return fileIdOf(response, id);
}

/** Two requests: one opens the upload session, the next sends the bytes. */
async function uploadResumable(token: string, id: string | null, bytes: Uint8Array, fetchFn: FetchFn): Promise<string> {
  const metadata = id ? { name: DRIVE_FILE_NAME } : { name: DRIVE_FILE_NAME, parents: ['appDataFolder'] };
  const url = `${UPLOAD_URL}${id ? `/${encodeURIComponent(id)}` : ''}?uploadType=resumable&fields=id`;
  const session = await call(fetchFn, url, {
    method: id ? 'PATCH' : 'POST',
    headers: {
      ...bearer(token),
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': 'application/octet-stream',
      'X-Upload-Content-Length': String(bytes.length),
    },
    body: JSON.stringify(metadata),
  });
  const location = session.headers.get('Location');
  if (!location) throw new DriveError('other', 'Drive gave no address to send the file to');
  const response = await call(fetchFn, location, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: new Blob([bytes as BlobPart]),
  });
  return fileIdOf(response, id);
}

async function fileIdOf(response: Response, fallback: string | null): Promise<string> {
  try {
    const data = (await response.json()) as { id?: unknown };
    if (typeof data.id === 'string') return data.id;
  } catch {
    // An update may answer without a body: the id is the one we know
  }
  if (fallback) return fallback;
  throw new DriveError('other', 'Drive did not say which file it created');
}

/** Writes the bytes as the sync file: a new file when `id` is null, else the existing one is replaced. Returns its id. */
export function uploadFile(
  token: string,
  id: string | null,
  bytes: Uint8Array,
  fetchFn: FetchFn = fetch
): Promise<string> {
  return bytes.length > SIMPLE_UPLOAD_LIMIT
    ? uploadResumable(token, id, bytes, fetchFn)
    : uploadMultipart(token, id, bytes, fetchFn);
}
