import { describe, expect, it } from 'vitest';
import { apiUrl, assetUrl } from './siteUrl';

describe('assetUrl', () => {
  it('is at the root of the site by default', () => {
    expect(assetUrl('stockfish-19.js', '/')).toBe('/stockfish-19.js');
    expect(assetUrl('/openings.json', '/')).toBe('/openings.json');
  });

  it('follows the base path of a site in a sub-folder', () => {
    expect(assetUrl('stockfish-19.js', '/echiquierIA/')).toBe('/echiquierIA/stockfish-19.js');
    expect(assetUrl('openings.json', '/echiquierIA')).toBe('/echiquierIA/openings.json');
  });

  it('uses the base of the build when none is given', () => {
    expect(assetUrl('openings.json')).toBe(`${import.meta.env.BASE_URL.replace(/\/+$/, '')}/openings.json`);
  });
});

describe('apiUrl', () => {
  it('is relative to the page when no API host is configured', () => {
    expect(apiUrl('/api/coach/explain', undefined)).toBe('/api/coach/explain');
    expect(apiUrl('/api/coach/explain', '')).toBe('/api/coach/explain');
    expect(apiUrl('/api/coach/explain', '  ')).toBe('/api/coach/explain');
  });

  it('points to the configured host, with or without a trailing slash', () => {
    expect(apiUrl('/api/lichess/import', 'https://app.run.app')).toBe('https://app.run.app/api/lichess/import');
    expect(apiUrl('/api/lichess/import', 'https://app.run.app/')).toBe('https://app.run.app/api/lichess/import');
    expect(apiUrl('api/lichess/import', 'https://app.run.app///')).toBe('https://app.run.app/api/lichess/import');
  });
});
