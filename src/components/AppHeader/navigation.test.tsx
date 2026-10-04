import { describe, expect, it, vi } from 'vitest';
import { buildNavigation, type NavigationActions } from './navigation';

const actions = (over: Partial<NavigationActions> = {}): NavigationActions => ({
  isMuted: false,
  onToggleSound: vi.fn(),
  onOpenReview: vi.fn(),
  onOpenHistory: vi.fn(),
  onOpenProfile: vi.fn(),
  onOpenPlan: vi.fn(),
  onOpenTraining: vi.fn(),
  onOpenPuzzles: vi.fn(),
  onOpenOpenings: vi.fn(),
  onOpenEndgames: vi.fn(),
  onOpenVision: vi.fn(),
  onOpenStudies: vi.fn(),
  onOpenPlay: vi.fn(),
  ...over,
});

const labels = (sections: ReturnType<typeof buildNavigation>, id: string) =>
  sections.find((s) => s.id === id)?.items.map((item) => item.label);

describe('buildNavigation', () => {
  it('groups the views, with each sub-view of a window as an entry of its own', () => {
    const sections = buildNavigation(actions());
    expect(labels(sections, 'puzzles')).toEqual(['Séance libre', 'Woodpecker', 'Statistiques']);
    expect(labels(sections, 'openings')).toEqual([
      'Explorateur',
      'Mes ouvertures',
      'Réviser mes lignes',
      'Préparer un adversaire',
    ]);
    expect(labels(sections, 'endgames')).toEqual([
      'Toutes les finales',
      'Mats élémentaires',
      'Finales de pions',
      'Finales de tours',
    ]);
    expect(labels(sections, 'vision')).toEqual(['Coordonnées', 'Mode aveugle', 'Calcul de lignes']);
  });

  it('puts "À réviser aujourd\'hui" first, with what waits there, and opens it', () => {
    const a = actions({ reviewCount: 7 });
    const [first] = buildNavigation(a)[0].items;
    expect(first).toMatchObject({ id: 'review', label: "À réviser aujourd'hui", badge: 7 });
    first.onSelect();
    expect(a.onOpenReview).toHaveBeenCalledTimes(1);
    expect(buildNavigation(actions())[0].items[0].badge).toBeUndefined();
  });

  it('has no two entries with the same name, so that each one can be told apart', () => {
    const all = buildNavigation(actions()).flatMap((s) => s.items.map((i) => i.label));
    expect(new Set(all).size).toBe(all.length);
  });

  it('opens each sub-view directly, on the mode, the view or the family it names', () => {
    const a = actions();
    const sections = buildNavigation(a);
    const select = (id: string) =>
      sections
        .flatMap((s) => s.items)
        .find((i) => i.id === id)
        ?.onSelect();
    select('puzzles-woodpecker');
    select('puzzles-stats');
    select('openings-opponent');
    select('endgames-rooks');
    select('endgames-all');
    select('vision-blind');
    select('vision-lines');
    expect(a.onOpenPuzzles).toHaveBeenNthCalledWith(1, 'woodpecker');
    expect(a.onOpenPuzzles).toHaveBeenNthCalledWith(2, 'stats');
    expect(a.onOpenOpenings).toHaveBeenCalledWith('opponent');
    expect(a.onOpenEndgames).toHaveBeenNthCalledWith(1, 'rooks');
    expect(a.onOpenEndgames).toHaveBeenNthCalledWith(2, null);
    expect(a.onOpenVision).toHaveBeenNthCalledWith(1, 'blind');
    expect(a.onOpenVision).toHaveBeenNthCalledWith(2, 'lines');
  });

  it('shows the sound as a switch, and the install entry only where the browser offers it', () => {
    const settings = (over: Partial<NavigationActions>) =>
      buildNavigation(actions(over)).find((s) => s.id === 'settings')!.items;
    expect(settings({ isMuted: true })[0]).toMatchObject({ id: 'sound', checked: false });
    expect(settings({ isMuted: false })[0]).toMatchObject({ id: 'sound', checked: true });
    expect(settings({}).map((i) => i.id)).toEqual(['sound']);
    expect(settings({ onInstall: vi.fn() }).map((i) => i.id)).toEqual(['sound', 'install']);
  });
});
