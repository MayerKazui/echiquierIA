import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import type { MoveAnalysis } from '../types/chess';
import { explainMove } from './moveCoach';

/** A move of the analysis from a position, the engine's move and what the analysis said about them. */
function analysed(fen: string, uci: string, bestUci: string, overrides: Partial<MoveAnalysis> = {}): MoveAnalysis {
  const san = (move: string) => {
    const move_ = new Chess(fen).move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] });
    return move_;
  };
  const played = san(uci);
  const best = san(bestUci);
  return {
    ply: 20,
    moveNumber: 10,
    color: played.color,
    san: played.san,
    uci,
    from: played.from,
    to: played.to,
    fenBefore: fen,
    fenAfter: new Chess(fen).fen(),
    evalBefore: 300,
    evalAfter: -100,
    mateBefore: null,
    mateAfter: null,
    bestMoveUci: bestUci,
    bestMoveSan: best.san,
    bestMoveFrom: best.from,
    bestMoveTo: best.to,
    pv: [bestUci],
    centipawnLoss: 400,
    winPercentBefore: 80,
    winPercentAfter: 45,
    winPercentLoss: 35,
    classification: 'blunder',
    ...overrides,
  } as MoveAnalysis;
}

const everything = (move: MoveAnalysis) => {
  const { concept, whyPlayedIsBad, whyBestIsBetter, plan } = explainMove(move);
  return [concept, whyPlayedIsBad, whyBestIsBetter, plan].join('\n');
};

// White: king e1, knight d5. Black: king e8, rook a8. Nc7+ forks the king and the rook.
const FORK = 'r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1';
// White: king g1, rook a1. Black: king g8 behind f7 g7 h7. Ra8# is mate.
const BACK_RANK = '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1';
// The queen on d5 is attacked by the knight on c3, and nothing defends it.
const QUEEN_ATTACKED = '4k3/8/8/3q4/8/2N5/8/4K3 b - - 0 1';
const MIDDLEGAME = 'r1bq1rk1/ppp2ppp/2np1n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1 w - - 0 7';

/** The position after the moves (SAN) from the starting position. */
function after(...moves: string[]): string {
  const chess = new Chess();
  for (const move of moves) chess.move(move);
  return chess.fen();
}

