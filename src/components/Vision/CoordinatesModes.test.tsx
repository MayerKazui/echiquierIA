// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { exportVisionRecords } from '../../services/visionStore';
import { seeded } from '../../test/seeded';
import { isLightSquare } from '../../utils/vision';
import { Vision } from './Vision';

/** The clock the countdown reads, which a test can move forward instead of waiting. */
let skew = 0;

beforeEach(() => {
  Object.defineProperty(globalThis, 'indexedDB', { value: new IDBFactory(), configurable: true, writable: true });
  localStorage.clear();
  skew = 0;
  const real = Date.now.bind(Date);
  vi.spyOn(Date, 'now').mockImplementation(() => real() + skew);
});
afterEach(() => vi.restoreAllMocks());

const cell = (square: string) => document.querySelector(`[data-square="${square}"]`) as HTMLElement;
const lit = () => document.querySelector('[aria-label="case, case demandée"]')?.getAttribute('data-square') ?? null;

async function open(level: RegExp) {
  const user = userEvent.setup();
  render(<Vision onClose={() => {}} random={seeded(3)} />);
  await user.click(await screen.findByRole('button', { name: level }));
  return user;
}

function setVisibility(state: 'hidden' | 'visible') {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

describe('Coordonnées: nommer la case', () => {
  it('lights a square on a board that never says its names, and takes a letter and a digit as the answer', async () => {
    const user = await open(/^Commencer : Nommer la case/);
    const square = lit()!;
    expect(square).toMatch(/^[a-h][1-8]$/);
    // No square of the board is named, not even the lit one
    expect(cell(square).getAttribute('aria-label')).toBe('case, case demandée');
    expect(cell('a1').getAttribute('aria-label')).toBe('case');

    await user.keyboard(square[1]); // the rank first, the file second: either order
    expect(screen.getByRole('status').textContent).toBe(`_${square[1]}`);
    await user.keyboard(square[0]);
    expect(screen.getByText(/1 bonne réponse · 0 erreur/)).toBeTruthy();
    expect(cell(square).getAttribute('aria-label')).toContain('bonne réponse'); // the square flashes green
    expect(lit()).not.toBe(square);
  });

  it('answers with the buttons too, and says which square it was after a miss', async () => {
    const user = await open(/^Commencer : Nommer la case/);
    const square = lit()!;
    const wrong = square === 'a1' ? 'b2' : 'a1';
    await user.click(screen.getByRole('button', { name: wrong[0] }));
    expect(screen.getByRole('button', { name: wrong[0], pressed: true })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: wrong[1] }));
    expect(screen.getByText(/0 bonne réponse · 1 erreur/)).toBeTruthy();
    expect(screen.getByText(`Raté : c’était ${square}.`)).toBeTruthy();
    expect(cell(square).getAttribute('aria-label')).toContain('réponse fausse');
  });

  it('notes the round at its own level when time is up', async () => {
    const user = await open(/^Commencer : Nommer la case/);
    const square = lit()!;
    await user.keyboard(square);
    skew = 31_000;
    expect(await screen.findByText('Score : 1')).toBeTruthy();
    expect(await screen.findByText(/Premier score enregistré/)).toBeTruthy();
    expect((await exportVisionRecords())[0]).toMatchObject({ key: 'coordinates:name', best: 1, runs: 1 });
  });

  it('does not take keys typed in a field of the page', async () => {
    const user = await open(/^Commencer : Nommer la case/);
    const field = document.createElement('input');
    document.body.appendChild(field);
    field.focus();
    await user.keyboard('e4');
    expect(screen.getByRole('status').textContent).toBe('__');
    field.remove();
  });
});

describe('Coordonnées: couleur de la case', () => {
  it('shows a name and no board, and judges the colour of the square', async () => {
    const user = await open(/^Commencer : Couleur de la case/);
    expect(screen.queryByRole('grid')).toBeNull();
    const target = screen.getByRole('status').textContent!;
    expect(target).toMatch(/^[a-h][1-8]$/);
    await user.click(screen.getByRole('button', { name: isLightSquare(target) ? 'Claire' : 'Foncée' }));
    expect(screen.getByText(/1 bonne réponse · 0 erreur/)).toBeTruthy();

    const next = screen.getByRole('status').textContent!;
    await user.click(screen.getByRole('button', { name: isLightSquare(next) ? 'Foncée' : 'Claire' }));
    expect(screen.getByText(/1 bonne réponse · 1 erreur/)).toBeTruthy();
    expect(screen.getByText(`Raté : ${next} est une case ${isLightSquare(next) ? 'claire' : 'foncée'}.`)).toBeTruthy();
  });

  it('keeps its own record', async () => {
    const user = await open(/^Commencer : Couleur de la case/);
    const target = screen.getByRole('status').textContent!;
    await user.click(screen.getByRole('button', { name: isLightSquare(target) ? 'Claire' : 'Foncée' }));
    skew = 31_000;
    expect(await screen.findByText('Score : 1')).toBeTruthy();
    await screen.findByText(/Premier score enregistré/);
    expect((await exportVisionRecords())[0]).toMatchObject({ key: 'coordinates:color', best: 1 });
  });
});

describe('Coordonnées: the clock stops with the tab', () => {
  afterEach(() => setVisibility('visible'));

  it('keeps the time that was left while the tab is hidden, and refuses answers meanwhile', async () => {
    const user = await open(/^Commencer : Côté des Blancs/);
    const target = () => screen.getByRole('status').textContent!;
    await user.click(cell(target()));
    expect(screen.getByText(/1 bonne réponse/)).toBeTruthy();

    setVisibility('hidden');
    skew = 120_000; // two minutes away: the round would be long over
    setVisibility('visible');
    await new Promise((resolve) => setTimeout(resolve, 250));

    // Still running, with about the time it had
    expect(screen.queryByText(/^Score :/)).toBeNull();
    expect(Number(screen.getByText(/^\d+ s$/).textContent!.replace(' s', ''))).toBeGreaterThanOrEqual(28);
    await user.click(cell(target()));
    expect(screen.getByText(/2 bonnes réponses/)).toBeTruthy();

    // ... and it does end once the time is really used
    skew = 120_000 + 31_000;
    expect(await screen.findByText('Score : 2')).toBeTruthy();
  });

  it('ignores a click made while it is paused', async () => {
    const user = await open(/^Commencer : Côté des Blancs/);
    setVisibility('hidden');
    await user.click(cell('a1'));
    expect(screen.getByText(/0 bonne réponse · 0 erreur/)).toBeTruthy();
  });

  it('says so, under the countdown', async () => {
    await open(/^Commencer : Côté des Blancs/);
    expect(screen.getByText(/le chronomètre s’arrête si vous quittez l’onglet/)).toBeTruthy();
  });
});
