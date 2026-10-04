// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VISION_GAMES } from '../../data/visionGames';
import { exportVisionRecords } from '../../services/visionStore';
import { seeded } from '../../test/seeded';
import {
  EMPTY,
  QUESTIONS_PER_ROUND,
  contentLabel,
  contentsOf,
  makeBlindRound,
  makeLineRound,
  type LineQuestion,
} from '../../utils/vision';
import { Vision } from './Vision';

const cell = (square: string) => document.querySelector(`[data-square="${square}"]`) as HTMLElement;
const pieceCount = () => document.querySelectorAll('[role="gridcell"] svg[viewBox="0 0 45 45"]').length;
const labelOf = (code: string) =>
  code === EMPTY ? 'Case vide' : contentLabel(code).replace(/^./, (c) => c.toUpperCase());

/** The clock the countdown reads, which a test can move forward instead of waiting. */
let skew = 0;

beforeEach(() => {
  Object.defineProperty(globalThis, 'indexedDB', { value: new IDBFactory(), configurable: true, writable: true });
  skew = 0;
  const real = Date.now.bind(Date);
  vi.spyOn(Date, 'now').mockImplementation(() => real() + skew);
});
afterEach(() => vi.restoreAllMocks());

const renderVision = (props: Partial<React.ComponentProps<typeof Vision>> = {}) => {
  const onClose = vi.fn();
  render(<Vision onClose={onClose} {...props} />);
  return { onClose };
};

