/**
 * The theoretical endgames to practise (see utils/endgameDrill.ts): each one is a position where the player is to
 * move, with a goal, to win it or to hold the draw. Every position was checked with the full Stockfish 19 at
 * depth 22: the result below is the engine's, not an opinion (a win is far above +4, a draw within ±0.15, both
 * from the point of view of the side to move).
 */

export type EndgameGoal = 'win' | 'draw';

export type EndgameCategory = 'mates' | 'pawns' | 'rooks';

export interface Endgame {
  /** Stable key (it names the card of the position, see `endgameCardId`): never changed once published. */
  id: string;
  category: EndgameCategory;
  title: string;
  /** Win the position (checkmate, or a pawn that promotes for good), or hold the draw. */
  goal: EndgameGoal;
  /** The position: the player's side is the one to move. */
  fen: string;
  /** What has to be understood, told before the first move. */
  idea: string;
}

export const ENDGAME_CATEGORIES: Array<{ value: EndgameCategory; label: string }> = [
  { value: 'mates', label: 'Mats élémentaires' },
  { value: 'pawns', label: 'Finales de pions' },
  { value: 'rooks', label: 'Finales de tours' },
];

export const ENDGAMES: readonly Endgame[] = [
  {
    id: 'mat-dame',
    category: 'mates',
    title: 'Mat avec la dame',
    goal: 'win',
    fen: '8/8/8/4k3/8/8/8/3QK3 w - - 0 1',
    idea: "Repoussez le roi adverse vers le bord avec la dame, à un saut de cavalier de lui, puis amenez votre roi. Attention au pat : laissez toujours une case au roi tant que vous n'avez pas le mat.",
  },
  {
    id: 'mat-tour',
    category: 'mates',
    title: 'Mat avec la tour',
    goal: 'win',
    fen: '8/8/8/4k3/8/8/8/3RK3 w - - 0 1',
    idea: "La tour coupe le roi adverse sur une colonne ou une rangée, votre roi avance pour prendre l'opposition, puis la tour donne l'échec sur le bord. Il faut parfois perdre un temps pour passer l'opposition.",
  },
  {
    id: 'pion-case-cle',
    category: 'pawns',
    title: 'Roi sur la case clé',
    goal: 'win',
    fen: '4k3/8/4K3/4P3/8/8/8/8 w - - 0 1',
    idea: 'Un roi installé sur la sixième rangée devant son pion gagne, quel que soit le trait : il prend la case de promotion ou conduit le roi adverse au bord. Poussez le pion au bon moment, pas trop tôt.',
  },
  {
    id: 'pion-devant',
    category: 'pawns',
    title: 'Le roi passe devant son pion',
    goal: 'win',
    fen: '8/8/3k4/8/4PK2/8/8/8 w - - 0 1',
    idea: "Un pion seul ne gagne rien : c'est le roi qui ouvre la voie. Avancez-le devant le pion, sur une case clé, avant de pousser.",
  },
  {
    id: 'pion-opposition',
    category: 'pawns',
    title: 'Déloger le roi adverse',
    goal: 'win',
    fen: '8/8/8/3k4/8/4K3/4P3/8 w - - 0 1',
    idea: "Le roi adverse est devant le pion et lui barre la route. Cherchez un coup de roi qui l'oblige à céder du terrain : un coup de pion trop rapide laisse la nulle.",
  },
  {
    id: 'pion-tour-nulle',
    category: 'pawns',
    title: 'Pion de tour : la nulle dans le coin',
    goal: 'draw',
    fen: 'k7/8/K7/P7/8/8/8/8 b - - 0 1',
    idea: 'Avec un pion de colonne a ou h, le défenseur gagne la nulle en restant dans le coin de promotion : le pat est sa ressource. Ne vous laissez jamais chasser du coin.',
  },
  {
    id: 'lucena-b',
    category: 'rooks',
    title: 'Lucena : construire le pont',
    goal: 'win',
    fen: '1K1k4/1P6/8/8/8/8/r7/2R5 w - - 0 1',
    idea: 'Le roi est devant son pion sur la dernière rangée, mais il est gêné par les échecs de la tour adverse. Libérez-le avec la tour : placez-la sur la quatrième rangée, sortez le roi, puis abritez-le des échecs en interposant la tour (le pont).',
  },
  {
    id: 'lucena-d',
    category: 'rooks',
    title: 'Lucena, de l’autre côté',
    goal: 'win',
    fen: '3K4/3P1k2/8/8/8/8/r7/4R3 w - - 0 1',
    idea: 'La même position que la précédente, de l’autre côté du pion : même plan (tour sur la quatrième rangée, roi dehors, pont), mais avec les colonnes inversées.',
  },
  {
    id: 'philidor-d5',
    category: 'rooks',
    title: 'Philidor : la tour reste sur la sixième',
    goal: 'draw',
    fen: '3k4/8/r7/3PK3/7R/8/8/8 b - - 0 1',
    idea: 'Gardez la tour sur la sixième rangée pour que le roi adverse ne passe pas, et le roi devant le pion. Quand le pion avance en sixième, la tour change de camp et donne des échecs par derrière.',
  },
  {
    id: 'philidor-e5',
    category: 'rooks',
    title: 'Philidor, pion en e5',
    goal: 'draw',
    fen: '4k3/8/r7/4PK2/7R/8/8/8 b - - 0 1',
    idea: 'La méthode de Philidor avec un pion central : la tour tient la sixième rangée tant que le pion n’a pas dépassé, puis elle donne des échecs depuis l’arrière.',
  },
  {
    id: 'philidor-sixieme',
    category: 'rooks',
    title: 'Philidor : le pion arrive en sixième',
    goal: 'draw',
    fen: '3k4/8/3P4/4K3/8/8/r7/7R b - - 0 1',
    idea: "Le pion est en sixième rangée : la tour ne doit plus se tenir devant, elle donne maintenant des échecs à distance, par derrière ou de côté, pour que le roi adverse n'ait aucun abri.",
  },
];

export const endgameById = (id: string): Endgame | undefined => ENDGAMES.find((endgame) => endgame.id === id);
