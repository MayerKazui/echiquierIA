import React from 'react';
import { FileText, Keyboard, LayoutDashboard, Swords, User, Volume2, VolumeX } from 'lucide-react';
import { GameMetadata } from '../../types/chess';
import { AppTab, PlayerColor } from '../../types/ui';

interface AppHeaderProps {
  metadata?: GameMetadata;
  hasAnalysis: boolean;
  activeTab: AppTab;
  userPseudo: string;
  userColor: PlayerColor;
  isMuted: boolean;
  onChangeTab: (tab: AppTab) => void;
  onUpdatePseudo: (pseudo: string) => void;
  onUpdateUserColor: (color: PlayerColor) => void;
  onToggleSound: () => void;
  onOpenPgnModal: () => void;
  onOpenHelp: () => void;
}

const tabClass = (isActive: boolean) =>
  `flex items-center gap-1 px-2 sm:px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
    isActive ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
  }`;

export const AppHeader: React.FC<AppHeaderProps> = ({
  metadata,
  hasAnalysis,
  activeTab,
  userPseudo,
  userColor,
  isMuted,
  onChangeTab,
  onUpdatePseudo,
  onUpdateUserColor,
  onToggleSound,
  onOpenPgnModal,
  onOpenHelp,
}) => (
  <header className="border-b border-slate-800/80 bg-slate-900/90 backdrop-blur sticky top-0 z-40 px-3 sm:px-4 lg:px-8 py-2.5 sm:py-3 w-full max-w-full">
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 w-full">
      {/* Top row on mobile / Left column on desktop: Brand and Match meta */}
      <div className="flex items-center justify-between gap-3 w-full sm:w-auto">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-600/30 font-bold shrink-0 text-sm sm:text-base">
            ♟
          </div>
          <div className="min-w-0">
            <h1 className="text-xs sm:text-sm font-bold tracking-tight text-white flex items-center gap-1.5 truncate">
              <span>Échiquier IA</span>
              <span className="text-[9px] sm:text-[10px] text-emerald-400 font-mono font-semibold px-1.5 py-0.2 rounded bg-emerald-500/10 border border-emerald-500/20 shrink-0">
                Stockfish 19
              </span>
            </h1>
            <p className="text-[10px] sm:text-[11px] text-slate-400 truncate max-w-[190px] xs:max-w-xs sm:max-w-sm">
              {metadata?.white || 'Blancs'} vs {metadata?.black || 'Noirs'}{' '}
              {metadata?.result ? `(${metadata.result})` : ''}
            </p>
          </div>
        </div>

        {/* Quick sound toggle on mobile */}
        <div className="flex items-center gap-1.5 sm:hidden shrink-0">
          <button
            onClick={onToggleSound}
            aria-label="Son des coups"
            aria-pressed={!isMuted}
            className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
              !isMuted
                ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500/30'
                : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}
            title={isMuted ? 'Activer le son' : 'Couper le son'}
          >
            {!isMuted ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Bottom row on mobile / Right column on desktop: Actions and Switchers */}
      <div className="flex items-center justify-between sm:justify-end gap-1.5 sm:gap-2.5 flex-wrap w-full sm:w-auto">
        {/* User Profile / Pseudo Quick Pill */}
        <div className="flex items-center gap-1 px-2 py-1 rounded-xl bg-slate-950/70 border border-slate-800 text-xs">
          <User className="w-3 h-3 text-indigo-400 shrink-0" />
          <button
            onClick={() => {
              const next = window.prompt('Entrez votre pseudo de joueur :', userPseudo);
              if (next !== null) onUpdatePseudo(next.trim());
            }}
            aria-label={`Pseudo du joueur : ${userPseudo || 'non renseigné'}. Modifier`}
            className="font-bold text-white hover:text-indigo-300 transition-colors cursor-pointer max-w-[70px] sm:max-w-[110px] truncate text-[11px]"
            title="Cliquer pour changer de pseudo"
          >
            {userPseudo || 'Pseudo'}
          </button>
          <div className="h-3 w-px bg-slate-800 mx-0.5" />
          <button
            onClick={() => onUpdateUserColor(userColor === 'w' ? 'b' : 'w')}
            aria-label={`Votre perspective : ${userColor === 'w' ? 'Blancs' : 'Noirs'}. Passer aux ${
              userColor === 'w' ? 'Noirs' : 'Blancs'
            }`}
            className="px-1.5 py-0.5 rounded-md bg-slate-900 hover:bg-slate-800 text-indigo-300 font-semibold text-[10px] sm:text-[11px] transition-all cursor-pointer"
            title="Basculer la couleur de votre perspective"
          >
            {userColor === 'w' ? '⚪ Blancs' : '⚫ Noirs'}
          </button>
        </div>

        <button
          type="button"
          onClick={onOpenHelp}
          aria-label="Raccourcis clavier"
          title="Raccourcis clavier (?)"
          className="p-1.5 sm:p-2 rounded-xl border bg-slate-800 text-slate-300 border-slate-700 hover:text-white transition-colors cursor-pointer"
        >
          <Keyboard className="w-3.5 h-3.5" />
        </button>

        {/* Sound Mute/Unmute Button (Desktop) */}
        <button
          onClick={onToggleSound}
          aria-label="Son des coups"
          aria-pressed={!isMuted}
          className={`hidden sm:flex p-2 rounded-xl border transition-colors cursor-pointer ${
            !isMuted
              ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500/30 hover:bg-indigo-600/30'
              : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
          }`}
          title={isMuted ? 'Activer le son des coups' : 'Couper le son des coups'}
        >
          {!isMuted ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
        </button>

        {hasAnalysis && (
          <>
            {/* Segmented Tab Controls */}
            <div
              role="group"
              aria-label="Vue"
              className="flex items-center gap-0.5 p-0.5 bg-slate-950 rounded-xl border border-slate-800"
            >
              <button
                onClick={() => onChangeTab('board')}
                aria-pressed={activeTab === 'board'}
                className={tabClass(activeTab === 'board')}
              >
                <Swords className="w-3 h-3 shrink-0" />
                <span>Échiquier</span>
              </button>
              <button
                onClick={() => onChangeTab('dashboard')}
                aria-pressed={activeTab === 'dashboard'}
                className={tabClass(activeTab === 'dashboard')}
              >
                <LayoutDashboard className="w-3 h-3 shrink-0" />
                <span>Bilan</span>
              </button>
            </div>

            {/* Action Button: Import PGN */}
            <div className="flex items-center gap-1">
              <button
                onClick={onOpenPgnModal}
                aria-haspopup="dialog"
                aria-label="Charger un autre PGN"
                className="p-1.5 sm:px-2.5 sm:py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors cursor-pointer"
                title="Charger un autre PGN"
              >
                <FileText className="w-3.5 h-3.5 text-indigo-400" />
                <span className="hidden md:inline ml-1">Autre PGN</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  </header>
);
