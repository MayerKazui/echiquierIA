import React from 'react';
import {
  BarChart3,
  BookOpen,
  ClipboardList,
  Download,
  Dumbbell,
  FileText,
  GraduationCap,
  History,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { GameMetadata } from '../../types/chess';
import { AppTab, PlayerColor } from '../../types/ui';
import { ViewTabs } from './ViewTabs';
import { PseudoEditor } from './PseudoEditor';
import { AppMenu, type AppMenuItem } from './AppMenu';

interface AppHeaderProps {
  metadata?: GameMetadata;
  hasAnalysis: boolean;
  /** While an analysis runs the summary (Bilan) is not available yet. */
  isAnalyzing?: boolean;
  activeTab: AppTab;
  userPseudo: string;
  userColor: PlayerColor;
  isMuted: boolean;
  onChangeTab: (tab: AppTab) => void;
  onUpdatePseudo: (pseudo: string) => void;
  onUpdateUserColor: (color: PlayerColor) => void;
  onToggleSound: () => void;
  onOpenPgnModal: () => void;
  onOpenHistory: () => void;
  onOpenProfile: () => void;
  onOpenTraining: () => void;
  onOpenOpenings: () => void;
  onOpenStudies: () => void;
  onOpenPlan: () => void;
  /** Installs the app: given only when the browser offers it. */
  onInstall?: () => void;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  metadata,
  hasAnalysis,
  isAnalyzing = false,
  activeTab,
  userPseudo,
  userColor,
  isMuted,
  onChangeTab,
  onUpdatePseudo,
  onUpdateUserColor,
  onToggleSound,
  onOpenPgnModal,
  onOpenHistory,
  onOpenProfile,
  onOpenTraining,
  onOpenOpenings,
  onOpenStudies,
  onOpenPlan,
  onInstall,
}) => {
  const ICON = 'w-4 h-4';
  const menuItems: AppMenuItem[] = [
    {
      id: 'history',
      label: 'Mes parties',
      hint: 'Rouvrir une partie déjà analysée',
      icon: <History className={ICON} />,
      onSelect: onOpenHistory,
    },
    {
      id: 'profile',
      label: 'Mon profil',
      hint: 'Mes points faibles et mes points forts',
      icon: <BarChart3 className={ICON} />,
      onSelect: onOpenProfile,
    },
    {
      id: 'plan',
      label: 'Mon plan',
      hint: 'Les objectifs de la semaine, tirés de mes parties',
      icon: <ClipboardList className={ICON} />,
      onSelect: onOpenPlan,
    },
    {
      id: 'training',
      label: "S'entraîner",
      hint: 'Rejouer mes erreurs, au bon rythme',
      icon: <Dumbbell className={ICON} />,
      onSelect: onOpenTraining,
    },
    {
      id: 'openings',
      label: 'Ouvertures',
      hint: 'Explorer les ouvertures et voir mon répertoire',
      icon: <BookOpen className={ICON} />,
      onSelect: onOpenOpenings,
    },
    {
      id: 'studies',
      label: 'Études',
      hint: 'Mes chapitres de coups commentés, à jouer contre l’ordinateur',
      icon: <GraduationCap className={ICON} />,
      onSelect: onOpenStudies,
    },
    {
      id: 'sound',
      label: 'Son des coups',
      icon: isMuted ? <VolumeX className={ICON} /> : <Volume2 className={ICON} />,
      checked: !isMuted,
      onSelect: onToggleSound,
      separated: true,
    },
    ...(onInstall
      ? [
          {
            id: 'install',
            label: "Installer l'application",
            hint: 'Elle fonctionne alors aussi hors ligne',
            icon: <Download className={ICON} />,
            onSelect: onInstall,
          },
        ]
      : []),
  ];

  return (
    <header className="border-b border-slate-800/80 bg-slate-900/90 backdrop-blur sticky top-0 z-40 px-3 sm:px-4 lg:px-8 py-2 sm:py-3 w-full max-w-full">
      {/* One row on every screen: on a phone the labels give way to icons and the views move to the bottom bar */}
      <div className="flex items-center justify-between gap-2 sm:gap-2.5 w-full">
        {/* Brand and match meta */}
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-600/30 font-bold shrink-0 text-sm sm:text-base">
            ♟
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-bold tracking-tight text-white flex items-center gap-1.5 truncate">
              <span>Échiquier IA</span>
              <span className="hidden sm:inline text-[10px] text-emerald-400 font-mono font-semibold px-1.5 py-0.2 rounded bg-emerald-500/10 border border-emerald-500/20 shrink-0">
                Stockfish 19
              </span>
            </h1>
            <p className="hidden sm:block text-[11px] text-slate-400 truncate max-w-xs sm:max-w-sm">
              {metadata?.white || 'Blancs'} vs {metadata?.black || 'Noirs'}{' '}
              {metadata?.result ? `(${metadata.result})` : ''}
            </p>
          </div>
        </div>

        {/* Actions and switchers */}
        <div className="flex items-center justify-end gap-1.5 sm:gap-2.5 shrink-0">
          {/* User Profile / Pseudo Quick Pill */}
          <div className="flex items-center gap-0.5 sm:gap-1 px-1 sm:px-2 py-0.5 sm:py-1 rounded-xl bg-slate-950/70 border border-slate-800 text-xs">
            <PseudoEditor pseudo={userPseudo} onChange={onUpdatePseudo} />
            <div className="h-3 w-px bg-slate-800 mx-0.5" />
            <button
              onClick={() => onUpdateUserColor(userColor === 'w' ? 'b' : 'w')}
              aria-label={`Votre perspective : ${userColor === 'w' ? 'Blancs' : 'Noirs'}. Passer aux ${
                userColor === 'w' ? 'Noirs' : 'Blancs'
              }`}
              className="px-1.5 py-1.5 sm:py-0.5 rounded-md bg-slate-900 hover:bg-slate-800 text-indigo-300 font-semibold text-xs sm:text-[11px] transition-all cursor-pointer"
              title="Basculer la couleur de votre perspective"
            >
              {userColor === 'w' ? '⚪' : '⚫'}
              <span className="hidden sm:inline">{userColor === 'w' ? ' Blancs' : ' Noirs'}</span>
            </button>
          </div>

          <AppMenu items={menuItems} />

          {hasAnalysis && (
            <>
              {/* Segmented Tab Controls (on a phone: the bottom navigation bar) */}
              <ViewTabs
                activeTab={activeTab}
                isAnalyzing={isAnalyzing}
                onChangeTab={onChangeTab}
                className="hidden sm:flex"
              />

              {/* Action Button: Import PGN */}
              <button
                onClick={onOpenPgnModal}
                aria-haspopup="dialog"
                aria-label="Charger un autre PGN"
                className="p-2 sm:px-2.5 sm:py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors cursor-pointer flex items-center"
                title="Charger un autre PGN"
              >
                <FileText className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-indigo-400" />
                <span className="hidden md:inline ml-1">Autre PGN</span>
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
};
