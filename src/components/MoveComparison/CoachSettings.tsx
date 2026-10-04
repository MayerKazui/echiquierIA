import React from 'react';
import { COACH_DEPTHS, COACH_DEPTH_LABELS, type CoachDepth } from '../../services/deepMoveAnalysis';
import { LOCAL_MODEL_SIZE_LABEL } from '../../services/localLlm.protocol';

interface CoachSettingsProps {
  depth: CoachDepth;
  onDepthChange: (depth: CoachDepth) => void;
  useModel: boolean;
  onUseModelChange: (value: boolean) => void;
  modelSupported: boolean;
}

/** The two choices of the coach: how deep the engine looks, and whether a local language model writes the sentences. */
export const CoachSettings: React.FC<CoachSettingsProps> = ({
  depth,
  onDepthChange,
  useModel,
  onUseModelChange,
  modelSupported,
}) => (
  <details className="text-xs text-slate-300 group">
    <summary className="cursor-pointer select-none text-slate-400 hover:text-slate-200">
      Réglages de l’entraîneur
    </summary>
    <div className="mt-2 flex flex-col gap-3 p-3 rounded-lg bg-slate-900/70 border border-slate-800">
      <label className="flex flex-col gap-1">
        <span className="font-medium text-slate-200">Profondeur de l’analyse</span>
        <select
          value={depth}
          onChange={(event) => onDepthChange(Number(event.target.value) as CoachDepth)}
          className="bg-slate-950 border border-slate-700 rounded-md px-2 py-1.5 text-slate-200"
        >
          {COACH_DEPTHS.map((value) => (
            <option key={value} value={value}>
              {COACH_DEPTH_LABELS[value]}
            </option>
          ))}
        </select>
        <span className="text-slate-400">
          Une analyse plus profonde donne le meilleur coup et la réponse de l’adversaire avec plus de sûreté, au prix de
          quelques secondes.
        </span>
      </label>

      {modelSupported && (
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
              Demande une carte graphique récente (WebGPU, Chrome ou Edge sur ordinateur). Télécharge un modèle de{' '}
              {LOCAL_MODEL_SIZE_LABEL} la première fois, gardé ensuite dans le navigateur. Les coups, les chiffres et le
              plan restent écrits par le moteur et les règles ; si le texte du modèle ne colle pas aux faits, il est
              ignoré.
            </span>
          </span>
        </label>
      )}
    </div>
  </details>
);
