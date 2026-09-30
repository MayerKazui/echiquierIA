import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { DatasetEntry } from '../services/openingBook';

/** Reads public/openings.json from disk, in place of the download done in the browser. */
export async function loadOpeningsFromDisk(): Promise<Record<string, DatasetEntry>> {
  return JSON.parse(await readFile(path.resolve(import.meta.dirname, '../../public/openings.json'), 'utf-8'));
}
