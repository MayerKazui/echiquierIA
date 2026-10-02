// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listStudies } from '../../services/studyStore';
import { Studies } from './Studies';

vi.mock('../../utils/chessAudio', () => ({ chessAudio: { playForMove: vi.fn() } }));

const cell = (square: string) => document.querySelector(`[data-square="${square}"]`) as HTMLElement;

const renderStudies = () => {
  const onClose = vi.fn();
  const view = render(<Studies onClose={onClose} />);
  return { onClose, ...view };
};

async function movePiece(user: ReturnType<typeof userEvent.setup>, from: string, to: string) {
  await user.click(cell(from));
  await user.click(cell(to));
}

async function createStudy(user: ReturnType<typeof userEvent.setup>, name = 'Ma sicilienne') {
  await user.click(await screen.findByRole('button', { name: 'Nouvelle étude' }));
  await user.type(screen.getByLabelText("Nom de l'étude"), name);
  await user.click(screen.getByRole('button', { name: 'Créer' }));
}

const PGN = `[StudyName "Italienne"]
[ChapterName "Giuoco Piano"]
[Orientation "white"]

{ On développe vite. } 1. e4 e5 2. Nf3 Nc6 3. Bc4 *

[StudyName "Italienne"]
[ChapterName "Deux Cavaliers"]
[Orientation "black"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 *`;

beforeEach(() => {
  Object.defineProperty(globalThis, 'indexedDB', { value: new IDBFactory(), configurable: true, writable: true });
  localStorage.clear();
});