describe('explainMove: a move that cost something', () => {
  it('calls a capture that is taken back a trade, not a piece left en prise', () => {
    // 4...Bxf3 5.gxf3 / 5.Qxf3: the bishop takes a knight and is taken back
    const text = explainMove(
      analysed(after('e4', 'e5', 'Nf3', 'd6', 'd4', 'Bg4', 'dxe5'), 'g4f3', 'b8d7', {
        classification: 'mistake',
        winPercentBefore: 50,
        winPercentAfter: 42,
      })
    );
    expect(text.concept).toBe('Échange mal jugé');
    expect(text.whyPlayedIsBad).toContain('Fxf3 prend le Cavalier en f3, mais le pion en g2 reprend');
    expect(text.whyPlayedIsBad).toContain("c'est un échange, et Cd7 faisait mieux");
    expect(text.whyPlayedIsBad).not.toContain('en prise');
  });

  it('does not tell a developing move that it ignores development', () => {
    const text = explainMove(
      analysed(after('e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5'), 'b1c3', 'c2c3', {
        classification: 'inaccuracy',
        winPercentBefore: 52,
        winPercentAfter: 44,
        phase: 'opening',
      })
    );
    expect(text.whyPlayedIsBad).toContain('développer le Cavalier est naturel, mais c3 était plus précis ici');
  });

  it('names the fork that was missed, with the pieces and squares involved', () => {
    const text = explainMove(analysed(FORK, 'e1d2', 'd5c7'));
    expect(text.concept).toBe('Fourchette');
    expect(text.whyPlayedIsBad).toContain("Rd2 passe à côté d'une tactique : Cc7+ créait une fourchette");
    expect(text.whyBestIsBetter).toContain('le Cavalier en c7 attaque en même temps le Roi en e8 et la Tour en a8');
  });

  it('says what the evaluation did, from the side that moved', () => {
    const text = explainMove(analysed(FORK, 'e1d2', 'd5c7', { evalBefore: 300, evalAfter: -100 }));
    expect(text.whyPlayedIsBad).toContain("Pour les Blancs, l'évaluation passe de +3,0 à -1,0.");
    const black = explainMove(
      analysed(QUEEN_ATTACKED, 'e8d8', 'd5d2', { evalBefore: 0, evalAfter: 600, classification: 'mistake' })
    );
    expect(black.whyPlayedIsBad).toContain("Pour les Noirs, l'évaluation passe de 0,0 à -6,0.");
  });

  it('shows the mate that was missed', () => {
    const text = explainMove(analysed(BACK_RANK, 'g1f1', 'a1a8', { mateBefore: 1, evalBefore: 0 }));
    expect(text.concept).toBe('Mat manqué ou subi');
    expect(text.whyPlayedIsBad).toContain('les Blancs laissent passer un mat forcé en 1 coup : Ta8# le donnait');
    expect(text.whyPlayedIsBad).toContain('mat en 1');
    expect(text.whyBestIsBetter).toContain('mat du couloir');
  });

  it('points at the piece left en prise and who takes it', () => {
    const text = explainMove(
      analysed(QUEEN_ATTACKED, 'e8d8', 'd5d2', { evalBefore: 0, evalAfter: 600, classification: 'mistake' })
    );
    expect(text.concept).toBe('Pièce laissée en prise');
    expect(text.whyPlayedIsBad).toContain('La Dame en d5 était déjà attaquée');
    expect(text.whyPlayedIsBad).toContain('le Cavalier en c3 peut la prendre');
  });

  it('does not blame a move for a tactic when it gave away a won position without one', () => {
    const text = explainMove(
      analysed(MIDDLEGAME, 'h2h3', 'c1e3', {
        classification: 'mistake',
        winPercentBefore: 78,
        winPercentAfter: 51,
        phase: 'middlegame',
      })
    );
    expect(text.concept).toBe('Avantage gâché');
    expect(text.whyPlayedIsBad).toContain('environ 78 % de chances de gagner');
    expect(text.whyPlayedIsBad).toContain('retombe à 51 %');
  });

  it('judges an opening move by the principles and names what is left to develop', () => {
    const text = explainMove(
      analysed(MIDDLEGAME, 'c4b3', 'c1e3', {
        classification: 'inaccuracy',
        moveNumber: 7,
        phase: 'opening',
        winPercentBefore: 52,
        winPercentAfter: 44,
      })
    );
    expect(text.concept).toBe("Principes d'ouverture");
    expect(text.whyPlayedIsBad).toContain("le Fou bouge une seconde fois alors qu'il reste le Fou en c1 à développer");
  });

  it('asks for an active king in an endgame', () => {
    const text = explainMove(
      analysed('8/5pk1/6p1/8/4P3/5PK1/8/8 w - - 0 40', 'e4e5', 'g3g4', {
        classification: 'mistake',
        phase: 'endgame',
        winPercentBefore: 52,
        winPercentAfter: 44,
      })
    );
    expect(text.whyPlayedIsBad).toContain('En finale, le Roi est une pièce active : Rg4');
  });

  it('writes a three-step plan that starts with the engine move and uses the expected line', () => {
    const text = explainMove(analysed(FORK, 'e1d2', 'd5c7', { pv: ['d5c7', 'e8d8', 'c7a8'] }));
    const steps = text.plan.split('\n');
    expect(steps).toHaveLength(3);
    expect(steps[0]).toMatch(/^1\. Jouer Cc7\+ à la place de Rd2/);
    expect(steps[1]).toBe('2. Après Cc7+, la réponse attendue est Rd8 ; poursuivre alors par Cxa8.');
    expect(steps[2]).toMatch(/^3\. /);
  });

  it('only claims the engine move leaves nothing en prise when that is true', () => {
    const kept = explainMove(
      analysed(QUEEN_ATTACKED, 'e8d8', 'd5d2', { evalBefore: 0, evalAfter: 600, classification: 'mistake' })
    );
    expect(kept.whyBestIsBetter).not.toContain('ne laisse aucune pièce en prise');
  });
});

