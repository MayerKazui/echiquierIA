import { useCallback, useEffect, useMemo, useState } from 'react';
import type { StudyNode } from '../types/study';
import type { PlayerColor } from '../types/ui';
import { judgeMove, pickReply } from '../utils/studyPlay';
import { findNode, turnOf } from '../utils/studyTree';
import type { PromotionPiece } from './useSandbox';

/** Time before the computer answers (a reply at once would give no time to see the move that was played). */
export const REPLY_DELAY_MS = 600;

export interface StudyPlay {
  /** The position on the board. */
  node: StudyNode;
  /** The moves played since the start of the chapter. */
  line: StudyNode[];
  /** The player's side. */
  color: PlayerColor;
  /** The line of the study has ended. */
  isDone: boolean;
  /** It is the player's turn and the line goes on. */
  isPlayerTurn: boolean;
  /** Moves of the player that the study does not play (and that were taken back). */
  mistakes: number;
  /** What happened last, in French (a move taken back, the end of the line). */
  notice: string;
  /** The move the study plays here, once the player asked for a hint. */
  hint: { from: string; to: string } | null;
  play: (from: string, to: string, promotion?: PromotionPiece) => boolean;
  showHint: () => void;
  restart: () => void;
}

/**
 * Plays a chapter against the computer: the player takes a side and plays the moves of the study; the computer
 * answers with the moves of the study too, sometimes taking a variation. A move that leaves the study is taken
 * back. `random` is injected for the tests.
 */
export function useStudyPlay(
  root: StudyNode,
  color: PlayerColor,
  random: () => number = Math.random,
  onMove?: (san: string) => void
): StudyPlay {
  const [line, setLine] = useState<StudyNode[]>([]);
  const [mistakes, setMistakes] = useState(0);
  const [notice, setNotice] = useState('');
  const [hasHint, setHasHint] = useState(false);
  const [run, setRun] = useState(0);

  // The chapter may be edited while it is not played, but not during a game: the line is looked up again by id
  const node = useMemo(() => {
    const last = line[line.length - 1];
    return (last && findNode(root, last.id)) || root;
  }, [line, root]);

  const isDone = node.children.length === 0;
  const isPlayerTurn = !isDone && turnOf(node) === color;

  // The computer's turn
  useEffect(() => {
    if (isDone || isPlayerTurn) return;
    const timer = setTimeout(() => {
      const reply = pickReply(node, random);
      if (!reply) return;
      setLine((l) => [...l, reply]);
      setHasHint(false);
      onMove?.(reply.san);
    }, REPLY_DELAY_MS);
    return () => clearTimeout(timer);
  }, [node, isDone, isPlayerTurn, random, onMove, run]);

  const play = useCallback(
    (from: string, to: string, promotion?: PromotionPiece): boolean => {
      if (!isPlayerTurn) return false;
      const verdict = judgeMove(node, from, to, promotion);
      if (verdict.kind === 'illegal') return false;
      if (verdict.kind === 'off-book') {
        setMistakes((m) => m + 1);
        setNotice(`${verdict.san} n'est pas dans l'étude : le coup est annulé, cherchez-en un autre.`);
        return false;
      }
      setLine((l) => [...l, verdict.node]);
      setNotice('');
      setHasHint(false);
      onMove?.(verdict.node.san);
      return true;
    },
    [isPlayerTurn, node, onMove]
  );

  const showHint = useCallback(() => setHasHint(true), []);

  const restart = useCallback(() => {
    setLine([]);
    setMistakes(0);
    setNotice('');
    setHasHint(false);
    setRun((r) => r + 1);
  }, []);

  const main = node.children[0];
  const endNotice =
    mistakes === 0
      ? 'Fin de la ligne, sans une erreur. Bravo !'
      : `Fin de la ligne, avec ${mistakes} ${mistakes > 1 ? 'coups hors étude' : 'coup hors étude'}.`;
  const hint = hasHint && isPlayerTurn && main ? { from: main.from, to: main.to } : null;

  return {
    node,
    line,
    color,
    isDone,
    isPlayerTurn,
    mistakes,
    notice: isDone && line.length > 0 ? endNotice : notice,
    hint,
    play,
    showHint,
    restart,
  };
}
