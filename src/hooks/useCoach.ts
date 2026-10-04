import { useCallback, useEffect, useRef, useState } from 'react';
import type { MoveAnalysis } from '../types/chess';
import { COACH_DEPTHS, deepAnalyseMove, type CoachDepth } from '../services/deepMoveAnalysis';
import { generateLocally, isLocalModelSupported, isUnsupportedDevice, type LocalDevice } from '../services/localLlm';
import { applyRewrite, buildRewriteMessages, isGroundedIn, parseRewrite, sourceText } from '../utils/coachRewrite';
import { coachParts, composeExplanation, type DeepAnalysis } from '../utils/moveCoach';
import { DEFAULT_LOCAL_MODEL, resolveLocalModel } from '../services/localLlm.protocol';
import { oneOf, usePersistentState } from './usePersistentState';

type Explanation = NonNullable<MoveAnalysis['aiExplanation']>;

export type CoachStatus =
  | { phase: 'idle' }
  | { phase: 'engine'; depth: number }
  | { phase: 'model'; percent: number | null; device: LocalDevice | null };

/** What happened to the local model's text, for the line under the explanation. */
export type CoachNote = 'accepted' | 'rejected' | 'failed' | 'unsupported' | null;

const parseDepth = oneOf(COACH_DEPTHS.map(String) as string[]);

/**
 * Asking the coach about a move: the engine searches deeper when the player chose to (the scores, the engine's move and
 * the answer to the move come from that search), the rule-based coach writes the explanation at once, and, when the player
 * turned the local model on, the model rewrites its sentences. The rule-based text is always shown first and is kept
 * whenever the model fails or says something the facts do not.
 */
export function useCoach(move: MoveAnalysis | null, onUpdate: (ply: number, explanation: Explanation) => void) {
  const [depthRaw, setDepthRaw] = usePersistentState<string>('chess_coach_depth', '12', (raw) => parseDepth(raw));
  const [modelRaw, setModelRaw] = usePersistentState<string>('chess_coach_model', 'false', (raw) =>
    raw === 'true' ? 'true' : 'false'
  );
  // The id of the model: one of the catalogue, or a repository set by hand (see `resolveLocalModel`)
  const [modelId, setModelId] = usePersistentState<string>('chess_coach_model_id', DEFAULT_LOCAL_MODEL, (raw) => raw);
  const model = resolveLocalModel(modelId);
  const depth = Number(depthRaw) as CoachDepth;
  const useModel = modelRaw === 'true' && isLocalModelSupported();
  const [status, setStatus] = useState<CoachStatus>({ phase: 'idle' });
  const [note, setNote] = useState<{ ply: number; value: CoachNote } | null>(null);
  const controller = useRef<AbortController | null>(null);
  const ply = move?.ply ?? null;

  // A different move, or leaving the page, stops what is running for the previous one
  useEffect(() => {
    return () => {
      controller.current?.abort();
      controller.current = null;
      setStatus({ phase: 'idle' });
    };
  }, [ply]);

  const explain = useCallback(async () => {
    if (!move) return;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    const { signal } = abort;
    const target = move;
    setNote(null);

    let deep: DeepAnalysis | undefined;
    if (depth > 0) {
      setStatus({ phase: 'engine', depth });
      try {
        deep = await deepAnalyseMove(target, depth, signal);
      } catch {
        if (signal.aborted) return;
        deep = undefined; // the game's analysis still tells most of it
      }
    }
    if (signal.aborted) return;

    const parts = coachParts(target, deep);
    onUpdate(target.ply, { ...composeExplanation(parts), source: 'rules', ...(deep && { depth: deep.depth }) });
    if (!useModel) {
      setStatus({ phase: 'idle' });
      return;
    }

    let device: LocalDevice | null = null;
    setStatus({ phase: 'model', percent: null, device });
    try {
      const text = await generateLocally(buildRewriteMessages(parts, { noThink: model.noThink }), {
        model,
        signal,
        onDevice: (found) => {
          device = found;
        },
        onProgress: ({ loaded, total }) =>
          setStatus({
            phase: 'model',
            percent: total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : null,
            device,
          }),
      });
      if (signal.aborted) return;
      const rewrite = parseRewrite(text, !parts.problem);
      const grounded = rewrite !== null && isGroundedIn(`${rewrite.problem} ${rewrite.idea}`, sourceText(parts));
      if (rewrite && grounded) {
        onUpdate(target.ply, {
          ...composeExplanation(applyRewrite(parts, rewrite)),
          source: 'model',
          ...(deep && { depth: deep.depth }),
        });
        setNote({ ply: target.ply, value: 'accepted' });
      } else {
        setNote({ ply: target.ply, value: 'rejected' });
      }
    } catch (error) {
      if (signal.aborted) return;
      if (!isUnsupportedDevice(error)) console.warn('Le modèle local a échoué :', error);
      setNote({ ply: target.ply, value: isUnsupportedDevice(error) ? 'unsupported' : 'failed' });
    } finally {
      if (!signal.aborted) setStatus({ phase: 'idle' });
    }
  }, [move, depth, useModel, model, onUpdate]);

  return {
    depth,
    setDepth: (value: CoachDepth) => setDepthRaw(String(value)),
    useModel: modelRaw === 'true',
    setUseModel: (value: boolean) => setModelRaw(String(value)),
    modelId: model.id,
    setModelId,
    modelSupported: isLocalModelSupported(),
    status,
    note: note && note.ply === ply ? note.value : null,
    explain,
  };
}