describe('explainMove: a good move', () => {
  it('praises the fork that was played and says nothing against the move', () => {
    const text = explainMove(
      analysed(FORK, 'd5c7', 'd5c7', {
        classification: 'best',
        evalBefore: 0,
        evalAfter: 500,
        pv: ['d5c7', 'e8d8', 'c7a8'],
      })
    );
    expect(text.whyPlayedIsBad).toBe('');
    expect(text.concept).toBe('Fourchette');
    expect(text.whyBestIsBetter).toContain('Cc7+ ');
    expect(text.whyBestIsBetter).toContain('fourchette');
    expect(text.plan).toContain("1. Si l'adversaire répond Rd8, continuer par Cxa8.");
  });

  it('calls a theoretical move by the name of its opening, in French', () => {
    const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const text = explainMove(
      analysed(start, 'e2e4', 'e2e4', {
        classification: 'book',
        openingName: "King's Pawn Game",
        pv: ['e2e4', 'e7e5', 'g1f3'],
      })
    );
    expect(text.whyBestIsBetter).toContain('e4 est un coup de théorie (Partie du pion roi)');
    expect(text.plan).toContain('Terminer le développement');
  });

  it('keeps the engine move in view when the move played is good but not the best', () => {
    const text = explainMove(
      analysed(MIDDLEGAME, 'c1g5', 'a2a3', { classification: 'excellent', phase: 'middlegame' })
    );
    expect(text.whyPlayedIsBad).toBe('');
    expect(text.whyBestIsBetter).toContain('Le moteur préférait légèrement a3');
    expect(text.whyBestIsBetter).toContain('Fg5 reste un bon choix');
  });
});

describe('explainMove: themes worth telling', () => {
  it('does not call a pawn in front of a piece a pin: it says what the capture wins', () => {
    // Opéra, 7...Qe7: 8.Qxb7 takes a pawn (the pawn on c7 is only "pinned" in front of the queen on e7)
    const fen = after('e4', 'e5', 'Nf3', 'd6', 'd4', 'Bg4', 'dxe5', 'Bxf3', 'Qxf3', 'dxe5', 'Bc4', 'Nf6', 'Qb3', 'Qe7');
    const text = explainMove(
      analysed(fen, 'b1c3', 'b3b7', { classification: 'inaccuracy', winPercentBefore: 52, winPercentAfter: 44 })
    );
    expect(everything(analysed(fen, 'b1c3', 'b3b7', { classification: 'inaccuracy' }))).not.toContain('clouage');
    expect(text.whyPlayedIsBad).toContain('Dxb7');
    expect(text.whyPlayedIsBad).toContain('prend le pion en b7');
  });
});

describe('explainMove: the second step after a good move', () => {
  it('says what the move threatens when it wins something', () => {
    const text = explainMove(
      analysed(FORK, 'd5c7', 'd5c7', { classification: 'best', evalBefore: 0, evalAfter: 500, pv: [] })
    );
    expect(text.plan.split('\n')[1]).toContain('Le coup menace la Tour en a8');
  });

  it('warns about the checks the opponent has when nothing else is going on', () => {
    // 1.e4 e5 2.Nf3 Nc6 3.Bb5: Black has no check to give, White's pieces are all safe and nothing is threatened
    const quiet = explainMove(
      analysed(after('e4', 'e5', 'Nf3', 'Nc6'), 'f1b5', 'f1b5', { classification: 'book', pv: [] })
    );
    expect(quiet.plan.split('\n')[1]).toMatch(/solide|menace|échecs/);
  });
});