describe('Vision', () => {
  it('opens on the exercise asked, offers the three, and closes', async () => {
    const user = userEvent.setup();
    const { onClose } = renderVision({ initialMode: 'blind' });
    expect(screen.getByRole('button', { name: 'Mode aveugle', pressed: true })).toBeTruthy();
    expect(await screen.findByText(/sans une seule pièce à l’écran/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Calcul de lignes' }));
    expect(screen.getByRole('button', { name: 'Calcul de lignes', pressed: true })).toBeTruthy();
    expect(screen.getByText(/vous ne le jouez pas, vous le calculez/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Coordonnées' }));
    expect(screen.getByText(/Un nom de case s’affiche/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('says there is no score yet, then the record once there is one', async () => {
    renderVision();
    expect((await screen.findAllByText('Pas encore de score')).length).toBe(4);
  });
});

describe('Coordonnées', () => {
  const start = async (user: ReturnType<typeof userEvent.setup>, level = 'Côté des Blancs') => {
    await user.click(await screen.findByRole('button', { name: new RegExp(`^Commencer : ${level}`) }));
    return () => screen.getByRole('status').textContent!;
  };

  it('counts the right squares and the wrong ones, shows the right square after a miss, and keeps the record', async () => {
    const user = userEvent.setup();
    renderVision();
    const target = await start(user);

    const first = target();
    expect(first).toMatch(/^[a-h][1-8]$/);
    await user.click(cell(first));
    expect(screen.getByText(/1 bonne réponse · 0 erreur/)).toBeTruthy();
    expect(cell(first).getAttribute('aria-label')).toContain('bonne réponse');
    expect(target()).not.toBe(first);

    const second = target();
    const other = ['a1', 'h8'].find((square) => square !== second)!;
    await user.click(cell(other));
    expect(screen.getByText(/1 bonne réponse · 1 erreur/)).toBeTruthy();
    expect(cell(other).getAttribute('aria-label')).toContain('réponse fausse');
    expect(cell(second).getAttribute('aria-label')).toContain('bonne réponse'); // the miss shows where it was

    skew = 31_000;
    expect(await screen.findByText('Score : 1')).toBeTruthy();
    expect(await screen.findByText(/Premier score enregistré/)).toBeTruthy();
    expect(screen.getByText(/1 case trouvée, 1 erreur : 50 % de réussite/)).toBeTruthy();
    // Further ticks of the countdown must not note the round again
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(await exportVisionRecords()).toEqual([
      {
        key: 'coordinates:white',
        best: 1,
        bestAt: expect.any(Number),
        runs: 1,
        history: [{ at: expect.any(Number), score: 1 }],
      },
    ]);

    // Another round: the board no longer answers once time is up, and a better score is a record
    await user.click(screen.getByRole('button', { name: 'Rejouer ce niveau' }));
    skew = 0;
    const next = screen.getByRole('status').textContent!;
    await user.click(cell(next));
    await user.click(cell(screen.getByRole('status').textContent!));
    skew = 100_000;
    expect(await screen.findByText('Score : 2')).toBeTruthy();
    expect(await screen.findByText(/Nouveau record ! L’ancien était 1/)).toBeTruthy();
    await user.click(cell('a1')); // too late: ignored
    expect(screen.getByText('Score : 2')).toBeTruthy();
    expect((await exportVisionRecords())[0]).toMatchObject({ best: 2, runs: 2 });
  });

  it('does not call a lower score a record, and shows the record at the level', async () => {
    const user = userEvent.setup();
    renderVision();
    let target = await start(user);
    await user.click(cell(target()));
    await user.click(cell(target()));
    skew = 31_000;
    expect(await screen.findByText(/Nouveau record|Premier score/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Rejouer ce niveau' }));
    skew = 100_000;
    expect(await screen.findByText('Score : 0')).toBeTruthy();
    expect(await screen.findByText('Votre record à ce niveau : 2.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Changer de niveau' }));
    expect(await screen.findByText(/Record : 2 · 2 parties/)).toBeTruthy();
    expect(screen.getAllByText('Pas encore de score')).toHaveLength(3); // the other levels
    target = await start(user, 'Côté des Noirs');
    expect(target()).toMatch(/^[a-h][1-8]$/);
  });

  it('turns the board for the Black side, and can show the coordinates on its edges', async () => {
    const user = userEvent.setup();
    renderVision();
    await user.click(await screen.findByRole('checkbox', { name: /Afficher les coordonnées/ }));
    await user.click(await screen.findByRole('button', { name: /^Commencer : Côté des Noirs/ }));
    const squares = [...document.querySelectorAll('[role="gridcell"]')].map((c) => c.getAttribute('data-square'));
    expect(squares[0]).toBe('h1'); // h1 at the top left: Black at the bottom
    expect(squares[63]).toBe('a8');
    expect(screen.getAllByText(/^[a-h]$/).length).toBeGreaterThan(0);
  });

  it('answers with the keyboard', async () => {
    const user = userEvent.setup();
    renderVision();
    await start(user);
    const target = screen.getByRole('status').textContent!;
    cell('e4').focus();
    // Walk to the asked square with the arrows, then Enter
    const col = target.charCodeAt(0) - 'e'.charCodeAt(0);
    const row = Number(target[1]) - 4;
    for (let i = 0; i < Math.abs(col); i++) await user.keyboard(col > 0 ? '{ArrowRight}' : '{ArrowLeft}');
    for (let i = 0; i < Math.abs(row); i++) await user.keyboard(row > 0 ? '{ArrowUp}' : '{ArrowDown}');
    await user.keyboard('{Enter}');
    expect(screen.getByText(/1 bonne réponse · 0 erreur/)).toBeTruthy();
  });
});

describe('Mode aveugle', () => {
  const SEED = 5;

  /** The round the screen is going to play, from the same dice. */
  const expectedRound = () => makeBlindRound(VISION_GAMES, 6, seeded(SEED))!;

  async function readTheMoves(user: ReturnType<typeof userEvent.setup>, keepList = false) {
    renderVision({ initialMode: 'blind', random: seeded(SEED) });
    if (keepList) await user.click(await screen.findByRole('checkbox', { name: /Garder sous les yeux/ }));
    await user.click(await screen.findByRole('button', { name: /^Commencer : Courte/ }));
    const round = expectedRound();
    for (let i = 0; i < round.labels.length; i++) {
      expect(screen.getByRole('status').textContent).toBe(round.labels[i]);
      expect(screen.getByText(`Coup ${i + 1} sur ${round.labels.length}`)).toBeTruthy();
      expect(pieceCount()).toBe(0); // never a piece on the board while the game is read
      await user.click(
        screen.getByRole('button', {
          name: i + 1 < round.labels.length ? 'Coup suivant' : 'Terminé : poser les questions',
        })
      );
    }
    return round;
  }

  it('reads the moves of a real game one by one on a board without pieces, then asks about the squares', async () => {
    const user = userEvent.setup();
    const round = await readTheMoves(user);
    for (let i = 0; i < QUESTIONS_PER_ROUND; i++) {
      const { square, answer } = round.questions[i];
      expect(screen.getByText(`Question ${i + 1} sur ${QUESTIONS_PER_ROUND}`)).toBeTruthy();
      expect(screen.getByText(square, { selector: 'strong' })).toBeTruthy();
      expect(pieceCount()).toBe(0);
      // A square never gives its content away, not even to a screen reader
      expect(cell(square).getAttribute('aria-label')).toBe(`${square}, case demandée`);
      await user.click(screen.getByRole('button', { name: labelOf(answer) }));
      expect((await screen.findByRole('status')).textContent).toBe('Juste.');
      await user.click(
        screen.getByRole('button', { name: i + 1 < QUESTIONS_PER_ROUND ? 'Question suivante' : 'Voir le résultat' })
      );
    }
    expect(await screen.findByText(`Score : ${QUESTIONS_PER_ROUND}/${QUESTIONS_PER_ROUND}`)).toBeTruthy();
    expect(await screen.findByText(/Premier score enregistré/)).toBeTruthy();
    // The pieces come back, to check
    expect(pieceCount()).toBe(Object.values(contentsOf(round.fen)).filter((c) => c !== EMPTY).length);
    expect(screen.getByText(new RegExp(`Partie lue : ${round.game.name.slice(0, 12)}`))).toBeTruthy();
    expect(await exportVisionRecords()).toEqual([
      {
        key: 'blind:short',
        best: 5,
        bestAt: expect.any(Number),
        runs: 1,
        history: [{ at: expect.any(Number), score: 5 }],
      },
    ]);
  });

  it('says what a missed square held, and scores only the right answers', async () => {
    const user = userEvent.setup();
    const round = await readTheMoves(user);
    let right = 0;
    for (let i = 0; i < QUESTIONS_PER_ROUND; i++) {
      const { square, answer } = round.questions[i];
      // Always answers "Case vide": right only on the empty squares
      await user.click(screen.getByRole('button', { name: 'Case vide' }));
      const status = (await screen.findByRole('status')).textContent!;
      if (answer === EMPTY) {
        right += 1;
        expect(status).toBe('Juste.');
      } else {
        expect(status).toMatch(new RegExp(`^Raté : ${square} contenait une? `));
      }
      await user.click(
        screen.getByRole('button', { name: i + 1 < QUESTIONS_PER_ROUND ? 'Question suivante' : 'Voir le résultat' })
      );
    }
    expect(await screen.findByText(`Score : ${right}/${QUESTIONS_PER_ROUND}`)).toBeTruthy();
    expect(screen.getAllByLabelText('Raté').length).toBe(QUESTIONS_PER_ROUND - right);
    await waitFor(async () =>
      expect((await exportVisionRecords())[0]).toMatchObject({ key: 'blind:short', best: right })
    );
  });

  it('keeps the moves already read in view only if asked to', async () => {
    const user = userEvent.setup();
    const round = expectedRound();
    renderVision({ initialMode: 'blind', random: seeded(SEED) });
    await user.click(await screen.findByRole('button', { name: /^Commencer : Courte/ }));
    await user.click(screen.getByRole('button', { name: 'Coup suivant' }));
    await user.click(screen.getByRole('button', { name: 'Coup suivant' }));
    expect(screen.queryByText(/Déjà lus/)).toBeNull();
    expect(screen.getByRole('status').textContent).toBe(round.labels[2]);
  });

  it('shows the moves already read when asked to', async () => {
    const user = userEvent.setup();
    const round = await (async () => {
      renderVision({ initialMode: 'blind', random: seeded(SEED) });
      await user.click(await screen.findByRole('checkbox', { name: /Garder sous les yeux/ }));
      await user.click(await screen.findByRole('button', { name: /^Commencer : Courte/ }));
      return expectedRound();
    })();
    await user.click(screen.getByRole('button', { name: 'Coup suivant' }));
    await user.click(screen.getByRole('button', { name: 'Coup suivant' }));
    expect(screen.getByText(/Déjà lus/).parentElement!.textContent).toContain(round.labels.slice(0, 2).join(' '));
  });
});

describe('Calcul de lignes', () => {
  const SEED = 11;
  const round = (): LineQuestion[] => makeLineRound(VISION_GAMES, 2, seeded(SEED));

  async function open(user: ReturnType<typeof userEvent.setup>) {
    renderVision({ initialMode: 'lines', random: seeded(SEED) });
    await user.click(await screen.findByRole('button', { name: /^Commencer : Courtes/ }));
  }

  /** Answers a question as the rules would, or on purpose wrongly. */
  async function answer(user: ReturnType<typeof userEvent.setup>, q: LineQuestion, isRight: boolean) {
    if (q.kind === 'what') {
      const code = isRight ? q.answer : q.answer === EMPTY ? 'wk' : EMPTY;
      await user.click(screen.getByRole('button', { name: labelOf(code) }));
    } else if (isRight && q.answer === null) {
      await user.click(screen.getByRole('button', { name: 'La pièce est prise' }));
    } else {
      const square = isRight ? q.answer! : q.answer === 'a4' ? 'a5' : 'a4';
      await user.click(cell(square));
      await user.click(screen.getByRole('button', { name: `Valider : ${square}` }));
    }
  }

  it('writes the line out over the starting position, and asks without letting the player move', async () => {
    const user = userEvent.setup();
    await open(user);
    const [q] = round();
    expect(screen.getByText(q.line)).toBeTruthy();
    expect(screen.getByText(`Question 1 sur ${round().length}`)).toBeTruthy();
    expect(screen.getByRole('grid', { name: 'Position au début de la ligne' })).toBeTruthy();
    expect(pieceCount()).toBe(Object.values(contentsOf(q.startFen)).filter((c) => c !== EMPTY).length);
    if (q.kind === 'where') {
      expect(screen.getByText(q.piece.origin, { selector: 'strong' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Valider ma réponse' }).hasAttribute('disabled')).toBe(true);
      await user.click(cell('a4'));
      expect(screen.getByRole('button', { name: 'Valider : a4' })).toBeTruthy();
    } else {
      expect(screen.getByText(q.square, { selector: 'strong' })).toBeTruthy();
      expect(screen.getByRole('group', { name: 'Réponses possibles' })).toBeTruthy();
    }
  });

  it('judges each answer by the rules, shows the position reached, and scores the round', async () => {
    const user = userEvent.setup();
    await open(user);
    const questions = round();
    const plan = [true, false, true, true, false];
    for (let i = 0; i < questions.length; i++) {
      await answer(user, questions[i], plan[i]);
      const status = (await screen.findByRole('status')).textContent!;
      expect(status.startsWith(plan[i] ? 'Juste.' : 'Raté.')).toBe(true);
      // The position at the end of the line is on the board now
      expect(screen.getByRole('grid', { name: 'Position à la fin de la ligne' })).toBeTruthy();
      expect(pieceCount()).toBe(Object.values(contentsOf(questions[i].endFen)).filter((c) => c !== EMPTY).length);
      await user.click(
        screen.getByRole('button', { name: i + 1 < questions.length ? 'Question suivante' : 'Voir le résultat' })
      );
    }
    const score = plan.filter(Boolean).length;
    expect(await screen.findByText(`Score : ${score}/${QUESTIONS_PER_ROUND}`)).toBeTruthy();
    expect(await screen.findByText(/Premier score enregistré/)).toBeTruthy();
    const list = screen.getByRole('list', { name: '' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(questions.length);
    expect(screen.getAllByLabelText('Raté')).toHaveLength(plan.filter((p) => !p).length);
    expect(await exportVisionRecords()).toEqual([
      {
        key: 'lines:short',
        best: score,
        bestAt: expect.any(Number),
        runs: 1,
        history: [{ at: expect.any(Number), score }],
      },
    ]);
  });
});
