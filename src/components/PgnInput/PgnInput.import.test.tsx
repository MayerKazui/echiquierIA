// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchGamesPage, type ImportedGame } from '../../services/gameImport';
import { PgnInput } from './PgnInput';

vi.mock('../../services/gameImport', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/gameImport')>()),
  fetchGamesPage: vi.fn(),
}));

const PGN = '[White "alice"]\n[Black "Bob"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 1-0';

const imported: ImportedGame = {
  id: 'g1',
  source: 'lichess',
  url: 'https://lichess.org/g1',
  pgn: PGN,
  white: 'alice',
  black: 'Bob',
  playedAt: Date.UTC(2026, 0, 2),
  speed: 'blitz',
  timeControl: '5+3',
  rated: true,
  userColor: 'w',
  outcome: 'win',
  plies: 6,
};

function renderInput(props: Partial<React.ComponentProps<typeof PgnInput>> = {}) {
  const onAnalyze = vi.fn();
  const onUpdatePseudo = vi.fn();
  render(
    <PgnInput
      currentPgn=""
      userPseudo="alice"
      onUpdatePseudo={onUpdatePseudo}
      onAnalyze={onAnalyze}
      isAnalyzing={false}
      {...props}
    />
  );
  return { onAnalyze, onUpdatePseudo };
}

async function importGame() {
  await userEvent.click(screen.getByRole('button', { name: 'Lichess' }));
  await userEvent.click(screen.getByRole('button', { name: 'Chercher' }));
  await userEvent.click(await screen.findByRole('button', { name: /^Charger la partie contre Bob/ }));
}

beforeEach(() => {
  localStorage.clear();
  vi.mocked(fetchGamesPage).mockReset();
  vi.mocked(fetchGamesPage).mockResolvedValue({ games: [imported], cursor: null });
});

describe('PgnInput: import from chess.com / Lichess', () => {
  it('puts the picked game in the PGN field and analyses it at the chosen depth', async () => {
    const { onAnalyze } = renderInput();
    await importGame();

    expect((screen.getByRole('textbox', { name: 'Contenu PGN' }) as HTMLTextAreaElement).value).toBe(PGN);
    await userEvent.click(screen.getByRole('radio', { name: /Expert/ }));
    await userEvent.click(screen.getByRole('button', { name: /Lancer l'Analyse/ }));
    expect(onAnalyze).toHaveBeenCalledWith(PGN, 16);
  });

  it('keeps the pseudo when it is one of the players', async () => {
    const { onUpdatePseudo } = renderInput({ userPseudo: 'ALICE' });
    await importGame();
    expect(onUpdatePseudo).not.toHaveBeenCalled();
  });

  it('takes the pseudo of the search when the current one is not in the game, so the board faces the right way', async () => {
    localStorage.setItem('chess_import_user_lichess', 'alice');
    const { onUpdatePseudo } = renderInput({ userPseudo: 'someone-else' });
    await importGame();
    expect(onUpdatePseudo).toHaveBeenCalledWith('alice');
  });

  it('marks the imported game until the PGN is edited by hand', async () => {
    renderInput();
    await importGame();
    const row = screen.getByRole('button', { name: /^Charger la partie contre Bob/ });
    expect(row.getAttribute('aria-pressed')).toBe('true');

    await userEvent.type(screen.getByRole('textbox', { name: 'Contenu PGN' }), ' ');
    expect(screen.getByRole('button', { name: /^Charger la partie contre Bob/ }).getAttribute('aria-pressed')).toBe(
      'false'
    );
  });

  it('is disabled while an analysis runs, like the rest of the form', () => {
    renderInput({ isAnalyzing: true });
    // `disabled` comes from the fieldset around the form: only `:disabled` sees it
    expect(screen.getByRole('button', { name: 'Lichess' }).matches(':disabled')).toBe(true);
    expect(screen.getByRole('textbox', { name: 'Pseudo chess.com' }).matches(':disabled')).toBe(true);
  });
});
