import { describe, expect, it } from 'vitest';
import { extractGameClocks } from './clockUtils';
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
  timeControlText,
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
    ['an unknown ending', { ending: 'adjourned' }],
    ['a time control that is not text', { timeControl: 300 }],
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

describe('a game with a clock', () => {
  const clocks = [295_000, 298_000, 290_400, 296_000];
  const timed = (over: Partial<FinishedGame> = {}) =>
    makePlayedGame(finished({ timeControl: { baseSeconds: 300, incrementSeconds: 3 }, clocks, ...over }));

  it('keeps the time control, and writes it with the time left after each move in the PGN', () => {
    const game = timed();
    expect(game.timeControl).toBe('300+3');
    expect(game.pgn).toContain('[TimeControl "300+3"]');
    expect(game.pgn).toContain('[%clk 0:04:55]');
    expect(isPlayedGame(game)).toBe(true);
  });

  it('is read back by the analysis: the thinking times come out of the clocks', () => {
    const game = timed();
    const history = replay(STANDARD_START_FEN, ['f2f3', 'e7e5', 'g2g4', 'd8h4']).moves.map((m, i) => ({
      color: i % 2 === 0 ? ('w' as const) : ('b' as const),
      after: m.fen,
      san: m.san,
    }));
    const { moveClocks, hasClockData } = extractGameClocks(game.pgn, history);
    expect(hasClockData).toBe(true);
    // 300 s - 295 s + 3 s of increment = 8 s for White's first move; Black: 300 - 298 + 3 = 5 s
    expect(moveClocks.map((m) => m.thinkTimeSeconds)).toEqual([8, 5, 8, 5]);
    expect(moveClocks[0].clock).toBe('0:04:55');
  });

  it('writes the same PGN as the game offered for analysis, so that both have the same id', () => {
    expect(timed().id).toBe(timed().id);
    expect(timed().id).not.toBe(makePlayedGame(finished()).id);
  });

  it('keeps a game with its own position and a clock readable too', () => {
    const fen = '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1';
    const { moves } = replay(fen, ['e2e4']);
    const game = makePlayedGame(
      finished({
        startFen: fen,
        prefix: undefined,
        moves,
        outcome: { kind: 'timeout', winner: 'w' },
        timeControl: { baseSeconds: 60, incrementSeconds: 0 },
        clocks: [59_000],
      })
    );
    expect(game.analysable).toBe(false);
    expect(game.pgn).toContain('[TimeControl "60"]');
    expect(game.pgn).toContain('[%clk 0:00:59]');
    expect(game.ending).toBe('timeout');
    expect(isPlayedGame(game)).toBe(true);
  });

  it('tells its time control in a few words', () => {
    expect(timeControlText('300+3')).toBe('pendule 5 min + 3 s');
    expect(timeControlText('1/86400')).toBe('pendule 1/86400');
  });

  it('has no time control without a clock', () => {
    const game = makePlayedGame(finished());
    expect('timeControl' in game).toBe(false);
    expect(game.pgn).not.toContain('TimeControl');
    expect(game.pgn).not.toContain('%clk');
  });
});
