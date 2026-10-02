import { describe, expect, it } from 'vitest';
import { isGzip, packText, unpackText } from './gzip';

describe('gzip', () => {
  it('compresses a text and gives it back', async () => {
    const text = JSON.stringify({ games: Array.from({ length: 200 }, (_, i) => ({ id: i, san: 'e4 e5 Nf3 Nc6' })) });
    const packed = await packText(text);
    expect(isGzip(packed)).toBe(true);
    expect(packed.length).toBeLessThan(text.length / 4);
    expect(await unpackText(packed)).toBe(text);
  });

  it('keeps accents and symbols', async () => {
    const text = 'Défense sicilienne ♞ — Échiquier';
    expect(await unpackText(await packText(text))).toBe(text);
  });

  it('reads a plain text too (a browser without compression wrote it)', async () => {
    const plain = new TextEncoder().encode('{"app":"echiquier-ia"}');
    expect(isGzip(plain)).toBe(false);
    expect(await unpackText(plain)).toBe('{"app":"echiquier-ia"}');
  });

  it('does not take a short or unrelated buffer for gzip', () => {
    expect(isGzip(new Uint8Array([]))).toBe(false);
    expect(isGzip(new Uint8Array([0x1f, 0x8b]))).toBe(false);
    expect(isGzip(new Uint8Array([0x1f, 0x8c, 0]))).toBe(false);
    expect(isGzip(new Uint8Array([0x1f, 0x8b, 8]))).toBe(true);
  });

  it('refuses damaged gzip data', async () => {
    const packed = await packText('hello hello hello hello');
    await expect(unpackText(packed.slice(0, 8))).rejects.toThrow();
  });
});
