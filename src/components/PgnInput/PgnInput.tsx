import React, { useState, useMemo } from 'react';
import {
  FileText,
  Upload,
  Play,
  RotateCcw,
  Sparkles,
  Sliders,
  Check,
  AlertCircle,
  User,
  BookOpen,
} from 'lucide-react';
import { Chess } from 'chess.js';
import { SAMPLE_GAMES, SampleGame } from '../../utils/sampleGames';
import { validatePgn, parsePgnHeaders } from '../../utils/pgnParser';
import { identifyGameOpening } from '../../services/openingBook';

interface PgnInputProps {
  currentPgn: string;
  userPseudo: string;
  onUpdatePseudo: (pseudo: string) => void;
  onAnalyze: (pgn: string, depth: number) => void;
  isAnalyzing: boolean;
  onClose?: () => void;
}

export const PgnInput: React.FC<PgnInputProps> = ({
  currentPgn,
  userPseudo,
  onUpdatePseudo,
  onAnalyze,
  isAnalyzing,
  onClose,
}) => {
  const [pgnText, setPgnText] = useState(currentPgn);
  const [selectedDepth, setSelectedDepth] = useState<number>(12);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Real-time preview of detected opening from PGN text
  const detectedOpening = useMemo(() => {
    if (!pgnText.trim()) return null;
    try {
      const headers = parsePgnHeaders(pgnText);
      if (headers.opening) {
        return { name: headers.opening, eco: headers.eco };
      }
      const chess = new Chess();
      chess.loadPgn(pgnText);
      const history = chess.history();
      if (history.length > 0) {
        const fens: string[] = [];
        const replay = new Chess();
        for (const m of history.slice(0, 25)) {
          replay.move(m);
          fens.push(replay.fen());
        }
        return identifyGameOpening(fens);
      }
    } catch {
      return null;
    }
    return null;
  }, [pgnText]);

  const handleSelectSample = (sample: SampleGame) => {
    setPgnText(sample.pgn);
    setValidationError(null);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setPgnText(content);
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
    onClose?.();
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
            Collez le PGN de votre partie (Chess.com, Lichess, FFE) ou sélectionnez un exemple ci-dessous.
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
                <span className="text-[10px] text-slate-500 font-normal">
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
            <label className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">
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

          <label className="cursor-pointer inline-flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 font-medium">
            <Upload className="w-3.5 h-3.5" />
            <span>Charger un fichier .pgn</span>
            <input
              type="file"
              accept=".pgn,.txt"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>
        </div>

        <textarea
          rows={5}
          value={pgnText}
          onChange={(e) => {
            setPgnText(e.target.value);
            if (validationError) setValidationError(null);
          }}
          placeholder="[Event &quot;Tournoi&quot;]&#10;1. e4 e5 2. Nf3 Nc6..."
          className="w-full font-mono text-xs bg-slate-950 border border-slate-700/80 rounded-xl p-3 text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />

        {validationError && (
          <div className="flex items-center gap-2 p-2.5 bg-rose-950/30 border border-rose-900/50 rounded-lg text-rose-300 text-xs">
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
            <span className="text-xs font-semibold text-slate-200 block">
              Mon pseudo de joueur (optionnel)
            </span>
            <span className="text-[10px] text-slate-400">
              Oriente l'échiquier et personnalise les conseils de votre point de vue
            </span>
          </div>
        </div>

        <input
          type="text"
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
            <span className="text-xs font-semibold text-slate-200">
              Profondeur de calcul Stockfish
            </span>
          </div>
          <span className="text-[11px] text-indigo-300 font-medium">
            Sélectionné : <strong className="text-white">Profondeur {selectedDepth}</strong>
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full">
          {[
            { depth: 8, label: 'Éclair', d: 'd = 8', time: '~2-3s', icon: '⚡' },
            { depth: 10, label: 'Rapide', d: 'd = 10', time: '~5s', icon: '⏱️' },
            { depth: 12, label: 'Standard', d: 'd = 12', time: '~15s', icon: '🎯' },
            { depth: 14, label: 'Poussé', d: 'd = 14', time: '~35s', icon: '🧠' },
          ].map((item) => {
            const isSelected = selectedDepth === item.depth;
            return (
              <button
                key={item.depth}
                type="button"
                onClick={() => setSelectedDepth(item.depth)}
                className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-indigo-600/30 border-indigo-500 text-white shadow-sm ring-1 ring-indigo-500/50'
                    : 'bg-slate-900/90 border-slate-800 text-slate-300 hover:bg-slate-800/80 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold text-xs">
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </div>
                <div className="flex items-center gap-1 text-[11px] mt-0.5 text-slate-400">
                  <span className="font-mono text-slate-300 font-semibold">{item.d}</span>
                  <span>•</span>
                  <span>{item.time}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={handleStartAnalysis}
          disabled={isAnalyzing}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-semibold shadow-lg shadow-indigo-600/30 transition-all cursor-pointer"
        >
          {isAnalyzing ? (
            <>
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>Analyse Stockfish en cours...</span>
            </>
          ) : (
            <>
              <Play className="w-4 h-4" />
              <span>Lancer l'Analyse Complète</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
