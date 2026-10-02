import { describe, expect, it, vi } from 'vitest';
import {
  DRIVE_FILE_NAME,
  DriveError,
  downloadFile,
  driveErrorOf,
  findBackupFile,
  uploadFile,
  type FetchFn,
} from './googleDrive';

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

const fetchOf = (...responses: Response[]) => {
  const queue = [...responses];
  return vi.fn<FetchFn>(async () => queue.shift() ?? json({}, 500));
};

const bodyText = async (init?: RequestInit) =>
  init?.body instanceof Blob ? await init.body.text() : String(init?.body);

describe('driveErrorOf', () => {
  const kindOf = async (status: number, body: unknown = {}) => (await driveErrorOf(json(body, status))).kind;

  it('tells the failures apart', async () => {
    expect(await kindOf(401)).toBe('unauthorized');
    expect(await kindOf(404)).toBe('not-found');
    expect(await kindOf(429)).toBe('quota');
    expect(await kindOf(500)).toBe('unavailable');
    expect(await kindOf(503)).toBe('unavailable');
    expect(await kindOf(400)).toBe('other');
    expect(await kindOf(403)).toBe('forbidden');
  });

  it('recognises a full Drive and a rate limit under 403', async () => {
    expect(await kindOf(403, { error: { errors: [{ reason: 'storageQuotaExceeded' }] } })).toBe('quota');
    expect(await kindOf(403, { error: { errors: [{ reason: 'userRateLimitExceeded' }] } })).toBe('quota');
  });

  it('recognises an API that is not enabled in the project', async () => {
    expect(await kindOf(403, { error: { errors: [{ reason: 'accessNotConfigured' }] } })).toBe('api-disabled');
    expect(
      await kindOf(403, {
        error: { message: 'Google Drive API has not been used in project 1 before or it is disabled.' },
      })
    ).toBe('api-disabled');
  });

  it('survives an answer that is not JSON', async () => {
    const error = await driveErrorOf(new Response('<html>', { status: 502 }));
    expect(error).toBeInstanceOf(DriveError);
    expect(error.kind).toBe('unavailable');
    expect(error.status).toBe(502);
  });
});

