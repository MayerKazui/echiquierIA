import { describe, expect, it } from 'vitest';
import {
  EMPTY_POSITION,
  STANDARD_POSITION,
  allowedCastling,
  checkPosition,
  formatFen,
  formatPlacement,
  parseFen,
  parsePlacement,
  pieceAt,
  placePiece,
  positionEnd,
  possibleCastling,
  squareIndex,
  usableEnPassant,
  withPiece,
} from './positionEditor';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const position = (fen: string) => parseFen(fen)!;

describe('placement', () => {
  it('reads and writes the pieces of a FEN, a8 first', () => {
    const squares = parsePlacement(STANDARD_POSITION.placement)!;
    expect(squares).toHaveLength(64);
    expect(squares[0]).toEqual({ type: 'r', color: 'b' });
    expect(squares[60]).toEqual({ type: 'k', color: 'w' });
    expect(formatPlacement(squares)).toBe(STANDARD_POSITION.placement);
    expect(formatPlacement(parsePlacement('8/8/8/3Pp3/8/8/8/8')!)).toBe('8/8/8/3Pp3/8/8/8/8');
  });

  it.each(['', '8/8/8', '9/8/8/8/8/8/8/8', '7/8/8/8/8/8/8/8', 'x7/8/8/8/8/8/8/8', '8/8/8/8/8/8/8/8/8'])(
    'refuses %j',
    (text) => {
      expect(parsePlacement(text)).toBeNull();
    }
  );

  it('names the squares', () => {
    expect(squareIndex('a8')).toBe(0);
    expect(squareIndex('h8')).toBe(7);
    expect(squareIndex('a1')).toBe(56);
    expect(squareIndex('h1')).toBe(63);
    expect(squareIndex('i1')).toBe(-1);
    expect(squareIndex('a9')).toBe(-1);
    expect(squareIndex('')).toBe(-1);
  });
});

