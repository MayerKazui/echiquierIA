// @vitest-environment jsdom
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { analysisEngine, type LiveAnalysis, type LiveRequest } from '../../services/analysisEngine';
import type { AnalysisLine } from '../../utils/positionAnalysis';
import { STANDARD_START_FEN } from '../../utils/playGame';
import { PositionAnalysis } from './PositionAnalysis';

vi.mock('../../services/analysisEngine', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/analysisEngine')>()),
  analysisEngine: { analyze: vi.fn(), stop: vi.fn(), dispose: vi.fn() },
}));
vi.mock('../../utils/chessAudio', () => ({ chessAudio: { playForMove: vi.fn() } }));

const analyze = vi.mocked(analysisEngine.analyze);
const stop = vi.mocked(analysisEngine.stop);
const cell = (square: string) => document.querySelector(`[data-square="${square}"]`) as HTMLElement;

/** The search the component asked for last. */
const lastRequest = (): LiveRequest => analyze.mock.calls[analyze.mock.calls.length - 1][0];

const line = (rank: number, cp: number, pv: string, over: Partial<AnalysisLine> = {}): AnalysisLine => ({
  rank,
  depth: 20,
  cp,
  mate: null,
  pv: pv.split(' '),
  ...over,
});

/** The engine reports lines for the position of the last request. */
function report(lines: AnalysisLine[], over: Partial<LiveAnalysis> = {}) {
  const request = lastRequest();
  act(() => request.onUpdate({ fen: request.fen, depth: lines[0]?.depth ?? 0, nps: 450_000, lines, ...over }));
}

const THREE_LINES = [line(1, 30, 'e2e4 e7e5 g1f3'), line(2, 25, 'd2d4 d7d5 c2c4'), line(3, -10, 'g1f3 d7d5 d2d4')];

function renderAnalysis(props: Partial<React.ComponentProps<typeof PositionAnalysis>> = {}) {
  const onClose = vi.fn();
  render(<PositionAnalysis onClose={onClose} {...props} />);
  return { onClose };
}

beforeEach(() => {
  localStorage.clear();
  analyze.mockReset();
  stop.mockReset();
});

