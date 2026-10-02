/** Compression of the backup sent to Drive (the games are JSON, which shrinks a lot). */

const hasStreams = (): boolean =>
  typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';

/** True when the bytes start with the gzip signature. */
export const isGzip = (bytes: Uint8Array): boolean => bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;

async function pipe(bytes: Uint8Array, transform: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** The text as gzip, or as plain UTF-8 where the browser cannot compress (the reader tells them apart). */
export async function packText(text: string): Promise<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  return hasStreams() ? pipe(bytes, new CompressionStream('gzip')) : bytes;
}

/** The text of what `packText` made. Throws when the data is gzip and the browser cannot decompress it. */
export async function unpackText(bytes: Uint8Array): Promise<string> {
  if (!isGzip(bytes)) return new TextDecoder().decode(bytes);
  if (!hasStreams()) throw new Error('This browser cannot decompress the backup');
  return new TextDecoder().decode(await pipe(bytes, new DecompressionStream('gzip')));
}
