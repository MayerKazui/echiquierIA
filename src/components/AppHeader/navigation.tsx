import React from 'react';
import {
  BarChart3,
  BookMarked,
  BookOpen,
  CalendarCheck,
  ClipboardList,
  Crown,
  Download,
  Dumbbell,
  EyeOff,
  GraduationCap,
  History,
  Grid3x3,
  Library,
  Puzzle,
  Route,
  Swords,
  Target,
  Timer,
  TrendingUp,
  Users,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { ENDGAME_CATEGORIES, type EndgameCategory } from '../../data/endgames';
import type { View as OpeningsView } from '../Openings/Openings';
import type { PuzzleMode } from '../Puzzles/Puzzles';
import type { VisionMode } from '../../utils/vision';

/** One destination of the navigation: it opens its view directly, on the right screen. */
export interface NavItem {
  id: string;
  label: string;
  /** What the entry opens (a tooltip: the lists stay short). */
  hint?: string;
  icon: React.ReactNode;
  onSelect: () => void;
  /** A switch (on or off) rather than an action. */
  checked?: boolean;
  /** A number to the right of the label (what waits there); nothing for 0 or none. */
  badge?: number;
}

/** A group of destinations, always shown open: reaching a view never takes more than one click. */
export interface NavSection {
  id: string;
  label: string;
  items: NavItem[];
}

export interface NavigationActions {
  isMuted: boolean;
  onToggleSound: () => void;
  /** Installs the app: given only when the browser offers it. */
  onInstall?: () => void;
  /** What is to be reviewed today, in all (the entry shows it); unknown until it is read. */
  reviewCount?: number;
  onOpenReview: () => void;
  onOpenHistory: () => void;
  onOpenProfile: () => void;
  onOpenPlan: () => void;
  onOpenTraining: () => void;
  onOpenPuzzles: (mode: PuzzleMode) => void;
  onOpenOpenings: (view: OpeningsView) => void;
  /** `null`: all the endgames. */
  onOpenEndgames: (category: EndgameCategory | null) => void;
  onOpenVision: (mode: VisionMode) => void;
  onOpenStudies: () => void;
  onOpenPlay: () => void;
}

const ICON = 'w-4 h-4';

const ENDGAME_HINTS: Record<EndgameCategory, string> = {
  mates: 'Mat avec la dame, avec la tour',
  pawns: 'Case clé, opposition, pion de tour',
  rooks: 'Lucena, Philidor',
};

/** The tree of the app: what the header menu (phone) and the side panel (large screen) both show. */
export function buildNavigation(actions: NavigationActions): NavSection[] {
  const { isMuted } = actions;
  const sections: NavSection[] = [
    {
      id: 'games',
      label: 'Mon jeu',
      items: [
        {
          id: 'review',
          label: "À réviser aujourd'hui",
          hint: 'Tout ce qui revient aujourd’hui : erreurs, puzzles, ouvertures, finales',
          icon: <CalendarCheck className={ICON} />,
          onSelect: actions.onOpenReview,
          badge: actions.reviewCount,
        },
        {
          id: 'history',
          label: 'Mes parties',
          hint: 'Rouvrir une partie déjà analysée',
          icon: <History className={ICON} />,
          onSelect: actions.onOpenHistory,
        },
        {
          id: 'profile',
          label: 'Mon profil',
          hint: 'Mes points faibles et mes points forts',
          icon: <BarChart3 className={ICON} />,
          onSelect: actions.onOpenProfile,
        },
        {
          id: 'plan',
          label: 'Mon plan',
          hint: 'Les objectifs de la semaine, tirés de mes parties',
          icon: <ClipboardList className={ICON} />,
          onSelect: actions.onOpenPlan,
        },
        {
          id: 'training',
          label: "S'entraîner sur mes erreurs",
          hint: 'Rejouer mes erreurs, au bon rythme',
          icon: <Dumbbell className={ICON} />,
          onSelect: actions.onOpenTraining,
        },
      ],
    },
    {
      id: 'puzzles',
      label: 'Puzzles',
      items: [
        {
          id: 'puzzles-free',
          label: 'Séance libre',
          hint: 'Des puzzles par niveau et par thème, avec chronomètre',
          icon: <Puzzle className={ICON} />,
          onSelect: () => actions.onOpenPuzzles('free'),
        },
        {
          id: 'puzzles-woodpecker',
          label: 'Woodpecker',
          hint: 'Le même lot de puzzles, cycle après cycle, de plus en plus vite',
          icon: <Timer className={ICON} />,
          onSelect: () => actions.onOpenPuzzles('woodpecker'),
        },
        {
          id: 'puzzles-stats',
          label: 'Statistiques',
          hint: 'Mes résultats par thème et par séance',
          icon: <TrendingUp className={ICON} />,
          onSelect: () => actions.onOpenPuzzles('stats'),
        },
      ],
    },
    {
      id: 'openings',
      label: 'Ouvertures',
      items: [
        {
          id: 'openings-explorer',
          label: 'Explorateur',
          hint: "Parcourir l'arbre des ouvertures coup par coup",
          icon: <BookOpen className={ICON} />,
          onSelect: () => actions.onOpenOpenings('explorer'),
        },
        {
          id: 'openings-repertoire',
          label: 'Mes ouvertures',
          hint: 'Celles que je joue vraiment, avec mes résultats',
          icon: <Library className={ICON} />,
          onSelect: () => actions.onOpenOpenings('repertoire'),
        },
        {
          id: 'openings-drill',
          label: 'Réviser mes lignes',
          hint: 'Rejouer mon répertoire et mes sorties de théorie',
          icon: <BookMarked className={ICON} />,
          onSelect: () => actions.onOpenOpenings('drill'),
        },
        {
          id: 'openings-opponent',
          label: 'Préparer un adversaire',
          hint: "Les ouvertures qu'un pseudo joue, lues sur chess.com ou Lichess",
          icon: <Users className={ICON} />,
          onSelect: () => actions.onOpenOpenings('opponent'),
        },
      ],
    },
    {
      id: 'endgames',
      label: 'Finales',
      items: [
        {
          id: 'endgames-all',
          label: 'Toutes les finales',
          hint: 'Les finales théoriques, jouées contre le moteur',
          icon: <Crown className={ICON} />,
          onSelect: () => actions.onOpenEndgames(null),
        },
        ...ENDGAME_CATEGORIES.map(({ value, label }) => ({
          id: `endgames-${value}`,
          label,
          hint: ENDGAME_HINTS[value],
          icon: <Target className={ICON} />,
          onSelect: () => actions.onOpenEndgames(value),
        })),
      ],
    },
    {
      id: 'vision',
      label: 'Vision',
      items: [
        {
          id: 'vision-coordinates',
          label: 'Coordonnées',
          hint: 'Trouver une case par son nom, 30 secondes, sans coordonnées affichées',
          icon: <Grid3x3 className={ICON} />,
          onSelect: () => actions.onOpenVision('coordinates'),
        },
        {
          id: 'vision-blind',
          label: 'Mode aveugle',
          hint: 'Suivre une partie lue coup par coup, sans voir les pièces',
          icon: <EyeOff className={ICON} />,
          onSelect: () => actions.onOpenVision('blind'),
        },
        {
          id: 'vision-lines',
          label: 'Calcul de lignes',
          hint: 'Calculer une ligne sans la jouer, puis dire où finit une pièce',
          icon: <Route className={ICON} />,
          onSelect: () => actions.onOpenVision('lines'),
        },
      ],
    },
    {
      id: 'play',
      label: 'Jouer et étudier',
      items: [
        {
          id: 'play',
          label: 'Jouer contre Stockfish',
          hint: 'Une partie à la force réglable, depuis le début ou une position',
          icon: <Swords className={ICON} />,
          onSelect: actions.onOpenPlay,
        },
        {
          id: 'studies',
          label: 'Études',
          hint: 'Mes chapitres de coups commentés, à jouer contre l’ordinateur',
          icon: <GraduationCap className={ICON} />,
          onSelect: actions.onOpenStudies,
        },
      ],
    },
    {
      id: 'settings',
      label: 'Réglages',
      items: [
        {
          id: 'sound',
          label: 'Son des coups',
          icon: isMuted ? <VolumeX className={ICON} /> : <Volume2 className={ICON} />,
          checked: !isMuted,
          onSelect: actions.onToggleSound,
        },
        ...(actions.onInstall
          ? [
              {
                id: 'install',
                label: "Installer l'application",
                hint: 'Elle fonctionne alors aussi hors ligne',
                icon: <Download className={ICON} />,
                onSelect: actions.onInstall,
              },
            ]
          : []),
      ],
    },
  ];
  return sections;
}
