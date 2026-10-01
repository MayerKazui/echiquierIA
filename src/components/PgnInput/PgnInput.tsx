import React, { useEffect, useId, useRef, useState, useMemo } from 'react';
import { FileText, Upload, Play, Sliders, AlertCircle, User, BookOpen } from 'lucide-react';
import { Chess } from 'chess.js';
import { SAMPLE_GAMES, SampleGame } from '../../utils/sampleGames';
import { validatePgn, parsePgnHeaders } from '../../utils/pgnParser';
import { chooseOpening, ensureOpeningBookLoaded, identifyGameOpening } from '../../services/openingBook';
import { defaultWorkerCount } from '../../services/stockfishEngine';
import { ANALYSIS_LEVELS, DEFAULT_ANALYSIS_DEPTH } from '../../utils/analysisLevels';
import { oneOf, usePersistentState } from '../../hooks/usePersistentState';
import type { AnalysisProgress } from '../../hooks/useGameAnalysis';
import { AnalysisProgressBar } from '../AppHeader/AnalysisProgressBar';
import type { ImportedGame } from '../../services/gameImport';
import { OnlineGames, gameKey } from './OnlineGames';

/** `identifyGameOpening` reads at most 35 plies: no need to replay more. */
const MAX_OPENING_PLIES = 36;

interface PgnInputProps {
  currentPgn: string;
  userPseudo: string;
  onUpdatePseudo: (pseudo: string) => void;
  onAnalyze: (pgn: string, depth: number) => void;
  isAnalyzing: boolean;
  /** Positions evaluated so far, shown in place of the start button while the analysis runs. */
  progress?: AnalysisProgress | null;
  /** Stops the running analysis. */
  onCancel?: () => void;
  /** Analyses the latest games of the online list in the background, at the chosen depth. */
  onAnalyzeBatch?: (games: ImportedGame[], username: string, depth: number) => void;
  isBatchBusy?: boolean;
  /** Changes when games were added to the history by a background analysis. */
  analyzedRevision?: number;
  onClose?: () => void;
}

