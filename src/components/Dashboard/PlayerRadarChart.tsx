import React, { useState, useMemo } from 'react';
import { Shield, Swords, BookOpen, Crown, Clock, Sparkles, TrendingUp, AlertCircle } from 'lucide-react';
import { MoveAnalysis, PlayerStats, GameMetadata } from '../../types/chess';
import { PhaseStats } from '../../utils/phaseStats';

export interface SkillDimension {
  id: string;
  name: string;
  shortName: string;
  icon: React.ReactNode;
  score: number; // 0 to 100
  description: string;
  detail: string;
}

export interface PlayerProfileData {
  playerName: string;
  color: 'w' | 'b';
  archetype: {
    title: string;
    description: string;
    badgeColor: string;
  };
  dimensions: SkillDimension[];
  strongest: SkillDimension;
  weakest: SkillDimension;
  averageScore: number;
}

interface PlayerRadarChartProps {
  moves: MoveAnalysis[];
  statsWhite: PlayerStats;
  statsBlack: PlayerStats;
  metadata: GameMetadata;
  userColor?: 'w' | 'b';
  userPseudo?: string;
  phaseStats: PhaseStats;
}

// Geometry configuration for 5-axis spider chart
const cx = 150;
const cy = 145;
const R = 95;
const numAxes = 5;

// Compute (x, y) for an axis index and a normalized value (0 to 1)
const getCoordinates = (index: number, valueRatio: number) => {
  const angle = -Math.PI / 2 + (index * 2 * Math.PI) / numAxes;
  return {
    x: cx + R * valueRatio * Math.cos(angle),
    y: cy + R * valueRatio * Math.sin(angle),
  };
};