describe('PositionAnalysis: the engine lines', () => {
  it('searches the usual start with three lines, and shows them as they come', () => {
    renderAnalysis();
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(lastRequest()).toMatchObject({ fen: STANDARD_START_FEN, lines: 3 });
    expect(screen.getByRole('status', { name: '' }).textContent).toContain('Analyse en cours');

    report(THREE_LINES);
    const lines = within(screen.getByRole('list', { name: 'Meilleures lignes' })).getAllByRole('listitem');
    expect(lines).toHaveLength(3);
    expect(lines[0].textContent).toContain('+0,3');
    expect(lines[0].textContent).toContain('1.e4');
    // One button per move; the number of a Black move is left out
    expect(
      within(lines[0])
        .getAllByRole('button')
        .map((b) => b.textContent)
    ).toEqual(['1.e4', 'e5', '2.Cf3']);
    expect(lines[1].textContent).toContain('1.d4');
    expect(lines[2].textContent).toContain('-0,1');
    expect(lines[2].textContent).toContain('1.Cf3');
    expect(screen.getByText('profondeur 20 · 450 kn/s')).toBeTruthy();
  });

  it('says mate in words for a screen reader, and writes it short', () => {
    renderAnalysis();
    report([line(1, 9970, 'e2e4', { mate: 3 })]);
    const [item] = screen.getAllByRole('listitem');
    expect(item.textContent).toContain('M3');
    expect(item.textContent).toContain('mat en 3 pour les Blancs');
  });

  it('opens on the position it is given', () => {
    const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 2 3';
    renderAnalysis({ start: fen });
    expect(lastRequest().fen).toBe(fen);
    expect((screen.getByLabelText('Position (FEN)') as HTMLInputElement).value).toBe(fen);
  });

  it('searches again with the number of lines chosen, and remembers it', async () => {
    const user = userEvent.setup();
    const first = render(<PositionAnalysis onClose={vi.fn()} />);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Lignes' }), '5');
    expect(lastRequest()).toMatchObject({ fen: STANDARD_START_FEN, lines: 5 });
    first.unmount();
    renderAnalysis();
    expect((screen.getByRole('combobox', { name: 'Lignes' }) as HTMLSelectElement).value).toBe('5');
  });

  it('shows no more lines than were asked for', async () => {
    const user = userEvent.setup();
    renderAnalysis();
    report(THREE_LINES);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Lignes' }), '1');
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });

  it('pauses the search, keeps the lines on screen, and resumes', async () => {
    const user = userEvent.setup();
    renderAnalysis();
    report(THREE_LINES);
    const calls = analyze.mock.calls.length;
    await user.click(screen.getByRole('button', { name: 'Pause' }));
    expect(stop).toHaveBeenCalled();
    expect(analyze).toHaveBeenCalledTimes(calls);
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByRole('status', { name: '' }).textContent).toContain('En pause');
    await user.click(screen.getByRole('button', { name: 'Reprendre' }));
    expect(analyze).toHaveBeenCalledTimes(calls + 1);
  });

  it('says when the search is over', () => {
    renderAnalysis();
    const request = lastRequest();
    act(() => request.onDone?.({ fen: request.fen, depth: 40, nps: null, lines: THREE_LINES }));
    expect(screen.getByRole('status', { name: '' }).textContent).toContain('Analyse terminée');
  });

  it('offers to try again when the engine is not available', async () => {
    const user = userEvent.setup();
    renderAnalysis();
    act(() => lastRequest().onError?.(new Error('no engine')));
    expect(screen.getByRole('alert').textContent).toContain('moteur n’est pas disponible');
    const calls = analyze.mock.calls.length;
    await user.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(analyze).toHaveBeenCalledTimes(calls + 1);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('releases the engine when it is closed', () => {
    const { unmount } = render(<PositionAnalysis onClose={vi.fn()} />);
    unmount();
    expect(analysisEngine.dispose).toHaveBeenCalled();
  });
});

describe('PositionAnalysis: playing on the board', () => {
  it('plays a line up to the move clicked, and searches the new position', async () => {
    const user = userEvent.setup();
    renderAnalysis();
    report(THREE_LINES);
    await user.click(screen.getAllByRole('button', { name: 'Jouer la ligne jusqu’à 1…e5' })[0]);
    expect(lastRequest().fen).toBe('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2');
    expect(screen.getByText(/Coups joués/).parentElement!.textContent).toContain('1.e4 e5');
    // What the engine found for the old position is not shown for the new one
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });

  it('plays the moves of the player, and takes them back', async () => {
    const user = userEvent.setup();
    renderAnalysis();
    await user.click(cell('e2'));
    await user.click(cell('e4'));
    expect(lastRequest().fen.startsWith('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b')).toBe(true);
    await user.click(cell('c7'));
    await user.click(cell('c5'));
    expect(screen.getByText(/Coups joués/).parentElement!.textContent).toContain('1.e4 c5');

    await user.click(screen.getByRole('button', { name: 'Annuler le coup' }));
    expect(screen.getByText(/Coups joués/).parentElement!.textContent).toContain('1.e4');
    expect(screen.getByText(/Coups joués/).parentElement!.textContent).not.toContain('c5');
    await user.click(screen.getByRole('button', { name: 'Revenir au début' }));
    expect(lastRequest().fen).toBe(STANDARD_START_FEN);
    expect(screen.queryByText(/Coups joués/)).toBeNull();
    expect((screen.getByRole('button', { name: 'Annuler le coup' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('does not search a position where the game is over, and says so', async () => {
    const user = userEvent.setup();
    renderAnalysis({ start: '6k1/5ppp/8/8/8/8/8/R3K3 w Q - 0 1' });
    report([line(1, 9990, 'a1a8', { mate: 1 })]);
    const calls = analyze.mock.calls.length;
    await user.click(cell('a1'));
    await user.click(cell('a8'));
    expect(analyze).toHaveBeenCalledTimes(calls); // the position after the mate is not searched
    expect(screen.getByText(/Échec et mat : les Blancs ont gagné/)).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Meilleures lignes' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Annuler le coup' }));
    expect(lastRequest().fen).toBe('6k1/5ppp/8/8/8/8/8/R3K3 w Q - 0 1');
  });
});

describe('PositionAnalysis: the FEN', () => {
  const field = () => screen.getByLabelText('Position (FEN)') as HTMLInputElement;

  it('loads a FEN that is typed, and searches it', async () => {
    const user = userEvent.setup();
    renderAnalysis();
    await user.clear(field());
    await user.type(field(), '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1');
    await user.click(screen.getByRole('button', { name: 'Charger' }));
    expect(lastRequest().fen).toBe('4k3/8/8/8/8/8/4P3/4K3 w - - 0 1');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('accepts the pieces alone', async () => {
    const user = userEvent.setup();
    renderAnalysis();
    await user.clear(field());
    await user.type(field(), '4k3/8/8/8/8/8/4P3/4K3{Enter}');
    expect(lastRequest().fen).toBe('4k3/8/8/8/8/8/4P3/4K3 w - - 0 1');
  });

  it('says what is wrong with a FEN, and keeps the position', async () => {
    const user = userEvent.setup();
    renderAnalysis();
    const calls = analyze.mock.calls.length;
    await user.clear(field());
    await user.type(field(), 'pas une fen{Enter}');
    expect(screen.getByRole('alert').textContent).toContain('pas lisible');
    await user.clear(field());
    await user.type(field(), '8/8/8/8/8/8/8/R7 w - - 0 1{Enter}');
    expect(screen.getByRole('alert').textContent).toContain('roi');
    await user.clear(field());
    await user.type(field(), '4k3/8/8/8/8/8/4R3/4K3 w - - 0 1{Enter}');
    expect(screen.getByRole('alert').textContent).toContain('n’a pas le trait est en échec');
    expect(analyze).toHaveBeenCalledTimes(calls);
  });

  it('follows the position as it is played', async () => {
    const user = userEvent.setup();
    renderAnalysis();
    await user.click(cell('d2'));
    await user.click(cell('d4'));
    expect(field().value).toBe('rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1');
  });
});

describe('PositionAnalysis: the editor', () => {
  const pick = (name: string) => userEvent.click(screen.getByRole('button', { name }));

  it('opens on a position that cannot be searched, to fix it', () => {
    renderAnalysis({ start: '8/8/8/8/8/8/8/R7 w - - 0 1' });
    expect(analyze).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Éditer la position' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('status', { name: '' }).textContent).toContain('roi');
    expect((screen.getByRole('button', { name: 'Analyser cette position' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('sets a position up piece by piece, and analyses it once it is valid', async () => {
    const user = userEvent.setup();
    renderAnalysis();
    await user.click(screen.getByRole('button', { name: 'Éditer la position' }));
    await user.click(screen.getByRole('button', { name: 'Vider l’échiquier' }));
    expect((screen.getByRole('button', { name: 'Analyser cette position' }) as HTMLButtonElement).disabled).toBe(true);

    await pick('Roi blanc');
    await user.click(cell('e1'));
    await pick('Roi noir');
    await user.click(cell('e8'));
    await pick('Tour blanche');
    await user.click(cell('a1'));
    expect((screen.getByLabelText('Position (FEN)') as HTMLInputElement).value).toBe('4k3/8/8/8/8/8/8/R3K3 w - - 0 1');
    expect(screen.getByRole('status', { name: '' }).textContent).toContain('valide');

    const calls = analyze.mock.calls.length;
    await user.click(screen.getByRole('button', { name: 'Analyser cette position' }));
    expect(analyze).toHaveBeenCalledTimes(calls + 1);
    expect(lastRequest().fen).toBe('4k3/8/8/8/8/8/8/R3K3 w - - 0 1');
    expect(screen.getByRole('button', { name: 'Analyse' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('takes a piece off with the same piece or the eraser', async () => {
    const user = userEvent.setup();
    renderAnalysis({ start: '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1' });
    await user.click(screen.getByRole('button', { name: 'Éditer la position' }));
    await pick('Pion blanc');
    await user.click(cell('e2'));
    expect((screen.getByLabelText('Position (FEN)') as HTMLInputElement).value).toBe('4k3/8/8/8/8/8/8/4K3 w - - 0 1');
    await pick('Gomme');
    await user.click(cell('e8'));
    expect((screen.getByLabelText('Position (FEN)') as HTMLInputElement).value).toBe('8/8/8/8/8/8/8/4K3 w - - 0 1');
    expect(screen.getByRole('status', { name: '' }).textContent).toContain('roi');
  });

  it('changes the side to move, and offers the castling the pieces allow', async () => {
    const user = userEvent.setup();
    renderAnalysis({ start: '4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1' });
    await user.click(screen.getByRole('button', { name: 'Éditer la position' }));
    const small = screen.getByRole('checkbox', { name: 'Petit roque blanc' }) as HTMLInputElement;
    const big = screen.getByRole('checkbox', { name: 'Grand roque blanc' }) as HTMLInputElement;
    expect(small.checked && big.checked).toBe(true);
    expect((screen.getByRole('checkbox', { name: 'Petit roque noir' }) as HTMLInputElement).disabled).toBe(true);

    await user.click(big);
    await user.click(screen.getByRole('radio', { name: 'Aux Noirs' }));
    expect((screen.getByLabelText('Position (FEN)') as HTMLInputElement).value).toBe('4k3/8/8/8/8/8/8/R3K2R b K - 0 1');
  });

  it('puts the usual pieces back, or empties the board', async () => {
    const user = userEvent.setup();
    renderAnalysis({ start: '4k3/8/8/8/8/8/8/4K3 w - - 0 1' });
    await user.click(screen.getByRole('button', { name: 'Éditer la position' }));
    await user.click(screen.getByRole('button', { name: 'Position initiale' }));
    expect((screen.getByLabelText('Position (FEN)') as HTMLInputElement).value).toBe(STANDARD_START_FEN);
    await user.click(screen.getByRole('button', { name: 'Vider l’échiquier' }));
    expect((screen.getByLabelText('Position (FEN)') as HTMLInputElement).value).toBe('8/8/8/8/8/8/8/8 w - - 0 1');
  });

  it('stops the engine while the position is edited, and loads a FEN even if it is not legal yet', async () => {
    const user = userEvent.setup();
    renderAnalysis();
    await user.click(screen.getByRole('button', { name: 'Éditer la position' }));
    expect(stop).toHaveBeenCalled();
    const field = () => screen.getByLabelText('Position (FEN)') as HTMLInputElement;
    await user.clear(field());
    await user.type(field(), '8/8/8/8/8/8/8/R7{Enter}');
    expect(field().value).toBe('8/8/8/8/8/8/8/R7 w - - 0 1');
    expect(screen.queryByRole('alert')).toBeNull();
    expect((screen.getByRole('button', { name: 'Analyser cette position' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows the position being edited on the board, even without kings', async () => {
    const user = userEvent.setup();
    renderAnalysis();
    await user.click(screen.getByRole('button', { name: 'Éditer la position' }));
    await user.click(screen.getByRole('button', { name: 'Vider l’échiquier' }));
    expect(cell('e1').querySelector('svg')).toBeNull();
    await pick('Dame noire');
    await user.click(cell('d4'));
    expect(cell('d4').querySelector('svg')).not.toBeNull();
    expect(cell('a1').querySelector('svg')).toBeNull(); // not the usual start
  });
});