describe('parseFen and formatFen', () => {
  it('round-trips a complete FEN', () => {
    const fen = 'r3k2r/ppp1qppp/2n5/3pP3/8/2N5/PPP2PPP/R3K2R w KQkq d6 3 12';
    expect(formatFen(position(fen))).toBe(fen);
  });

  it('reads a FEN made of the pieces alone, and an illegal position', () => {
    expect(position('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR')).toMatchObject({
      turn: 'w',
      castling: '-',
      fullmove: 1,
    });
    expect(position('8/8/8/8/8/8/8/R7 w - - 0 1').placement).toBe('8/8/8/8/8/8/8/R7');
  });

  it('refuses what is not a FEN', () => {
    for (const text of [
      '',
      'hello',
      'k7/8/8/8/8/8/8/K7 x - - 0 1',
      'k7/8/8/8/8/8/8/K7 w ZZ - 0 1',
      'k7/8/8/8/8/8/8/K7 w - e5 0 1',
    ]) {
      expect(parseFen(text)).toBeNull();
    }
    expect(parseFen(`${START_FEN} extra`)).toBeNull();
  });

  it('copes with spaces around and between the fields', () => {
    expect(parseFen(`  ${START_FEN.replace(/ /g, '   ')}  `)).toEqual(STANDARD_POSITION);
  });

  it('drops the castling rights that the pieces no longer allow', () => {
    expect(allowedCastling('4k3/8/8/8/8/8/8/4K3', 'KQkq')).toBe('-');
    expect(allowedCastling('r3k2r/8/8/8/8/8/8/R3K3', 'KQkq')).toBe('Qkq');
    expect(possibleCastling(STANDARD_POSITION.placement)).toBe('KQkq');
    expect(formatFen({ ...STANDARD_POSITION, placement: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBN1' })).toBe(
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBN1 w Qkq - 0 1'.replace(' Qkq', ' Qkq')
    );
  });
});

describe('editing', () => {
  it('puts a piece on a square, and takes it off', () => {
    const withKnight = withPiece(EMPTY_POSITION, 'c3', { type: 'n', color: 'w' });
    expect(withKnight.placement).toBe('8/8/8/8/8/2N5/8/8');
    expect(pieceAt(withKnight, 'c3')).toEqual({ type: 'n', color: 'w' });
    expect(withPiece(withKnight, 'c3', null).placement).toBe('8/8/8/8/8/8/8/8');
    expect(pieceAt(withKnight, 'a1')).toBeNull();
  });

  it('forgets the en-passant square when the pieces change', () => {
    const start = { ...position('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 2') };
    expect(withPiece(start, 'a1', { type: 'r', color: 'w' }).enPassant).toBe('-');
  });

  it('takes the same piece off when it is clicked again, and replaces another one', () => {
    const queen = { type: 'q', color: 'b' } as const;
    const once = placePiece(EMPTY_POSITION, 'd8', queen);
    expect(pieceAt(once, 'd8')).toEqual(queen);
    expect(pieceAt(placePiece(once, 'd8', queen), 'd8')).toBeNull();
    expect(pieceAt(placePiece(once, 'd8', { type: 'r', color: 'w' }), 'd8')).toEqual({ type: 'r', color: 'w' });
  });

  it('moves a king instead of adding a second one', () => {
    const king = { type: 'k', color: 'w' } as const;
    const moved = placePiece(placePiece(EMPTY_POSITION, 'e1', king), 'g1', king);
    expect(moved.placement).toBe('8/8/8/8/8/8/8/6K1');
  });
});

describe('checkPosition', () => {
  const problem = (fen: string) => {
    const check = checkPosition(position(fen));
    return check.ok ? null : check.problem;
  };

  it('accepts a position and gives the FEN to send', () => {
    expect(checkPosition(STANDARD_POSITION)).toEqual({ ok: true, fen: START_FEN });
    expect(checkPosition(position('4k3/8/8/8/8/8/8/R3K3 w Q - 0 1'))).toEqual({
      ok: true,
      fen: '4k3/8/8/8/8/8/8/R3K3 w Q - 0 1',
    });
  });

  it('wants one king for each side', () => {
    expect(problem('8/8/8/8/8/8/8/8 w - - 0 1')).toBe('missingKing');
    expect(problem('4k3/8/8/8/8/8/8/8 w - - 0 1')).toBe('missingKing');
    expect(problem('4k3/8/8/8/8/8/8/3KK3 w - - 0 1')).toBe('tooManyKings');
  });

  it('refuses pawns on the first and the last rank, too many pawns, too many pieces', () => {
    expect(problem('4k3/8/8/8/8/8/8/P3K3 w - - 0 1')).toBe('pawnOnEdge');
    expect(problem('P3k3/8/8/8/8/8/8/4K3 w - - 0 1')).toBe('pawnOnEdge');
    expect(problem('4k3/8/8/8/PPPPPPPP/PPPP4/8/4K3 w - - 0 1')).toBe('tooManyPawns');
    expect(problem('4k3/8/8/8/8/QQQQQQQQ/QQQQQQQQ/QQQQK3 w - - 0 1')).toBe('tooManyPieces');
  });

  it('refuses a position where the side without the move is in check', () => {
    // White to move, and the black king is attacked by the rook
    expect(problem('4k3/8/8/8/8/8/4R3/4K3 w - - 0 1')).toBe('opponentInCheck');
    // The same with Black to move is a check on Black: fine
    expect(problem('4k3/8/8/8/8/8/4R3/4K3 b - - 0 1')).toBeNull();
    // Kings side by side
    expect(problem('8/8/8/8/8/8/3kK3/8 w - - 0 1')).toBe('opponentInCheck');
  });

  it('drops an en-passant square that cannot be played, rather than refusing the position', () => {
    const check = checkPosition({ ...position('4k3/8/8/8/8/8/8/4K3 w - - 0 1'), enPassant: 'e6' });
    expect(check).toEqual({ ok: true, fen: '4k3/8/8/8/8/8/8/4K3 w - - 0 1' });
  });

  it('keeps only an en-passant square that the pieces make one', () => {
    const placement = '4k3/8/8/3pP3/8/8/8/4K3';
    expect(usableEnPassant(placement, 'w', 'd6')).toBe('d6');
    expect(usableEnPassant(placement, 'w', 'e6')).toBe('-'); // no pawn that just moved there
    expect(usableEnPassant(placement, 'w', 'd3')).toBe('-'); // the wrong rank for White to move
    expect(usableEnPassant(placement, 'b', 'd6')).toBe('-'); // Black to move: the square would be on the third rank
    expect(usableEnPassant('4k3/8/8/3p4/8/8/8/4K3', 'w', 'd6')).toBe('-'); // no pawn to capture
    expect(usableEnPassant('4k3/3p4/8/3pP3/8/8/8/4K3', 'w', 'd6')).toBe('-'); // the pawn did not cross d7
    expect(usableEnPassant('4k3/8/8/8/3Pp3/8/8/4K3', 'b', 'd3')).toBe('d3');
    expect(usableEnPassant(placement, 'w', '-')).toBe('-');
  });

  it('keeps an en-passant square that can be played', () => {
    const fen = '4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 2';
    expect(checkPosition(position(fen))).toEqual({ ok: true, fen });
  });
});

describe('positionEnd', () => {
  it('knows a mate, a stalemate and a dead position', () => {
    expect(positionEnd('R5k1/5ppp/8/8/8/8/8/6K1 b - - 0 1')).toEqual({ kind: 'checkmate', winner: 'w' });
    expect(positionEnd('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1')).toEqual({ kind: 'draw', reason: 'stalemate' });
    expect(positionEnd('4k3/8/8/8/8/8/8/4K3 w - - 0 1')).toEqual({ kind: 'draw', reason: 'material' });
  });

  it('is null while the game goes on', () => {
    expect(positionEnd(START_FEN)).toBeNull();
    expect(positionEnd('nonsense')).toBeNull();
  });
});
