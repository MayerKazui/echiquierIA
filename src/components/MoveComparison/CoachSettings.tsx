import React, { useId } from 'react';
import { COACH_DEPTHS, COACH_DEPTH_LABELS, type CoachDepth } from '../../services/deepMoveAnalysis';
import { LOCAL_MODELS, resolveLocalModel } from '../../services/localLlm.protocol';
import { CachedModels } from './CachedModels';

interface CoachSettingsProps {
  depth: CoachDepth;
  onDepthChange: (depth: CoachDepth) => void;
  useModel: boolean;
  onUseModelChange: (value: boolean) => void;
  modelId: string;
  onModelIdChange: (id: string) => void;
  modelSupported: boolean;
  /** Changes when a download ends, so that the list of downloaded models is read again. */
  refreshKey?: unknown;
}

/** The choices of the coach: how deep the engine looks, and whether (and which) local language model writes the sentences. */
export const CoachSettings: React.FC<CoachSettingsProps> = ({
  depth,
  onDepthChange,
  useModel,
  onUseModelChange,
  modelId,
  onModelIdChange,
  modelSupported,
  refreshKey,
}) => {
  const ids = useId();
  const model = resolveLocalModel(modelId);
  // A model set by hand is not in the catalogue: it still has to be shown as the one selected
  const isCustom = !LOCAL_MODELS.some((preset) => preset.id === model.id);
  return (
    <details className="text-xs text-slate-300 group">
      <summary className="cursor-pointer select-none text-slate-400 hover:text-slate-200">
        Réglages de l’entraîneur
      </summary>
      <div className="mt-2 flex flex-col gap-3 p-3 rounded-lg bg-slate-900/70 border border-slate-800">
        <div className="flex flex-col gap-1">
          <label htmlFor={`${ids}-depth`} className="font-medium text-slate-200">
            Profondeur de l’analyse
          </label>
          <select
            id={`${ids}-depth`}
            value={depth}
            onChange={(event) => onDepthChange(Number(event.target.value) as CoachDepth)}
            aria-describedby={`${ids}-depth-help`}
            className="bg-slate-950 border border-slate-700 rounded-md px-2 py-1.5 text-slate-200"
          >
            {COACH_DEPTHS.map((value) => (
              <option key={value} value={value}>
                {COACH_DEPTH_LABELS[value]}
              </option>
            ))}
          </select>
          <span id={`${ids}-depth-help`} className="text-slate-400">
            Une analyse plus profonde donne le meilleur coup et la réponse de l’adversaire avec plus de sûreté, au prix
            de quelques secondes.
          </span>
        </div>

        {modelSupported && (
          <div className="flex flex-col gap-2">
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={useModel}
                onChange={(event) => onUseModelChange(event.target.checked)}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium text-slate-200">Rédaction par une IA locale (expérimental)</span>
                <span className="block text-slate-400">
                  Un modèle de langage tourne dans votre navigateur et reformule les phrases. Les coups, les chiffres et
                  le plan restent écrits par le moteur et les règles ; si le texte du modèle ne colle pas aux faits, il
                  est ignoré. Il faut une carte graphique récente (WebGPU, Chrome ou Edge sur ordinateur).
                </span>
              </span>
            </label>

            <div className="flex flex-col gap-1">
              <label htmlFor={`${ids}-model`} className="font-medium text-slate-200">
                Modèle
              </label>
              <select
                id={`${ids}-model`}
                value={model.id}
                onChange={(event) => onModelIdChange(event.target.value)}
                disabled={!useModel}
                aria-describedby={`${ids}-model-note`}
                className="bg-slate-950 border border-slate-700 rounded-md px-2 py-1.5 text-slate-200 disabled:opacity-50"
              >
                {LOCAL_MODELS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label} — {preset.sizeLabel}
                  </option>
                ))}
                {isCustom && <option value={model.id}>{model.label} (choisi à la main)</option>}
              </select>
              <span id={`${ids}-model-note`} className="text-slate-400" data-testid="model-note">
                Téléchargement : {model.sizeLabel}, une seule fois (gardé par le navigateur). Mémoire graphique
                conseillée : {model.memoryLabel}. {model.note}
              </span>
            </div>
          </div>
        )}
        <CachedModels refreshKey={refreshKey} currentRepo={model.repo} />
      </div>
    </details>
  );
};