describe('findBackupFile', () => {
  it('asks for the sync file in the application data folder, with the token', async () => {
    const fetchFn = fetchOf(json({ files: [{ id: 'f1', size: '1234', modifiedTime: '2026-10-01T10:00:00Z' }] }));
    const file = await findBackupFile('tok', fetchFn);
    expect(file).toEqual({ id: 'f1', size: 1234, modifiedTime: '2026-10-01T10:00:00Z' });
    const [url, init] = fetchFn.mock.calls[0];
    const params = new URL(String(url)).searchParams;
    expect(params.get('spaces')).toBe('appDataFolder');
    expect(params.get('q')).toBe(`name='${DRIVE_FILE_NAME}' and trashed=false`);
    expect(params.get('orderBy')).toBe('modifiedTime desc');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it('gives null when Drive has no such file', async () => {
    expect(await findBackupFile('t', fetchOf(json({ files: [] })))).toBeNull();
    expect(await findBackupFile('t', fetchOf(json({})))).toBeNull();
    expect(await findBackupFile('t', fetchOf(json({ files: [{ size: '1' }] })))).toBeNull();
  });

  it('leaves out a size that is not a number', async () => {
    const file = await findBackupFile('t', fetchOf(json({ files: [{ id: 'f', size: 'abc' }] })));
    expect(file).toEqual({ id: 'f', size: undefined, modifiedTime: undefined });
  });

  it('raises the failure Drive reports', async () => {
    await expect(findBackupFile('t', fetchOf(json({}, 401)))).rejects.toMatchObject({ kind: 'unauthorized' });
  });

  it('turns a request that did not go through into a network error', async () => {
    const fetchFn = vi.fn<FetchFn>(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(findBackupFile('t', fetchFn)).rejects.toMatchObject({ kind: 'network' });
  });
});

describe('downloadFile', () => {
  it('reads the bytes of the file', async () => {
    const fetchFn = fetchOf(new Response(new Uint8Array([1, 2, 3])));
    expect(await downloadFile('tok', 'a/b', fetchFn)).toEqual(new Uint8Array([1, 2, 3]));
    expect(String(fetchFn.mock.calls[0][0])).toContain('/files/a%2Fb?alt=media');
  });

  it('raises a missing file', async () => {
    await expect(downloadFile('t', 'x', fetchOf(json({}, 404)))).rejects.toMatchObject({ kind: 'not-found' });
  });
});

describe('uploadFile', () => {
  const bytes = new Uint8Array([10, 20, 30]);

  it('creates the file in the application data folder', async () => {
    const fetchFn = fetchOf(json({ id: 'new1' }));
    expect(await uploadFile('tok', null, bytes, fetchFn)).toBe('new1');
    const [url, init] = fetchFn.mock.calls[0];
    expect(String(url)).toContain('/upload/drive/v3/files?uploadType=multipart');
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>)['Content-Type']).toMatch(/^multipart\/related; boundary=/);
    const text = await bodyText(init);
    expect(text).toContain(`"name":"${DRIVE_FILE_NAME}"`);
    expect(text).toContain('"parents":["appDataFolder"]');
  });

  it('replaces the existing file without moving it', async () => {
    const fetchFn = fetchOf(json({ id: 'f9' }));
    expect(await uploadFile('tok', 'f9', bytes, fetchFn)).toBe('f9');
    const [url, init] = fetchFn.mock.calls[0];
    expect(String(url)).toContain('/files/f9?uploadType=multipart');
    expect(init?.method).toBe('PATCH');
    expect(await bodyText(init)).not.toContain('parents');
  });

  it('keeps the known id when the update answers without one', async () => {
    expect(await uploadFile('t', 'f9', bytes, fetchOf(new Response('', { status: 200 })))).toBe('f9');
  });

  it('refuses a creation that does not say which file it made', async () => {
    await expect(uploadFile('t', null, bytes, fetchOf(json({})))).rejects.toMatchObject({ kind: 'other' });
  });

  it('sends a big file by the resumable protocol', async () => {
    const big = new Uint8Array(4 * 1024 * 1024 + 1);
    const fetchFn = fetchOf(
      new Response(null, { status: 200, headers: { Location: 'https://upload.example/session/1' } }),
      json({ id: 'big1' })
    );
    expect(await uploadFile('tok', null, big, fetchFn)).toBe('big1');
    const [openUrl, openInit] = fetchFn.mock.calls[0];
    expect(String(openUrl)).toContain('uploadType=resumable');
    expect(openInit?.method).toBe('POST');
    expect((openInit?.headers as Record<string, string>)['X-Upload-Content-Length']).toBe(String(big.length));
    expect(openInit?.body).toContain('appDataFolder');
    const [sendUrl, sendInit] = fetchFn.mock.calls[1];
    expect(sendUrl).toBe('https://upload.example/session/1');
    expect(sendInit?.method).toBe('PUT');
  });

  it('updates a big file with PATCH', async () => {
    const big = new Uint8Array(5 * 1024 * 1024);
    const fetchFn = fetchOf(new Response(null, { headers: { Location: 'https://u.example/s' } }), json({ id: 'f2' }));
    await uploadFile('t', 'f2', big, fetchFn);
    expect(fetchFn.mock.calls[0][1]?.method).toBe('PATCH');
    expect(String(fetchFn.mock.calls[0][0])).toContain('/files/f2?uploadType=resumable');
  });

  it('keeps the multipart way for a file at the limit', async () => {
    const fetchFn = fetchOf(json({ id: 'ok' }));
    await uploadFile('t', null, new Uint8Array(4 * 1024 * 1024), fetchFn);
    expect(String(fetchFn.mock.calls[0][0])).toContain('uploadType=multipart');
  });

  it('refuses a resumable session without an address', async () => {
    const fetchFn = fetchOf(new Response(null, { status: 200 }));
    await expect(uploadFile('t', null, new Uint8Array(4 * 1024 * 1024 + 1), fetchFn)).rejects.toMatchObject({
      kind: 'other',
    });
  });
});