// Build SVG polygon points path string
const buildPolygonPoints = (profile: PlayerProfileData) => {
  return profile.dimensions
    .map((d, i) => {
      const { x, y } = getCoordinates(i, Math.max(0.15, d.score / 100));
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
};

export const PlayerRadarChart: React.FC<PlayerRadarChartProps> = ({
  moves,
  statsWhite,
  statsBlack,
  metadata,
  userColor = 'w',
  phaseStats,
}) => {
  const [activeView, setActiveView] = useState<'user' | 'white' | 'black' | 'both'>('user');

  // Compute profile metrics for a specific color
  const computeProfile = useMemo(() => {
    return (color: 'w' | 'b', name: string): PlayerProfileData => {
      const stats = color === 'w' ? statsWhite : statsBlack;
      const colorMoves = moves.filter((m) => m.color === color);
      const totalMoves = Math.max(1, colorMoves.length);

      // 1. 🛡️ Solidité & Défense (Protection des pièces, absence de gaffes & erreurs)
      const blunderPenalty = (stats.blunders + stats.missedWins) * 16;
      const mistakePenalty = stats.mistakes * 7;
      const inaccuracyPenalty = stats.inaccuracies * 2;
      const soliditeScore = Math.max(
        15,
        Math.min(100, Math.round(100 - (blunderPenalty + mistakePenalty + inaccuracyPenalty) / (totalMoves / 15)))
      );

      // 2. ⚔️ Sens Tactique (Détection des meilleurs coups, brillants et conversion)
      const bestRatio = (stats.best + stats.brilliant) / totalMoves;
      const tactiqueScore = Math.max(
        20,
        Math.min(100, Math.round(30 + bestRatio * 110 + (stats.brilliant > 0 ? 10 : 0)))
      );

      // 3. 📚 Préparation d'Ouverture (Précision et régularité en ouverture)
      const openingAcc = color === 'w' ? phaseStats.opening.whiteAccuracy : phaseStats.opening.blackAccuracy;
      const openingFails =
        color === 'w'
          ? phaseStats.opening.whiteBlunders * 25 + phaseStats.opening.whiteMistakes * 12
          : phaseStats.opening.blackBlunders * 25 + phaseStats.opening.blackMistakes * 12;
      const ouvertureScore =
        openingAcc !== null
          ? Math.max(
              20,
              Math.min(100, Math.round(openingAcc - openingFails / Math.max(1, phaseStats.opening.totalMoves / 2)))
            )
          : Math.round(stats.accuracy);

      // 4. 👑 Technique en Finale (Précision en finale ou conversion de gain)
      const endgameAcc = color === 'w' ? phaseStats.endgame.whiteAccuracy : phaseStats.endgame.blackAccuracy;
      let finaleScore: number;
      if (endgameAcc !== null) {
        finaleScore = Math.max(20, Math.min(100, Math.round(endgameAcc)));
      } else {
        // If game concluded before move 31, extrapolate from middlegame or overall accuracy
        const midAcc =
          (color === 'w' ? phaseStats.middlegame.whiteAccuracy : phaseStats.middlegame.blackAccuracy) || stats.accuracy;
        finaleScore = Math.max(25, Math.min(95, Math.round(midAcc * 0.95)));
      }

      // 5. ⏱️ Discipline Temporelle (Gestion du temps, absence de coups précipités < 3s qui gaffent)
      const rushedCount = stats.rushedMovesCount || 0;
      const timeScore = Math.max(
        25,
        Math.min(
          100,
          Math.round(100 - rushedCount * 18 - (stats.avgThinkTimeSeconds && stats.avgThinkTimeSeconds < 2 ? 25 : 0))
        )
      );

      const dimensions: SkillDimension[] = [
        {
          id: 'solidite',
          name: 'Solidité & Défense',
          shortName: 'Solidité',
          icon: <Shield className="w-3.5 h-3.5 text-blue-400" />,
          score: soliditeScore,
          description: 'Protection du roi, sécurité des pièces et vigilance tactique',
          detail: `${stats.blunders} gaffe(s) et ${stats.mistakes} erreur(s) concédée(s)`,
        },
        {
          id: 'tactique',
          name: 'Sens Tactique',
          shortName: 'Tactique',
          icon: <Swords className="w-3.5 h-3.5 text-rose-400" />,
          score: tactiqueScore,
          description: 'Détection des opportunités tranchantes et des meilleurs coups',
          detail: `${stats.best + stats.brilliant} coup(s) optimaux trouvés (${Math.round(bestRatio * 100)}%)`,
        },
        {
          id: 'ouverture',
          name: 'Maîtrise Ouverture',
          shortName: 'Ouverture',
          icon: <BookOpen className="w-3.5 h-3.5 text-indigo-400" />,
          score: ouvertureScore,
          description: 'Contrôle du centre, développement fluide et mise en sécurité du roi',
          detail: `Précision de ${openingAcc ?? stats.accuracy}% sur les 12 premiers coups`,
        },
        {
          id: 'finale',
          name: 'Technique Finale',
          shortName: 'Finale',
          icon: <Crown className="w-3.5 h-3.5 text-amber-400" />,
          score: finaleScore,
          description: 'Précision dans les fins de parties et conversion technique',
          detail: endgameAcc !== null ? `Précision de ${endgameAcc}% en finale` : 'Calculé sur la phase décisive',
        },
        {
          id: 'temps',
          name: 'Discipline Temporelle',
          shortName: 'Gestion Temps',
          icon: <Clock className="w-3.5 h-3.5 text-emerald-400" />,
          score: timeScore,
          description: 'Rythme de réflexion régulier sans précipitation sous 3s',
          detail: rushedCount > 0 ? `${rushedCount} coup(s) joué(s) trop vite` : 'Excellente maîtrise du chronomètre',
        },
      ];

      // Identify strongest & weakest
      const sorted = [...dimensions].sort((a, b) => b.score - a.score);
      const strongest = sorted[0];
      const weakest = sorted[sorted.length - 1];
      const avg = Math.round(dimensions.reduce((acc, d) => acc + d.score, 0) / dimensions.length);

      // Determine Archetype
      let archetypeTitle = 'Joueur Équilibré';
      let archetypeDesc = 'Style universel avec des performances homogènes sur l’ensemble des phases.';
      let archetypeBadge = 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40';

      if (tactiqueScore >= 80 && soliditeScore < 70) {
        archetypeTitle = 'Attaquant Romantique / Tacticien Agressif';
        archetypeDesc = 'Vous excellez dans les attaques tranchantes mais devez veiller à ne pas négliger la sécurité.';
        archetypeBadge = 'bg-rose-500/20 text-rose-300 border-rose-500/40';
      } else if (soliditeScore >= 85 && tactiqueScore >= 80) {
        archetypeTitle = 'Grand Maître Posé / Universel';
        archetypeDesc = 'Grande rigueur stratégique combinée à un sens tactique aiguisé.';
        archetypeBadge = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
      } else if (soliditeScore >= 80 && finaleScore >= 75) {
        archetypeTitle = 'Stratège Positionnel / Défenseur d’Acier';
        archetypeDesc = 'Patient, solide et redoutable pour faire basculer la partie sur le long terme.';
        archetypeBadge = 'bg-blue-500/20 text-blue-300 border-blue-500/40';
      } else if (ouvertureScore >= 85 && soliditeScore < 70) {
        archetypeTitle = 'Théoricien d’Ouverture';
        archetypeDesc = 'Très solide au démarrage, mais baisse de garde possible en milieu de jeu complexe.';
        archetypeBadge = 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      } else if (timeScore < 60) {
        archetypeTitle = 'Joueur Intuitif / Rapide';
        archetypeDesc = 'Vous jouez souvent d’instinct ; ralentir sur les coups charnières vous fera gagner 200 Elo.';
        archetypeBadge = 'bg-purple-500/20 text-purple-300 border-purple-500/40';
      }

      return {
        playerName: name,
        color,
        archetype: {
          title: archetypeTitle,
          description: archetypeDesc,
          badgeColor: archetypeBadge,
        },
        dimensions,
        strongest,
        weakest,
        averageScore: avg,
      };
    };
  }, [moves, statsWhite, statsBlack, phaseStats]);

  const whiteProfile = useMemo(() => computeProfile('w', metadata.white || 'Blancs'), [computeProfile, metadata.white]);
  const blackProfile = useMemo(() => computeProfile('b', metadata.black || 'Noirs'), [computeProfile, metadata.black]);

  const activeProfile =
    activeView === 'user'
      ? userColor === 'w'
        ? whiteProfile
        : blackProfile
      : activeView === 'white'
        ? whiteProfile
        : blackProfile;

  const whitePolygon = useMemo(() => buildPolygonPoints(whiteProfile), [whiteProfile]);
  const blackPolygon = useMemo(() => buildPolygonPoints(blackProfile), [blackProfile]);
  const activePolygon = useMemo(() => buildPolygonPoints(activeProfile), [activeProfile]);

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl flex flex-col gap-5">
      {/* Header and Perspective Toggles */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
        <div>
          <span className="text-[10px] uppercase font-bold tracking-wider text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-full inline-block mb-1">
            Diagnostic Avancé
          </span>
          <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-400" />
            <span>Radar du Profil & Forces / Faiblesses</span>
          </h3>
          <p className="text-xs text-slate-400">Évaluation holistique sur 5 piliers fondamentaux du jeu d'échecs.</p>
        </div>

        {/* View Perspective Selector */}
        <div
          role="group"
          aria-label="Profil affiché"
          className="flex items-center rounded-xl bg-slate-950 p-1 border border-slate-800 text-xs"
        >
          <button
            onClick={() => setActiveView('user')}
            aria-pressed={activeView === 'user'}
            className={`px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer ${
              activeView === 'user'
                ? 'bg-indigo-600 text-white font-bold shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Mon Profil ({userColor === 'w' ? '⚪' : '⚫'})
          </button>
          <button
            onClick={() => setActiveView('white')}
            aria-pressed={activeView === 'white'}
            className={`px-2 py-1 rounded-lg font-medium transition-all cursor-pointer ${
              activeView === 'white'
                ? 'bg-indigo-600 text-white font-bold shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            ⚪ Blancs
          </button>
          <button
            onClick={() => setActiveView('black')}
            aria-pressed={activeView === 'black'}
            className={`px-2 py-1 rounded-lg font-medium transition-all cursor-pointer ${
              activeView === 'black'
                ? 'bg-indigo-600 text-white font-bold shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            ⚫ Noirs
          </button>
          <button
            onClick={() => setActiveView('both')}
            aria-pressed={activeView === 'both'}
            className={`px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer ${
              activeView === 'both'
                ? 'bg-gradient-to-r from-blue-600 to-rose-600 text-white font-bold shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Superposer les profils des deux joueurs"
          >
            ⚔️ Les 2
          </button>
        </div>
      </div>

      {/* Main Grid: Radar Chart Visual (Left) + Archetype & Detailed Breakdown (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        {/* Left Column: SVG Radar Chart */}
        <div className="lg:col-span-5 flex flex-col items-center justify-center p-2 sm:p-4 bg-slate-950/60 rounded-2xl border border-slate-800/80 relative">
          {/* Comparative Legend if "both" is active */}
          {activeView === 'both' && (
            <div className="flex items-center gap-4 text-xs font-semibold mb-2">
              <span className="flex items-center gap-1.5 text-blue-300">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-sm" />
                <span>Blancs ({whiteProfile.averageScore}/100)</span>
              </span>
              <span className="flex items-center gap-1.5 text-rose-300">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-sm" />
                <span>Noirs ({blackProfile.averageScore}/100)</span>
              </span>
            </div>
          )}

          <div className="relative w-full max-w-[320px] aspect-square flex items-center justify-center">
            <svg
              role="img"
              aria-label={`Radar des cinq compétences de ${activeProfile.playerName} : ${activeProfile.dimensions
                .map((dim) => `${dim.name} ${dim.score} sur 100`)
                .join(', ')}`}
              viewBox="0 0 300 290"
              className="w-full h-full select-none overflow-visible"
            >
              <defs>
                <radialGradient id="radarBgGradient" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.12" />
                  <stop offset="100%" stopColor="#0f172a" stopOpacity="0.0" />
                </radialGradient>
                <linearGradient id="userGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity="0.55" />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.25" />
                </linearGradient>
                <linearGradient id="whiteGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.5" />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.2" />
                </linearGradient>
                <linearGradient id="blackGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.5" />
                  <stop offset="100%" stopColor="#e11d48" stopOpacity="0.2" />
                </linearGradient>
              </defs>

              {/* Concentric Pentagon Background Grids (20%, 40%, 60%, 80%, 100%) */}
              {[0.2, 0.4, 0.6, 0.8, 1.0].map((level) => {
                const ringPoints = Array.from({ length: numAxes })
                  .map((_, idx) => {
                    const { x, y } = getCoordinates(idx, level);
                    return `${x.toFixed(1)},${y.toFixed(1)}`;
                  })
                  .join(' ');
                return (
                  <polygon
                    key={level}
                    points={ringPoints}
                    fill={level === 1.0 ? 'url(#radarBgGradient)' : 'none'}
                    stroke="#334155"
                    strokeWidth={level === 1.0 ? '1.5' : '1'}
                    strokeDasharray={level === 1.0 ? undefined : '2,2'}
                    className="opacity-70"
                  />
                );
              })}

              {/* Axes Spoke Lines radiating from center to vertices */}
              {Array.from({ length: numAxes }).map((_, idx) => {
                const { x, y } = getCoordinates(idx, 1.0);
                return (
                  <line
                    key={idx}
                    x1={cx}
                    y1={cy}
                    x2={x}
                    y2={y}
                    stroke="#475569"
                    strokeWidth="1"
                    strokeDasharray="2,2"
                    className="opacity-60"
                  />
                );
              })}

              {/* Render Polygons */}
              {activeView === 'both' ? (
                <>
                  {/* White Polygon */}
                  <polygon
                    points={whitePolygon}
                    fill="url(#whiteGrad)"
                    stroke="#60a5fa"
                    strokeWidth="2.5"
                    className="transition-all duration-300 drop-shadow-[0_0_8px_rgba(96,165,250,0.3)]"
                  />
                  {/* Black Polygon */}
                  <polygon
                    points={blackPolygon}
                    fill="url(#blackGrad)"
                    stroke="#f43f5e"
                    strokeWidth="2.5"
                    className="transition-all duration-300 drop-shadow-[0_0_8px_rgba(244,63,94,0.3)]"
                  />
                </>
              ) : (
                <>
                  <polygon
                    points={activePolygon}
                    fill="url(#userGrad)"
                    stroke="#818cf8"
                    strokeWidth="2.5"
                    className="transition-all duration-300 drop-shadow-[0_0_12px_rgba(99,102,241,0.4)]"
                  />
                  {/* Glowing Vertex Dots for single profile */}
                  {activeProfile.dimensions.map((dim, i) => {
                    const { x, y } = getCoordinates(i, Math.max(0.15, dim.score / 100));
                    return (
                      <g key={dim.id}>
                        <circle cx={x} cy={y} r="4" fill="#a5b4fc" stroke="#1e1b4b" strokeWidth="2" />
                      </g>
                    );
                  })}
                </>
              )}

              {/* Outer Dimension Labels with Emojis and Values */}
              {activeProfile.dimensions.map((dim, idx) => {
                const { x, y } = getCoordinates(idx, 1.25);
                const score =
                  activeView === 'both'
                    ? `B:${whiteProfile.dimensions[idx].score} N:${blackProfile.dimensions[idx].score}`
                    : `${dim.score}/100`;

                return (
                  <text
                    key={dim.id}
                    x={x}
                    y={y}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="text-[10px] font-bold font-mono fill-slate-200"
                  >
                    <tspan x={x} dy="-0.3em" className="fill-slate-300 font-sans font-semibold text-[10px]">
                      {dim.shortName}
                    </tspan>
                    <tspan x={x} dy="1.15em" className="fill-indigo-300 font-mono font-black text-[11px]">
                      {score}
                    </tspan>
                  </text>
                );
              })}
            </svg>
          </div>

          <div className="mt-2 text-center text-[11px] text-slate-400">
            Note globale :{' '}
            <strong className="text-white font-mono font-bold text-sm">
              {activeView === 'both'
                ? `⚪ ${whiteProfile.averageScore} / ⚫ ${blackProfile.averageScore}`
                : `${activeProfile.averageScore} / 100`}
            </strong>
          </div>
        </div>

        {/* Right Column: Archetype, Diagnostic & Dimensional Progress Bars */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          {/* Style Archetype Banner */}
          <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 shadow-sm flex flex-col gap-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-xs text-slate-400 font-medium">Style de jeu identifié :</span>
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${activeProfile.archetype.badgeColor}`}
              >
                {activeProfile.archetype.title}
              </span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">{activeProfile.archetype.description}</p>
          </div>

          {/* Key Insights: Point Fort & Axe de Travail */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            {/* Strongest Dimension */}
            <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/30 flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5 text-emerald-400 font-bold">
                <TrendingUp className="w-3.5 h-3.5 shrink-0" />
                <span>Point Fort Principal</span>
              </div>
              <div className="text-white font-bold flex items-center justify-between">
                <span>{activeProfile.strongest.name}</span>
                <span className="font-mono text-emerald-300 font-black">{activeProfile.strongest.score}/100</span>
              </div>
              <p className="text-[11px] text-slate-300">{activeProfile.strongest.detail}</p>
            </div>

            {/* Weakest Dimension */}
            <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-500/30 flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5 text-amber-400 font-bold">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>Axe d’Entraînement</span>
              </div>
              <div className="text-white font-bold flex items-center justify-between">
                <span>{activeProfile.weakest.name}</span>
                <span className="font-mono text-amber-300 font-black">{activeProfile.weakest.score}/100</span>
              </div>
              <p className="text-[11px] text-slate-300">{activeProfile.weakest.detail}</p>
            </div>
          </div>

          {/* 5 Dimensional Progress Bars */}
          <div className="space-y-2.5 pt-1">
            {activeProfile.dimensions.map((dim) => (
              <div key={dim.id} className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 font-medium text-slate-200">
                    {dim.icon}
                    <span>{dim.name}</span>
                  </div>
                  <span className="font-mono font-bold text-slate-100 text-[11px]">
                    {dim.score} <span className="text-slate-400 font-normal">/ 100</span>
                  </span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden border border-slate-700/60">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      dim.score >= 80
                        ? 'bg-emerald-400'
                        : dim.score >= 65
                          ? 'bg-indigo-400'
                          : dim.score >= 45
                            ? 'bg-amber-400'
                            : 'bg-rose-500'
                    }`}
                    style={{ width: `${dim.score}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
