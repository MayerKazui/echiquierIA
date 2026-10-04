import { useCallback, useEffect, useRef, useState } from 'react';
import { listGames } from '../services/gameStore';
import { ensureOpeningBookLoaded, getOpeningPosition, isOpeningDatasetLoaded } from '../services/openingBook';
import { recordPractice } from '../services/practiceStore';
import { loadCards, saveCard } from '../services/trainingStore';
import { collectDrillPositions, type DrillPosition } from '../utils/openingDrill';
import { review, type Card } from '../utils/spacedRepetition';

export type OpeningDrillData =
  | { status: 'loading' }
  /** The openings database could not be downloaded (offline, and not in the cache yet): nothing can be judged. */
  | { status: 'unavailable' }
  | {
      status: 'ready';
      positions: DrillPosition[];
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
 * What the training on the repertoire works from: the positions where the games kept in the browser left the
 * theory, and the progress made on them (in the same store as the cards of the replayed errors).
 * `record` notes the result of one position (the card moves on at once, and is written in the background).
 */
export function useOpeningDrill(now: () => number = Date.now) {
  const [data, setData] = useState<OpeningDrillData>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const dataRef = useRef<OpeningDrillData>(data);
  const nowRef = useRef(now);
  useEffect(() => {
    nowRef.current = now;
  });

  useEffect(() => {
    let isCancelled = false;
    void (async () => {
      try {
        const [, games, cards] = await Promise.all([
          ensureOpeningBookLoaded(),
          listGames().catch(() => []),
          loadCards(),
        ]);
        if (isCancelled) return;
        if (!isOpeningDatasetLoaded()) {
          const unavailable: OpeningDrillData = { status: 'unavailable' };
          dataRef.current = unavailable;
          setData(unavailable);
          return;
        }
        const positions = await collectDrillPositions(games, getOpeningPosition, {
          yieldToUi: yieldToUi(() => isCancelled),
        });
        if (isCancelled) return;
        const ready: OpeningDrillData = { status: 'ready', positions, cards, games: games.length };
        dataRef.current = ready;
        setData(ready);
      } catch {
        // cancelled
      }
    })();
    return () => {
      isCancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    const loading: OpeningDrillData = { status: 'loading' };
    dataRef.current = loading;
    setData(loading);
    setAttempt((n) => n + 1);
  }, []);

  const record = useCallback((position: DrillPosition, isSuccess: boolean): Card | null => {
    const previous = dataRef.current;
    if (previous.status !== 'ready') return null;
    const card = review(position.id, previous.cards.get(position.id), isSuccess, nowRef.current());
    const next: OpeningDrillData = { ...previous, cards: new Map(previous.cards).set(position.id, card) };
    dataRef.current = next; // two results in a row must not start from the same cards
    setData(next);
    void saveCard(card);
    void recordPractice(card.lastSeen);
    return card;
  }, []);

  return { data, record, retry };
}
