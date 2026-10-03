import { useCallback, useEffect, useRef, useState } from 'react';
import { listGames } from '../services/gameStore';
import { loadCards, saveCard } from '../services/trainingStore';
import { review, type Card } from '../utils/spacedRepetition';
import { collectPositions, type TrainingPosition } from '../utils/trainingPositions';

export type TrainingData =
  | { status: 'loading' }
  | {
      status: 'ready';
      positions: TrainingPosition[];
      cards: ReadonlyMap<string, Card>;
      /** Games kept in the browser, whether they gave a position or not. */
      games: number;
    };

/** Lets the page paint between two slices of work. */
const yieldToUi = (isCancelled: () => boolean) => () =>
  new Promise<void>((resolve, reject) =>
    setTimeout(() => (isCancelled() ? reject(new Error('cancelled')) : resolve()), 0)
  );

/**
 * What the training works from: the positions of the games kept in the browser, and the progress made on them.
 * `record` notes the result of one position (the card moves on at once, and is written in the background).
 */
export function useTrainingData(now: () => number = Date.now) {
  const [data, setData] = useState<TrainingData>({ status: 'loading' });
  const dataRef = useRef<TrainingData>(data);
  const nowRef = useRef(now);
  useEffect(() => {
    nowRef.current = now;
  });

  useEffect(() => {
    let isCancelled = false;
    void (async () => {
      try {
        const [games, cards] = await Promise.all([listGames(), loadCards()]);
        const positions = await collectPositions(games, { yieldToUi: yieldToUi(() => isCancelled), cards });
        if (isCancelled) return;
        const ready: TrainingData = { status: 'ready', positions, cards, games: games.length };
        dataRef.current = ready;
        setData(ready);
      } catch {
        // cancelled
      }
    })();
    return () => {
      isCancelled = true;
    };
  }, []);

  const record = useCallback((position: TrainingPosition, isSuccess: boolean): Card | null => {
    const previous = dataRef.current;
    if (previous.status !== 'ready') return null;
    const card = review(position.id, previous.cards.get(position.id), isSuccess, nowRef.current());
    const next: TrainingData = { ...previous, cards: new Map(previous.cards).set(position.id, card) };
    dataRef.current = next; // two results in a row must not start from the same cards
    setData(next);
    void saveCard(card);
    return card;
  }, []);

  return { data, record };
}