describe('Studies', () => {
  it('starts with no study and says they stay in the browser', async () => {
    renderStudies();
    expect(await screen.findByText(/Aucune étude pour l'instant/)).toBeTruthy();
  });

  it('creates a study, adds moves and variations by playing on the board, and keeps it', async () => {
    const user = userEvent.setup();
    const { unmount } = renderStudies();
    await createStudy(user);

    expect(await screen.findByDisplayValue('Ma sicilienne')).toBeTruthy();
    expect(screen.getByText(/Jouez un coup sur l'échiquier pour commencer/)).toBeTruthy();

    await movePiece(user, 'e2', 'e4');
    await movePiece(user, 'c7', 'c5');
    const tree = screen.getByRole('group', { name: "Coups de l'étude" });
    expect(within(tree).getByRole('button', { name: '1.e4' })).toBeTruthy();
    expect(within(tree).getByRole('button', { name: 'c5' })).toBeTruthy();

    // Back to e4, another reply: it is a variation, drawn in its own block and numbered
    await user.click(within(tree).getByRole('button', { name: '1.e4' }));
    await movePiece(user, 'e7', 'e5');
    expect(within(tree).getByRole('button', { name: '1…e5' })).toBeTruthy();
    expect(within(tree).getByRole('button', { name: 'c5' })).toBeTruthy();

    // A comment and a glyph on the selected move
    await user.click(within(tree).getByRole('button', { name: '1…e5' }));
    await user.click(screen.getByLabelText('Commentaire'));
    await user.paste('Le jeu ouvert.');
    await user.click(screen.getByRole('button', { name: 'Bon coup' }));
    expect(within(tree).getByRole('button', { name: '1…e5!' })).toBeTruthy();
    expect(within(tree).getByText(/Le jeu ouvert\./)).toBeTruthy();

    unmount(); // closing the view writes the last changes
    await waitFor(async () => {
      const [saved] = await listStudies();
      expect(saved?.name).toBe('Ma sicilienne');
      const e4 = saved.chapters[0].root.children[0];
      expect(e4.children.map((c) => c.san)).toEqual(['c5', 'e5']);
      expect(e4.children[1].comment).toBe('Le jeu ouvert.');
      expect(e4.children[1].nags).toEqual([1]);
    });
  });

  it('promotes a variation to the main line and deletes a move after a confirmation', async () => {
    const user = userEvent.setup();
    renderStudies();
    await createStudy(user);
    await movePiece(user, 'e2', 'e4');
    await movePiece(user, 'c7', 'c5');
    const tree = screen.getByRole('group', { name: "Coups de l'étude" });
    await user.click(within(tree).getByRole('button', { name: '1.e4' }));
    await movePiece(user, 'e7', 'e5');

    await user.click(within(tree).getByRole('button', { name: '1…e5' }));
    await user.click(screen.getByRole('button', { name: 'Faire de cette variante la ligne principale' }));
    expect(screen.queryByRole('button', { name: 'Faire de cette variante la ligne principale' })).toBeNull();
    // e5 is now the main line, and c5 the variation
    expect(within(tree).getByRole('button', { name: 'e5' })).toBeTruthy();

    await user.click(within(tree).getByRole('button', { name: '1…c5' }));
    await user.click(screen.getByRole('button', { name: 'Supprimer ce coup' }));
    await user.click(screen.getByRole('button', { name: 'Supprimer ce coup et la suite' }));
    expect(within(tree).queryByRole('button', { name: '1…c5' })).toBeNull();
    expect(within(tree).getByRole('button', { name: 'e5' })).toBeTruthy();
  });

  it('walks the moves with the arrow keys', async () => {
    const user = userEvent.setup();
    renderStudies();
    await createStudy(user);
    await movePiece(user, 'e2', 'e4');
    await movePiece(user, 'e7', 'e5');
    const tree = screen.getByRole('group', { name: "Coups de l'étude" });
    const current = () => within(tree).getByRole('button', { current: 'step' }).textContent;

    expect(current()).toBe('e5');
    await user.keyboard('{ArrowLeft}');
    expect(current()).toBe('1.e4');
    await user.keyboard('{ArrowRight}');
    expect(current()).toBe('e5');
    await user.keyboard('{Home}');
    expect(within(tree).queryByRole('button', { current: 'step' })).toBeNull();
    await user.keyboard('{End}');
    expect(current()).toBe('e5');
  });

  it('imports a PGN with a game per chapter as a study', async () => {
    const user = userEvent.setup();
    renderStudies();
    await user.click(await screen.findByRole('button', { name: 'Importer un PGN' }));
    await user.click(screen.getByLabelText('PGN'));
    await user.paste(PGN);
    expect(await screen.findByText('2 chapitres, 11 coups à importer.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: "Créer l'étude" }));

    expect(await screen.findByDisplayValue('Italienne')).toBeTruthy();
    const chapters = screen.getByRole('group', { name: 'Chapitres' });
    expect(within(chapters).getByRole('button', { name: 'Giuoco Piano' })).toBeTruthy();
    await user.click(within(chapters).getByRole('button', { name: 'Deux Cavaliers' }));
    expect(screen.getByRole('button', { name: 'Noirs', pressed: true })).toBeTruthy();
    const tree = screen.getByRole('group', { name: "Coups de l'étude" });
    expect(within(tree).getByRole('button', { name: 'Cf6' })).toBeTruthy();
  });

  it('warns when the text is not a PGN and keeps the import disabled', async () => {
    const user = userEvent.setup();
    renderStudies();
    await user.click(await screen.findByRole('button', { name: 'Importer un PGN' }));
    await user.click(screen.getByLabelText('PGN'));
    await user.paste('rien à voir');
    expect(await screen.findByText(/Aucun chapitre lisible/)).toBeTruthy();
    expect((screen.getByRole('button', { name: "Créer l'étude" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('adds the chapters of a PGN to the open study', async () => {
    const user = userEvent.setup();
    renderStudies();
    await createStudy(user);
    await user.click(screen.getByRole('button', { name: 'Importer' }));
    await user.click(screen.getByLabelText('PGN'));
    await user.paste('1. d4 d5 2. c4 *');
    await user.click(screen.getByRole('button', { name: 'Ajouter les chapitres' }));
    const chapters = screen.getByRole('group', { name: 'Chapitres' });
    expect(within(chapters).getAllByRole('button')).toHaveLength(4); // Chapitre 1, Chapitre 2, + Chapitre, Importer
    // The imported game is numbered after the chapters that were already there
    expect(within(chapters).getByRole('button', { name: 'Chapitre 2', pressed: true })).toBeTruthy();
  });

  it('exports the study as a PGN file', async () => {
    const user = userEvent.setup();
    const download = vi.fn();
    vi.doMock('../../utils/download', () => ({ downloadTextFile: download }));
    vi.resetModules();
    const { Studies: Fresh } = await import('./Studies');
    render(<Fresh onClose={() => {}} />);
    await createStudy(user, 'Export');
    await movePiece(user, 'd2', 'd4');
    await user.click(screen.getByRole('button', { name: 'Exporter en PGN' }));
    expect(download).toHaveBeenCalledTimes(1);
    expect(download.mock.calls[0][0]).toBe('Export.pgn');
    expect(download.mock.calls[0][1]).toContain('1.d4');
    vi.doUnmock('../../utils/download');
  });

  it('deletes a study after a confirmation', async () => {
    const user = userEvent.setup();
    renderStudies();
    await createStudy(user, 'À supprimer');
    await user.click(await screen.findByRole('button', { name: 'Mes études' }));
    await user.click(screen.getByRole('button', { name: "Supprimer l'étude À supprimer" }));
    await user.click(screen.getByRole('button', { name: /^Supprimer « À supprimer »/ }));
    await waitFor(() => expect(screen.queryByRole('list', { name: 'Mes études' })).toBeNull());
    expect(await listStudies()).toEqual([]);
  });
});

describe('Studies, a chapter locked', () => {
  async function openLockedChapter(user: ReturnType<typeof userEvent.setup>) {
    renderStudies();
    await user.click(await screen.findByRole('button', { name: 'Importer un PGN' }));
    await user.click(screen.getByLabelText('PGN'));
    await user.paste('1. e4 e5 (1... c5) 2. Nf3 *');
    await user.click(screen.getByRole('button', { name: "Créer l'étude" }));
    await user.click(await screen.findByRole('button', { name: /Jouer ce chapitre/ }));
  }

  it('hides the tree, takes back a move that is not in the study and counts it', async () => {
    const user = userEvent.setup();
    await openLockedChapter(user);
    expect(screen.queryByRole('group', { name: "Coups de l'étude" })).toBeNull();
    expect(screen.getByText(/À vous de jouer/)).toBeTruthy();

    await movePiece(user, 'd2', 'd4');
    expect(await screen.findByText(/d4 n'est pas dans l'étude/)).toBeTruthy();
    expect(cell('d2').querySelector('svg, img, [data-piece]') ?? cell('d2').textContent).toBeTruthy();
    expect(screen.getByText(/Coups hors étude : 1/)).toBeTruthy();
  });

  it('answers with the moves of the study and tells when the line is over', async () => {
    const user = userEvent.setup();
    vi.spyOn(Math, 'random').mockReturnValue(0); // the main line
    await openLockedChapter(user);

    await movePiece(user, 'e2', 'e4');
    const played = screen.getByRole('list', { name: 'Coups joués' });
    await waitFor(() => expect(within(played).getByText('1…e5')).toBeTruthy(), { timeout: 3000 });

    await movePiece(user, 'g1', 'f3');
    expect(await screen.findByText(/Fin de la ligne, avec 0|Fin de la ligne, sans une erreur/)).toBeTruthy();
    vi.restoreAllMocks();
  });

  it('unlocks the chapter', async () => {
    const user = userEvent.setup();
    await openLockedChapter(user);
    await user.click(screen.getByRole('button', { name: 'Déverrouiller' }));
    expect(screen.getByRole('group', { name: "Coups de l'étude" })).toBeTruthy();
  });

  it('shows a hint, and lets the player take the other side', async () => {
    const user = userEvent.setup();
    await openLockedChapter(user);
    await user.click(screen.getByRole('button', { name: 'Indice' }));
    await user.click(screen.getByRole('button', { name: 'les Noirs' }));
    // Black: the computer plays e4 first
    const played = await screen.findByRole('list', { name: 'Coups joués' }, { timeout: 3000 });
    expect(within(played).getByText('1.e4')).toBeTruthy();
    expect(await screen.findByText(/À vous de jouer/)).toBeTruthy();
  });
});

describe('Studies, arrows and circles', () => {
  const arrows = () => document.querySelectorAll('svg line[marker-end^="url(#userArrow"]');
  const circles = () => document.querySelectorAll('[style*="border-color"]');
  const drag = (from: string, to: string, init: MouseEventInit = {}) => {
    fireEvent.mouseDown(cell(from), { button: 2, ...init });
    fireEvent.mouseEnter(cell(to));
    fireEvent.mouseUp(cell(to), { button: 2, ...init });
  };

  async function importShapes(user: ReturnType<typeof userEvent.setup>) {
    const view = renderStudies();
    await user.click(await screen.findByRole('button', { name: 'Importer un PGN' }));
    await user.click(screen.getByRole('textbox', { name: 'PGN' }));
    await user.paste('1. e4 { [%cal Ge2e4,Rb1c3] [%csl Rd5] Le centre. } e5 *');
    await user.click(screen.getByRole('button', { name: "Créer l'étude" }));
    const tree = await screen.findByRole('group', { name: "Coups de l'étude" });
    await user.click(within(tree).getByRole('button', { name: '1.e4' }));
    return view;
  }

  it('draws the arrows and circles read from the PGN on the position of the move', async () => {
    const user = userEvent.setup();
    await importShapes(user);
    expect(arrows()).toHaveLength(2);
    expect(circles()).toHaveLength(1);
    expect(cell('d5').querySelector('[style*="border-color"]')).not.toBeNull();

    // They belong to the move: the starting position has none
    await user.keyboard('{Home}');
    expect(arrows()).toHaveLength(0);
    expect(circles()).toHaveLength(0);
  });

  it('keeps what is drawn with the right button on the position, and writes it in the PGN', async () => {
    const user = userEvent.setup();
    const { unmount } = await importShapes(user);
    drag('g1', 'f3', { shiftKey: true });
    drag('e4', 'e4', { altKey: true });
    expect(arrows()).toHaveLength(3);
    expect(circles()).toHaveLength(2);

    // Another position, and back: the drawings are still there
    await user.keyboard('{ArrowRight}');
    expect(arrows()).toHaveLength(0);
    await user.keyboard('{ArrowLeft}');
    expect(arrows()).toHaveLength(3);

    unmount();
    await waitFor(async () => {
      const [saved] = await listStudies();
      const shapes = saved.chapters[0].root.children[0].shapes;
      expect(shapes).toContainEqual({ brush: 'Y', from: 'g1', to: 'f3' });
      expect(shapes).toContainEqual({ brush: 'B', from: 'e4', to: 'e4' });
      expect(shapes).toHaveLength(5);
    });
  });

  it('erases the drawings of the position', async () => {
    const user = userEvent.setup();
    await importShapes(user);
    await user.click(screen.getByRole('button', { name: 'Effacer les dessins' }));
    expect(arrows()).toHaveLength(0);
    expect(circles()).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Effacer les dessins' })).toBeNull();
  });

  it('shows them again when the chapter is played, on the position after the last move', async () => {
    const user = userEvent.setup();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    await importShapes(user);
    await user.click(screen.getByRole('button', { name: /Jouer ce chapitre/ }));
    expect(arrows()).toHaveLength(0);
    await movePiece(user, 'e2', 'e4');
    await waitFor(() => expect(arrows()).toHaveLength(2), { timeout: 3000 });
    vi.restoreAllMocks();
  });
});