describe('explainMove: form', () => {
  const samples: MoveAnalysis[] = [
    analysed(FORK, 'e1d2', 'd5c7'),
    analysed(FORK, 'd5c7', 'd5c7', { classification: 'best' }),
    analysed(BACK_RANK, 'g1f1', 'a1a8', { mateBefore: 1 }),
    analysed(QUEEN_ATTACKED, 'e8d8', 'd5d2', { classification: 'mistake' }),
    analysed(MIDDLEGAME, 'h2h3', 'c1e3', { classification: 'inaccuracy' }),
    analysed(MIDDLEGAME, 'c1g5', 'a2a3', { classification: 'good' }),
  ];

  it('writes moves in French notation, never with English piece letters', () => {
    for (const sample of samples) {
      expect(everything(sample)).not.toMatch(/(?<![\p{L}\p{N}])[KQBN][a-h]?x?[a-h][1-8]/u);
    }
  });

  it('always gives three numbered steps and a non-empty idea', () => {
    for (const sample of samples) {
      const text = explainMove(sample);
      expect(text.concept.length).toBeGreaterThan(0);
      expect(text.plan.split('\n').map((step) => step.slice(0, 3))).toEqual(['1. ', '2. ', '3. ']);
    }
  });

  it('gives the same text twice for the same move', () => {
    for (const sample of samples) expect(explainMove(sample)).toEqual(explainMove(sample));
  });

  it('does not throw on a move it cannot read', () => {
    const broken = analysed(FORK, 'e1d2', 'd5c7', { fenBefore: 'not a fen', fenAfter: 'not a fen', pv: ['zz'] });
    const text = explainMove(broken);
    expect(text.whyBestIsBetter.length + text.whyPlayedIsBad.length).toBeGreaterThan(0);
    const noEngineMove = explainMove({ ...samples[0], bestMoveUci: '', bestMoveSan: '', pv: [] });
    expect(noEngineMove.plan.split('\n')).toHaveLength(3);
  });
});

describe('explainMove: with a deeper search', () => {
  const deep = (overrides: Partial<import('./moveCoach').DeepAnalysis> = {}): import('./moveCoach').DeepAnalysis => ({
    depth: 16,
    before: { cp: 520, mate: null, bestMoveUci: 'd5c7', pv: ['d5c7', 'e8d8', 'c7a8'] },
    after: { cp: -30, mate: null, bestMoveUci: 'e8d7', pv: ['e8d7', 'd5c3'] },
    ...overrides,
  });

  it('takes the scores from the search and names its depth', () => {
    const text = explainMove(analysed(FORK, 'e1d2', 'd5c7'), deep());
    expect(text.whyPlayedIsBad).toContain("À la profondeur 16, pour les Blancs, l'évaluation passe de +5,2 à -0,3.");
  });

  it('tells the strongest answer to the move played, in French and from the position after it', () => {
    const text = explainMove(analysed(FORK, 'e1d2', 'd5c7'), deep());
    expect(text.whyPlayedIsBad).toContain('Réponse la plus forte après Rd2 : 1... Rd7 2. Cc3.');
  });

  it("follows the deeper search when it changes the engine's move", () => {
    // The game's analysis said Kd2 was best's rival; the deeper search prefers Kf2? no: it finds Nc7+ for sure
    const text = explainMove(analysed(FORK, 'e1d2', 'e1f2'), deep());
    expect(text.whyBestIsBetter).toContain('Cc7+ amène une fourchette');
    expect(text.plan).toMatch(/^1\. Jouer Cc7\+ à la place de Rd2/);
  });

  it('writes the line of the search, not the one of the game', () => {
    const text = explainMove(
      analysed(FORK, 'e1d2', 'd5c7', { pv: ['d5c7'] }),
      deep({ before: { cp: 520, mate: null, bestMoveUci: 'd5c7', pv: ['d5c7', 'e8f8', 'c7a8'] } })
    );
    expect(text.whyBestIsBetter).toContain('Suite probable : 1. Cc7+ Rf8 2. Cxa8.');
  });

  it('says nothing about an answer when the search has none, and keeps the explanation whole', () => {
    const text = explainMove(
      analysed(FORK, 'e1d2', 'd5c7'),
      deep({ after: { cp: -30, mate: null, bestMoveUci: '', pv: [] } })
    );
    expect(text.whyPlayedIsBad).not.toContain('Réponse la plus forte');
    expect(text.plan.split('\n')).toHaveLength(3);
  });

  it('does not change the explanation without a search', () => {
    expect(explainMove(analysed(FORK, 'e1d2', 'd5c7')).whyPlayedIsBad).not.toContain('profondeur');
  });
});
