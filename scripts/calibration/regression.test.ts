import { beforeAll, describe, expect, it } from 'vitest';
import { ensureOpeningBookLoaded } from '../../src/services/openingBook';
import { loadOpeningsFromDisk } from '../../src/test/openings';
import type { MoveClassification } from '../../src/types/chess';
import { analyseRecorded, gapOf, gapsByBand, loadReference, type PlayerResult } from './reference';

/**
 * The accuracy against chess.com's, on the reference games (see `scripts/calibrate.ts`): a change to the win curve,
 * the accuracy formula, the classification or the opening book that moves the app away from chess.com fails here.
 * The limits sit a little above today's figures (3.9 on average, 4.6 in the worst band, bias -2.3 at depth 12), and
 * under the 5 points the app promises. To move them on purpose, run `bun run calibrate` and say why in the commit message.
 */
const MAX_MEAN_GAP = 4.5;
const MAX_BAND_GAP = 6;
const MAX_BIAS = 3;

const reference = loadReference();
const results: PlayerResult[] = [];
const counts: Partial<Record<MoveClassification, number>> = {};

beforeAll(async () => {
  await ensureOpeningBookLoaded(loadOpeningsFromDisk);
  for (const game of reference.games) {
    const analysis = await analyseRecorded(game);
    results.push(
      {
        game: game.url,
        color: 'w',
        elo: game.whiteElo,
        timeClass: game.timeClass,
        plies: analysis.moves.length,
        ours: analysis.statsWhite.accuracy,
        theirs: game.accuracies.white,
      },
      {
        game: game.url,
        color: 'b',
        elo: game.blackElo,
        timeClass: game.timeClass,
        plies: analysis.moves.length,
        ours: analysis.statsBlack.accuracy,
        theirs: game.accuracies.black,
      }
    );
    for (const move of analysis.moves) counts[move.classification] = (counts[move.classification] ?? 0) + 1;
  }
}, 120_000);

describe('the reference games', () => {
  it('are numerous and cover every Elo band', () => {
    expect(reference.games.length).toBeGreaterThanOrEqual(100);
    expect(reference.games.every((g) => g.evals)).toBe(true);
    const bands = gapsByBand(results);
    expect(bands).toHaveLength(6);
    for (const band of bands) expect(band.players).toBeGreaterThanOrEqual(30);
  });

  it('were recorded at the depth the app uses by default', () => {
    expect(reference.depth).toBe(12);
  });
});

describe('accuracy against chess.com', () => {
  it(`is ${MAX_MEAN_GAP} points away on average at most`, () => {
    expect(gapOf(results).meanAbsolute).toBeLessThan(MAX_MEAN_GAP);
  });

  it('is not systematically above or below chess.com', () => {
    expect(Math.abs(gapOf(results).bias)).toBeLessThan(MAX_BIAS);
  });

  it(`is ${MAX_BAND_GAP} points away at most for every Elo band, beginners included`, () => {
    for (const band of gapsByBand(results)) {
      expect(band.meanAbsolute, band.label).toBeLessThan(MAX_BAND_GAP);
    }
  });
});

describe('the rare labels', () => {
  const perPlayerGame = (label: MoveClassification) => (counts[label] ?? 0) / results.length;

  it('gives "great" to about one move per player and game', () => {
    expect(perPlayerGame('great')).toBeGreaterThan(0.5);
    expect(perPlayerGame('great')).toBeLessThan(2);
  });

  it('gives "brilliant" to few moves: a real sacrifice is rare', () => {
    expect(perPlayerGame('brilliant')).toBeLessThan(0.2);
  });
});
