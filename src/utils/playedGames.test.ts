import { describe, expect, it } from 'vitest';
import { replay, STANDARD_START_FEN } from './playGame';
import {
  engineName,
  helpText,
  isPlayedGame,
  isPlayedRecord,
  isPlayedTombstone,
  makePlayedGame,
  playedLabel,
  playedOutcome,
  type FinishedGame,
} from './playedGames';

const CLUB = { id: 'club', label: 'Club', elo: 1600 };

function finished(over: Partial<FinishedGame> = {}): FinishedGame {
  const { moves } = replay(STANDARD_START_FEN, ['f2f3', 'e7e5', 'g2g4', 'd8h4']);
  return {
    startFen: STANDARD_START_FEN,
    prefix: [],
    label: 'Partie complète',
    moves,
    outcome: { kind: 'checkmate', winner: 'b' },
    color: 'w',
    level: CLUB,
    userName: 'Alice',
    hints: 0,
    evals: 0,
    now: 1000,
    ...over,
  };
}

describe('makePlayedGame', () => {
  it('keeps the game as a PGN the analysis reads, with the names of both sides', () => {
    const game = makePlayedGame(finished());
    expect(game).toMatchObject({
      analysable: true,
      sans: ['f3', 'e5', 'g4', 'Qh4#'],
      color: 'w',
      levelId: 'club',
      levelLabel: 'Club',
      elo: 1600,
      userName: 'Alice',
      result: '0-1',
      ending: 'checkmate',
      finishedAt: 1000,
      updatedAt: 1000,
    });
    expect(game.pgn).toContain('[White "Alice"]');
    expect(game.pgn).toContain('[Black "Stockfish (Club)"]');
    expect(game.pgn).toContain('[Result "0-1"]');
    expect(game.pgn).not.toContain('[FEN');
  });

  it('puts the engine on the white side when the player has black, and says "Moi" without a name', () => {
    const game = makePlayedGame(finished({ color: 'b', userName: '  ' }));
    expect(game.userName).toBe('Moi');
    expect(game.pgn).toContain('[White "Stockfish (Club)"]');
    expect(game.pgn).toContain('[Black "Moi"]');
  });

  it('gives the same id to the same game, and another to another one', () => {
    expect(makePlayedGame(finished()).id).toBe(makePlayedGame(finished({ now: 5000 })).id);
    expect(makePlayedGame(finished()).id).not.toBe(
      makePlayedGame(finished({ level: { ...CLUB, label: 'Expert' } })).id
    );
  });

  it('records how it ended, draws and resignations included', () => {
    expect(makePlayedGame(finished({ outcome: { kind: 'draw', reason: 'repetition' } }))).toMatchObject({
      result: '1/2-1/2',
      ending: 'repetition',
    });
    expect(makePlayedGame(finished({ outcome: { kind: 'resigned', winner: 'b' } }))).toMatchObject({
      result: '0-1',
      ending: 'resigned',
    });
  });

  it('keeps a game from a position of its own with the FEN header, and says it cannot be analysed', () => {
    const fen = '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1';
    const { moves } = replay(fen, ['e2e4', 'e8d8']);
    const game = makePlayedGame(finished({ startFen: fen, prefix: undefined, moves }));
    expect(game.analysable).toBe(false);
    expect(game.pgn).toContain('[SetUp "1"]');
    expect(game.pgn).toContain(`[FEN "${fen}"]`);
    expect(game.sans).toEqual(['e4', 'Kd8']);
  });

  it('can be analysed from a position reached by known moves', () => {
    const afterE4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
    const { moves } = replay(afterE4, ['e7e5']);
    expect(makePlayedGame(finished({ startFen: afterE4, prefix: ['e4'], moves })).analysable).toBe(true);
  });
});

describe('the validity of a record', () => {
  const game = makePlayedGame(finished());

  it('accepts what the app writes, and a tombstone', () => {
    expect(isPlayedGame(game)).toBe(true);
    expect(isPlayedTombstone({ id: 'a', deleted: true, updatedAt: 5 })).toBe(true);
    expect(isPlayedRecord({ id: 'a', deleted: true, updatedAt: 5 })).toBe(true);
  });

  it.each([
    ['an unknown result', { result: '2-0' }],
    ['an unknown ending', { ending: 'timeout' }],
    ['a side that is not one', { color: 'x' }],
    ['a negative count', { hints: -1 }],
    ['a moves list that is not text', { sans: [1, 2] }],
    ['no id', { id: '' }],
    ['a date that is not a number', { finishedAt: 'today' }],
  ])('refuses %s', (_name, over) => {
    expect(isPlayedGame({ ...game, ...over })).toBe(false);
  });

  it('refuses what is neither a game nor a tombstone', () => {
    expect(isPlayedRecord(null)).toBe(false);
    expect(isPlayedRecord('x')).toBe(false);
    expect(isPlayedRecord({ id: 'a', deleted: false, updatedAt: 1 })).toBe(false);
  });
});

describe('the words of the history', () => {
  it('labels the game and the engine', () => {
    expect(engineName('Maître')).toBe('Stockfish (Maître)');
    expect(playedLabel({ levelLabel: 'Club' })).toBe('Contre Stockfish · Club');
  });

  it('gives the result from the player side', () => {
    expect(playedOutcome({ result: '1-0', color: 'w' })).toBe('win');
    expect(playedOutcome({ result: '1-0', color: 'b' })).toBe('loss');
    expect(playedOutcome({ result: '0-1', color: 'b' })).toBe('win');
    expect(playedOutcome({ result: '1/2-1/2', color: 'b' })).toBe('draw');
  });

  it('says what help was asked for, and nothing when none was', () => {
    expect(helpText({ hints: 0, evals: 0 })).toBe('');
    expect(helpText({ hints: 1, evals: 0 })).toBe('avec 1 indice');
    expect(helpText({ hints: 2, evals: 1 })).toBe('avec 2 indices et 1 évaluation');
    expect(helpText({ hints: 0, evals: 3 })).toBe('avec 3 évaluations');
  });
});
