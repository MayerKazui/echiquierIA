/**
 * The themes of the Lichess puzzles, in French, and how the puzzle screens group them. A theme the app does not know
 * (Lichess adds some) is shown under its own name, in the group "Autres".
 */

export type ThemeGroup = 'motifs' | 'mates' | 'phases' | 'others';

export const THEME_GROUPS: ReadonlyArray<{ id: ThemeGroup; label: string }> = [
  { id: 'motifs', label: 'Motifs tactiques' },
  { id: 'mates', label: 'Mats' },
  { id: 'phases', label: 'Phases et finales' },
  { id: 'others', label: 'Autres' },
];

/** Lichess name → [French name, group]. */
const THEMES: Record<string, [string, ThemeGroup]> = {
  // Tactical motifs
  fork: ['Fourchette', 'motifs'],
  pin: ['Clouage', 'motifs'],
  skewer: ['Enfilade', 'motifs'],
  discoveredAttack: ['Attaque à la découverte', 'motifs'],
  discoveredCheck: ['Échec à la découverte', 'motifs'],
  doubleCheck: ['Double échec', 'motifs'],
  deflection: ['Déviation', 'motifs'],
  attraction: ['Attraction', 'motifs'],
  clearance: ['Dégagement', 'motifs'],
  interference: ['Interférence', 'motifs'],
  intermezzo: ['Coup intermédiaire', 'motifs'],
  xRayAttack: ['Rayon X', 'motifs'],
  zugzwang: ['Zugzwang', 'motifs'],
  sacrifice: ['Sacrifice', 'motifs'],
  quietMove: ['Coup calme', 'motifs'],
  defensiveMove: ['Coup défensif', 'motifs'],
  hangingPiece: ['Pièce en prise', 'motifs'],
  trappedPiece: ['Pièce piégée', 'motifs'],
  capturingDefender: ['Capture du défenseur', 'motifs'],
  exposedKing: ['Roi exposé', 'motifs'],
  advancedPawn: ['Pion avancé', 'motifs'],
  promotion: ['Promotion', 'motifs'],
  underPromotion: ['Sous-promotion', 'motifs'],
  enPassant: ['Prise en passant', 'motifs'],
  castling: ['Roque', 'motifs'],
  collinearMove: ['Coup colinéaire', 'motifs'],
  attackingF2F7: ['Attaque en f2 / f7', 'motifs'],
  kingsideAttack: ['Attaque sur l’aile roi', 'motifs'],
  queensideAttack: ['Attaque sur l’aile dame', 'motifs'],

  // Mates
  mate: ['Mat', 'mates'],
  mateIn1: ['Mat en 1', 'mates'],
  mateIn2: ['Mat en 2', 'mates'],
  mateIn3: ['Mat en 3', 'mates'],
  mateIn4: ['Mat en 4', 'mates'],
  mateIn5: ['Mat en 5 ou plus', 'mates'],
  backRankMate: ['Mat du couloir', 'mates'],
  smotheredMate: ['Mat étouffé', 'mates'],
  anastasiaMate: ['Mat d’Anastasia', 'mates'],
  arabianMate: ['Mat arabe', 'mates'],
  bodenMate: ['Mat de Boden', 'mates'],
  doubleBishopMate: ['Mat des deux fous', 'mates'],
  dovetailMate: ['Mat en queue d’aronde', 'mates'],
  hookMate: ['Mat du crochet', 'mates'],
  killBoxMate: ['Mat en boîte', 'mates'],
  vukovicMate: ['Mat de Vuković', 'mates'],
  cornerMate: ['Mat du coin', 'mates'],
  epauletteMate: ['Mat des épaulettes', 'mates'],
  morphysMate: ['Mat de Morphy', 'mates'],
  operaMate: ['Mat de l’Opéra', 'mates'],
  pillsburysMate: ['Mat de Pillsbury', 'mates'],
  balestraMate: ['Mat de Balestra', 'mates'],
  blindSwineMate: ['Mat des deux tours', 'mates'],
  swallowstailMate: ['Mat en queue d’hirondelle', 'mates'],
  triangleMate: ['Mat du triangle', 'mates'],

  // Phases and endgames
  opening: ['Ouverture', 'phases'],
  middlegame: ['Milieu de jeu', 'phases'],
  endgame: ['Finale', 'phases'],
  rookEndgame: ['Finale de tours', 'phases'],
  bishopEndgame: ['Finale de fous', 'phases'],
  knightEndgame: ['Finale de cavaliers', 'phases'],
  pawnEndgame: ['Finale de pions', 'phases'],
  queenEndgame: ['Finale de dames', 'phases'],
  queenRookEndgame: ['Finale dame et tour', 'phases'],

  // What the puzzle is about, how long it is, who played
  advantage: ['Prendre l’avantage', 'others'],
  crushing: ['Gain écrasant', 'others'],
  equality: ['Égaliser', 'others'],
  oneMove: ['Un seul coup', 'others'],
  short: ['Court (2 coups)', 'others'],
  long: ['Long (3 coups)', 'others'],
  veryLong: ['Très long (4 coups ou plus)', 'others'],
  master: ['Partie de maîtres', 'others'],
  masterVsMaster: ['Maître contre maître', 'others'],
  superGM: ['Partie de super-GM', 'others'],
};

/** The name of a theme for the screen. */
export function themeLabel(theme: string): string {
  return THEMES[theme]?.[0] ?? theme;
}

export function themeGroup(theme: string): ThemeGroup {
  return THEMES[theme]?.[1] ?? 'others';
}

/** The names of the themes that exist, in the order of their group. */
export function knownThemes(): string[] {
  return Object.keys(THEMES);
}

/**
 * The themes to offer, grouped: only those the index has puzzles for, the known ones in the order above, then the
 * unknown ones by name.
 */
export function groupThemes(available: readonly string[]): Array<{ id: ThemeGroup; label: string; themes: string[] }> {
  const known = knownThemes();
  const order = (theme: string) => {
    const at = known.indexOf(theme);
    return at === -1 ? Number.MAX_SAFE_INTEGER : at;
  };
  const sorted = [...available].sort((a, b) => order(a) - order(b) || (a < b ? -1 : 1));
  return THEME_GROUPS.map((group) => ({
    ...group,
    themes: sorted.filter((theme) => themeGroup(theme) === group.id),
  })).filter((group) => group.themes.length > 0);
}
