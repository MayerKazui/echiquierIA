import { describe, expect, it } from 'vitest';
import {
  NO_THINK,
  applyRewrite,
  buildRewriteMessages,
  isGroundedIn,
  parseRewrite,
  sourceText,
  withoutThinking,
} from './coachRewrite';
import type { CoachParts } from './moveCoach';

const BAD: CoachParts = {
  concept: 'Fourchette',
  problem: "Rd2 passe à côté d'une tactique : Cc7+ créait une fourchette.",
  evalLine: "Pour les Blancs, l'évaluation passe de +3,0 à -1,0.",
  replyLine: '',
  idea: 'Cc7+ amène une fourchette : le Cavalier en c7 attaque en même temps le Roi en e8 et la Tour en a8.',
  line: 'Suite probable : 1. Cc7+ Rd8 2. Cxa8.',
  plan: '1. Jouer Cc7+.\n2. Suite.\n3. Habitude.',
};
const GOOD: CoachParts = { ...BAD, problem: '', evalLine: '', line: '' };

describe('buildRewriteMessages', () => {
  it('gives the model the sentences but neither the score nor the lines of moves', () => {
    const [system, , , user] = buildRewriteMessages(BAD);
    expect(system.role).toBe('system');
    expect(user.content).toContain(BAD.problem);
    expect(user.content).toContain(BAD.idea);
    expect(user.content).not.toContain('évaluation passe');
    expect(user.content).not.toContain('Suite probable');
    expect(user.content).toContain('PROBLEME:');
  });

  it('shows a worked example before the question, and asks for one box only for a good move', () => {
    const messages = buildRewriteMessages(GOOD);
    expect(messages.map((message) => message.role)).toEqual(['system', 'user', 'assistant', 'user']);
    expect(messages[3].content).toContain('BON:');
    expect(messages[3].content).not.toContain('PROBLEME:');
  });
});

describe('models that reason first', () => {
  it('asks them not to, only when told to', () => {
    expect(buildRewriteMessages(BAD, { noThink: true }).at(-1)!.content).toContain(NO_THINK);
    expect(buildRewriteMessages(BAD).at(-1)!.content).not.toContain(NO_THINK);
  });

  it('drops the reasoning before the answer, empty or not', () => {
    expect(withoutThinking('<think>\n\n</think>\n\nBON: une phrase.')).toBe('BON: une phrase.');
    expect(withoutThinking('<think>je réfléchis</think>BON: une phrase.')).toBe('BON: une phrase.');
    expect(withoutThinking('je réfléchis encore</think>BON: une phrase.')).toBe('BON: une phrase.');
    expect(withoutThinking('BON: rien à retirer.')).toBe('BON: rien à retirer.');
  });

  it('reads an answer that starts with an empty reasoning block', () => {
    const answer =
      '<think>\n\n</think>\n\nPROBLEME: Rd2 laisse passer une tactique.\nSOLUTION: Cc7+ était le bon coup, une fourchette.';
    expect(parseRewrite(answer, false)).toEqual({
      problem: 'Rd2 laisse passer une tactique.',
      idea: 'Cc7+ était le bon coup, une fourchette.',
    });
  });
});

describe('parseRewrite', () => {
  it('reads the two boxes of a bad move, whatever the line breaks', () => {
    const parsed = parseRewrite(
      'PROBLEME: Avec Rd2, les Blancs laissent passer une tactique.\nSOLUTION: Cc7+ était le bon coup, une fourchette.',
      false
    );
    expect(parsed).toEqual({
      problem: 'Avec Rd2, les Blancs laissent passer une tactique.',
      idea: 'Cc7+ était le bon coup, une fourchette.',
    });
  });

  it('reads the one box of a good move', () => {
    expect(parseRewrite('BON: Cc7+ est un bon coup : il crée une fourchette.', true)).toEqual({
      problem: '',
      idea: 'Cc7+ est un bon coup : il crée une fourchette.',
    });
  });

  it('refuses an answer that does not follow the format or is too short', () => {
    expect(parseRewrite('Je suis désolé, je ne peux pas répondre.', false)).toBeNull();
    expect(parseRewrite('PROBLEME: ok\nSOLUTION: ok', false)).toBeNull();
    expect(parseRewrite('PROBLEME: Une phrase assez longue pour passer.', false)).toBeNull();
    expect(parseRewrite('', true)).toBeNull();
  });
});

describe('isGroundedIn', () => {
  const source = sourceText(BAD);

  it('accepts a rephrasing that uses only the moves, squares and pieces of the source', () => {
    expect(
      isGroundedIn('Rd2 laisse passer Cc7+ : le Cavalier en c7 attaque le Roi en e8 et la Tour en a8.', source)
    ).toBe(true);
  });

  it('accepts a square that the moves of the source contain', () => {
    expect(isGroundedIn('Le Cavalier va en c7 pour attaquer.', source)).toBe(true);
  });

  it('rejects a move the source does not contain', () => {
    expect(isGroundedIn('Fg5 était le bon coup.', source)).toBe(false);
    expect(isGroundedIn('Cc7+ puis Cd5 gagnait.', source)).toBe(false);
  });

  it('rejects a square that is nowhere in the source', () => {
    expect(isGroundedIn('Le Cavalier attaque la case h4.', source)).toBe(false);
  });

  it('rejects a number that is not in the source', () => {
    expect(isGroundedIn('Cc7+ gagnait trois pièces en 4 coups.', source)).toBe(false);
  });

  it('rejects a side that the source does not name, and accepts the one it does', () => {
    // What a model did on a real run: "les Noirs" for a move of White
    expect(isGroundedIn('Avec Rd2, les Noirs laissent passer Cc7+.', source)).toBe(false);
    const named = { ...BAD, problem: 'Avec Rf1, les Blancs laissent passer un mat forcé.' };
    expect(isGroundedIn('Les Blancs laissent passer un mat avec Rf1.', sourceText(named))).toBe(true);
    expect(isGroundedIn('Les Noirs laissent passer un mat avec Rf1.', sourceText(named))).toBe(false);
  });

  it('rejects a piece put on a square where the source does not put it', () => {
    // What the model did on a real run: an invented piece on an invented square
    expect(isGroundedIn('Le Donjon en a6 attaquait le Roi en e8.', source)).toBe(false);
    expect(isGroundedIn('La Tour en e8 était attaquée par le Cavalier en c7.', source)).toBe(false);
  });

  it('rejects any talk about the score, which the code writes, unless the source uses the word itself', () => {
    expect(isGroundedIn("L'évaluation monte avec Cc7+.", source)).toBe(false);
    expect(isGroundedIn('Les Blancs gardent un avantage décisif.', source)).toBe(false);
    const wasted = { ...BAD, problem: 'Les Blancs avaient un net avantage (environ 78 % de chances de gagner).' };
    expect(isGroundedIn('Les Blancs perdent leur avantage : 78 % de chances de gagner.', sourceText(wasted))).toBe(
      true
    );
  });
});

describe('applyRewrite', () => {
  it('replaces the sentences and keeps the numbers, the lines and the plan', () => {
    const result = applyRewrite(BAD, { problem: 'Un problème.', idea: 'Une idée.' });
    expect(result.problem).toBe('Un problème.');
    expect(result.idea).toBe('Une idée.');
    expect(result.evalLine).toBe(BAD.evalLine);
    expect(result.line).toBe(BAD.line);
    expect(result.plan).toBe(BAD.plan);
  });

  it('keeps the rule-based problem when the rewrite has none (a good move)', () => {
    expect(applyRewrite(GOOD, { problem: '', idea: 'Une idée.' }).problem).toBe('');
  });
});
