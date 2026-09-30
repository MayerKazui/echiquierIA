import { describe, expect, it } from 'vitest';
import { DEFAULT_PORT, resolvePort } from './config';

describe('resolvePort', () => {
  it('uses PORT when it is a valid port', () => {
    expect(resolvePort({ PORT: '8080' })).toBe(8080);
    expect(resolvePort({ PORT: ' 5173 ' })).toBe(5173);
    expect(resolvePort({ PORT: '1' })).toBe(1);
    expect(resolvePort({ PORT: '65535' })).toBe(65535);
  });

  it('falls back to 3000 when PORT is missing or empty', () => {
    expect(DEFAULT_PORT).toBe(3000);
    expect(resolvePort({})).toBe(3000);
    expect(resolvePort({ PORT: '' })).toBe(3000);
    expect(resolvePort({ PORT: '  ' })).toBe(3000);
  });

  it.each(['abc', '80abc', '-1', '0', '65536', '3000.5', '1e3', '0x50'])('ignores the invalid value %j', (value) => {
    expect(resolvePort({ PORT: value })).toBe(3000);
  });
});
