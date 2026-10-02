import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { onLocalDataChanged } from './driveSyncInstance';
import { deleteGame, saveGame } from './gameStore';
import { deleteStudy, saveStudy, STUDY_SCHEMA_VERSION } from './studyStore';
import { computePlayerStats } from '../utils/moveAnalysis';
import type { GameAnalysisResult, MoveAnalysis } from '../types/chess';
import type { Study } from '../types/study';
import { createChapter } from '../utils/studyTree';

const move = { san: 'e4', fenBefore: 'start', ply: 0, color: 'w', classification: 'best' } as MoveAnalysis;
const result: GameAnalysisResult = {
  metadata: { white: 'A', black: 'B' },
  moves: [move],
  statsWhite: computePlayerStats([move]),
  statsBlack: computePlayerStats([]),
  userColor: 'w',
  userPseudo: 'A',
};
const study: Study = {
  id: 's',
  name: 'S',
  description: '',
  chapters: [createChapter('C')],
  createdAt: 1,
  updatedAt: 1,
  schemaVersion: STUDY_SCHEMA_VERSION,
};

beforeEach(() => {
  Object.defineProperty(globalThis, 'indexedDB', { value: new IDBFactory(), configurable: true, writable: true });
});

describe('onLocalDataChanged', () => {
  it('is told about the games and about the studies, until it unsubscribes', async () => {
    const listener = vi.fn();
    const off = onLocalDataChanged(listener);
    await saveGame({ pgn: '1. e4 *', depth: 12, result });
    expect(listener).toHaveBeenCalledTimes(1);
    await saveStudy(study);
    expect(listener).toHaveBeenCalledTimes(2);
    await deleteStudy('s');
    expect(listener).toHaveBeenCalledTimes(3);
    off();
    await deleteGame('x');
    await saveStudy(study);
    expect(listener).toHaveBeenCalledTimes(3);
  });
});
