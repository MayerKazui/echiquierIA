import type { BrowserContext, Route } from '@playwright/test';

/**
 * A fake Google for the browser: the sign-in script gives a token at once, and the Drive REST calls the sync makes
 * (find, download, create, replace the one file) are answered from memory. Several contexts can share one `FakeDrive`
 * to stand for two devices signed in to the same account.
 */
export class FakeDrive {
  file: { id: string; bytes: Buffer; modifiedTime: string } | null = null;
  uploads = 0;
}

const GIS_SCRIPT = `
window.google = { accounts: { oauth2: { initTokenClient(config) {
  return { requestAccessToken() {
    setTimeout(() => config.callback({
      access_token: 'fake-token', expires_in: 3600, scope: 'https://www.googleapis.com/auth/drive.appdata',
    }), 0);
  } };
} } } };
`;

/** The bytes of the file in a `multipart/related` upload: the second part, without the closing boundary. */
function fileOfMultipart(body: Buffer, boundary: string): Buffer {
  const delimiter = Buffer.from(`--${boundary}`);
  const first = body.indexOf(delimiter);
  const second = body.indexOf(delimiter, first + delimiter.length);
  const headersEnd = body.indexOf('\r\n\r\n', second) + 4;
  const end = body.lastIndexOf(Buffer.from(`\r\n--${boundary}--`));
  return body.subarray(headersEnd, end);
}

export async function installFakeGoogle(context: BrowserContext, drive: FakeDrive): Promise<void> {
  await context.route('https://accounts.google.com/gsi/client', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: GIS_SCRIPT })
  );

  const json = (route: Route, data: unknown, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });

  await context.route('https://www.googleapis.com/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const isUpload = url.pathname.startsWith('/upload/');
    const id = url.pathname.split('/files/')[1]?.split('?')[0];

    if (!isUpload && request.method() === 'GET' && !id) {
      const file = drive.file;
      return json(route, {
        files: file ? [{ id: file.id, size: String(file.bytes.length), modifiedTime: file.modifiedTime }] : [],
      });
    }
    if (!isUpload && request.method() === 'GET' && id && drive.file?.id === id) {
      return route.fulfill({ contentType: 'application/octet-stream', body: drive.file.bytes });
    }
    if (isUpload && (request.method() === 'POST' || request.method() === 'PATCH')) {
      const boundary = /boundary=(.+)$/.exec(request.headers()['content-type'] ?? '')?.[1];
      const body = request.postDataBuffer();
      if (!boundary || !body) return json(route, { error: { message: 'bad upload' } }, 400);
      drive.file = {
        id: drive.file?.id ?? 'drive-file-1',
        bytes: fileOfMultipart(body, boundary),
        modifiedTime: new Date().toISOString(),
      };
      drive.uploads++;
      return json(route, { id: drive.file.id });
    }
    return json(route, { error: { message: `Unexpected ${request.method()} ${url.pathname}` } }, 404);
  });
}