export const PgnInput: React.FC<PgnInputProps> = ({
  currentPgn,
  userPseudo,
  onUpdatePseudo,
  onAnalyze,
  isAnalyzing,
  progress = null,
  onCancel,
  onAnalyzeBatch,
  isBatchBusy = false,
  analyzedRevision,
  onClose,
}) => {
  const pgnFieldId = useId();
  const depthLabelId = useId();
  const [pgnText, setPgnText] = useState(currentPgn);
  // The chosen depth is remembered between sessions
  const [selectedDepth, setSelectedDepth] = usePersistentState<number>(
    'chess_analysis_depth',
    DEFAULT_ANALYSIS_DEPTH,
    oneOf(ANALYSIS_LEVELS.map((level) => level.depth))
  );
  const workerCount = defaultWorkerCount(typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : undefined);
  const [validationError, setValidationError] = useState<string | null>(null);
  /** The imported game whose PGN is in the field (it stays marked in the list while the PGN is not edited). */
  const [importedKey, setImportedKey] = useState<string | null>(null);
  const startButtonRef = useRef<HTMLButtonElement>(null);

  // Same lookup as the analysis (the whole game, the openings database first): one name everywhere.
  // The database is fetched when idle; the preview is recomputed once it is there.
  const [isBookReady, setIsBookReady] = useState(false);
  useEffect(() => {
    let isCurrent = true;
    void ensureOpeningBookLoaded().then(() => isCurrent && setIsBookReady(true));
    return () => {
      isCurrent = false;
    };
  }, []);

  const detectedOpening = useMemo(() => {
    if (!pgnText.trim()) return null;
    const headers = parsePgnHeaders(pgnText);
    try {
      const chess = new Chess();
      chess.loadPgn(pgnText);
      const replay = new Chess();
      const fens: string[] = [];
      for (const move of chess.history().slice(0, MAX_OPENING_PLIES)) {
        replay.move(move);
        fens.push(replay.fen());
      }
      return chooseOpening(identifyGameOpening(fens), headers);
    } catch {
      return chooseOpening(null, headers);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recomputed when the database arrives
  }, [pgnText, isBookReady]);

  const handleSelectSample = (sample: SampleGame) => {
    setPgnText(sample.pgn);
    setImportedKey(null);
    setValidationError(null);
  };

  const handleSelectImported = (game: ImportedGame, username: string) => {
    setPgnText(game.pgn);
    setImportedKey(gameKey(game));
    setValidationError(null);
    // The board is oriented, and the advice written, for the pseudo the games were searched with
    const players = [game.white, game.black].map((name) => name.toLowerCase());
    if (!userPseudo || !players.some((name) => name.includes(userPseudo.toLowerCase()))) onUpdatePseudo(username);
    // The start button can be far below the list on a phone
    startButtonRef.current?.scrollIntoView?.({ block: 'nearest' });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setPgnText(content);
        setImportedKey(null);
        setValidationError(null);
      }
    };
    reader.readAsText(file);
  };

  const handleStartAnalysis = () => {
    if (!pgnText.trim()) {
      setValidationError('Veuillez coller un PGN ou choisir un exemple ci-dessous.');
      return;
    }

    const val = validatePgn(pgnText);
    if (!val.valid) {
      setValidationError(val.error || 'PGN invalide.');
      return;
    }

    setValidationError(null);
    onAnalyze(pgnText, selectedDepth);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-2xl flex flex-col gap-4 sm:gap-6 max-w-2xl w-full mx-auto max-h-[90vh] overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
        <div>
          <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-400" />
            Importer et Analyser une Partie (PGN)
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Importez vos parties de chess.com ou Lichess, collez un PGN (FFE…) ou sélectionnez un exemple ci-dessous.
          </p>
        </div>

        {onClose && (
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 text-sm font-semibold px-2 py-1 rounded"
          >
            Fermer
          </button>
        )}
      </div>

      {/* Nothing can be edited while the analysis runs: the form shows its progress instead */}
      <fieldset disabled={isAnalyzing} className="contents">
        <OnlineGames
          userPseudo={userPseudo}
          selectedKey={importedKey}
          onSelect={handleSelectImported}
          onAnalyzeBatch={onAnalyzeBatch && ((games, username) => onAnalyzeBatch(games, username, selectedDepth))}
          isBatchBusy={isBatchBusy}
          analyzedRevision={analyzedRevision}
        />

        {/* Preset Sample Games */}
        <div>
          <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-400 block mb-2">
            Exemples de parties prêts à l'analyse :
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {SAMPLE_GAMES.map((sample) => (
              <button
                key={sample.id}
                type="button"
                onClick={() => handleSelectSample(sample)}
                className="p-3 bg-slate-950/60 hover:bg-slate-800/80 border border-slate-800 rounded-xl text-left transition-all flex flex-col gap-1 group"
              >
                <div className="flex items-center justify-between text-xs font-semibold text-slate-200 group-hover:text-indigo-300">
                  <span>{sample.name}</span>
                  <span className="text-[10px] text-slate-400 font-normal">
                    {sample.category === 'club' ? 'Club' : 'Maître'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 line-clamp-2">{sample.description}</p>
              </button>
            ))}
          </div>
        </div>

        {/* PGN Textarea */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <label htmlFor={pgnFieldId} className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">
                Contenu PGN
              </label>
              {detectedOpening && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-950/60 border border-indigo-700/50 text-[10px] text-indigo-300 font-medium">
                  <BookOpen className="w-3 h-3 text-indigo-400 shrink-0" />
                  <span>
                    {detectedOpening.eco ? `[${detectedOpening.eco}] ` : ''}
                    {detectedOpening.name}
                  </span>
                </span>
              )}
            </div>

            <label className="cursor-pointer inline-flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 font-medium rounded focus-within:ring-2 focus-within:ring-indigo-400">
              <Upload className="w-3.5 h-3.5" />
              <span>Charger un fichier .pgn</span>
              <input type="file" accept=".pgn,.txt" onChange={handleFileUpload} className="sr-only peer" />
            </label>
          </div>

          <textarea
            id={pgnFieldId}
            rows={5}
            value={pgnText}
            onChange={(e) => {
              setPgnText(e.target.value);
              setImportedKey(null);
              if (validationError) setValidationError(null);
            }}
            placeholder='[Event "Tournoi"]&#10;1. e4 e5 2. Nf3 Nc6...'
            className="w-full font-mono text-xs bg-slate-950 border border-slate-700/80 rounded-xl p-3 text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />

          {validationError && (
            <div
              role="alert"
              className="flex items-center gap-2 p-2.5 bg-rose-950/30 border border-rose-900/50 rounded-lg text-rose-300 text-xs"
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{validationError}</span>
            </div>
          )}
        </div>

        {/* User Player Pseudo (Persistent) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-950/70 p-3.5 rounded-xl border border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
              <User className="w-4 h-4 text-indigo-400" />
            </div>
            <div>
              <span className="text-xs font-semibold text-slate-200 block">Mon pseudo de joueur (optionnel)</span>
              <span className="text-[10px] text-slate-400">
                Oriente l'échiquier et personnalise les conseils de votre point de vue
              </span>
            </div>
          </div>

          <input
            type="text"
            aria-label="Mon pseudo de joueur"
            value={userPseudo}
            onChange={(e) => onUpdatePseudo(e.target.value)}
            placeholder="ex: b.defrene, Magnus..."
            className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 w-full sm:w-48"
          />
        </div>

        {/* Stockfish Depth Controls - Perfectly aligned responsive grid */}
        <div className="flex flex-col gap-2.5 bg-slate-950/70 p-3.5 rounded-xl border border-slate-800">
          <div className="flex items-center justify-between flex-wrap gap-1">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-indigo-400 shrink-0" />
              <span id={depthLabelId} className="text-xs font-semibold text-slate-200">
                Profondeur de calcul Stockfish 19
              </span>
            </div>
            <span className="text-[11px] text-indigo-300 font-medium">
              Sélectionné : <strong className="text-white">Profondeur {selectedDepth}</strong>
            </span>
          </div>

          <div
            role="radiogroup"
            aria-labelledby={depthLabelId}
            className="grid grid-cols-2 sm:grid-cols-3 gap-2 w-full"
          >
            {ANALYSIS_LEVELS.map((item) => {
              const isSelected = selectedDepth === item.depth;
              return (
                <label key={item.depth} className="cursor-pointer">
                  <input
                    type="radio"
                    name="analysis-depth"
                    value={item.depth}
                    checked={isSelected}
                    onChange={() => setSelectedDepth(item.depth)}
                    className="sr-only peer"
                  />
                  <div
                    className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-center transition-all peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-400 ${
                      isSelected
                        ? 'bg-indigo-600/30 border-indigo-500 text-white shadow-sm ring-1 ring-indigo-500/50'
                        : 'bg-slate-900/90 border-slate-800 text-slate-300 hover:bg-slate-800/80 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold text-xs">
                      <span aria-hidden="true">{item.icon}</span>
                      <span>{item.label}</span>
                    </div>
                    <div className="flex items-center gap-1 text-[11px] mt-0.5 text-slate-400">
                      <span className="font-mono text-slate-300 font-semibold">d = {item.depth}</span>
                      <span aria-hidden="true">•</span>
                      <span>{item.time}</span>
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
          <p className="text-[10px] text-slate-400">
            Durées indicatives pour une partie d'environ 40 coups sur 4 cœurs. Le calcul s'exécute sur {workerCount}{' '}
            processus en parallèle.
          </p>
        </div>
      </fieldset>

      {/* Action Buttons */}
      {isAnalyzing ? (
        <div
          role="group"
          aria-label="Analyse en cours"
          className="flex flex-col sm:flex-row sm:items-center gap-3 pt-2"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-3 text-xs text-indigo-200 font-medium mb-1.5">
              <span className="flex items-center gap-2">
                <span
                  className="w-3.5 h-3.5 border-2 border-indigo-400/40 border-t-indigo-400 rounded-full animate-spin"
                  aria-hidden="true"
                />
                Analyse Stockfish en cours…
              </span>
              <span className="font-mono">
                {Math.round(Math.min(1, (progress?.current ?? 0) / Math.max(1, progress?.total ?? 1)) * 100)} %
              </span>
            </div>
            <AnalysisProgressBar progress={progress ?? { current: 0, total: 1 }} />
            <p className="text-[11px] text-slate-400 mt-1.5">
              {progress ? `${progress.current} / ${progress.total} positions évaluées. ` : ''}Les premiers coups
              s'affichent dès qu'ils sont prêts.
            </p>
          </div>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-100 text-sm font-semibold transition-all cursor-pointer"
            >
              Annuler l'analyse
            </button>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            ref={startButtonRef}
            type="button"
            onClick={handleStartAnalysis}
            className="scroll-mb-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold shadow-lg shadow-indigo-600/30 transition-all cursor-pointer"
          >
            <Play className="w-4 h-4" />
            <span>Lancer l'Analyse Complète</span>
          </button>
        </div>
      )}
    </div>
  );
};
