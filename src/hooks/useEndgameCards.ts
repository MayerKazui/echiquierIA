import { useCallback, useEffect, useRef, useState } from 'react';
import type { Endgame } from '../data/endgames';
import { recordPractice } from '../services/practiceStore';
import { loadCards, saveCard } from '../services/trainingStore';
import { endgameCardId } from '../utils/endgameDrill';
import { review, type Card } from '../utils/spacedRepetition';

/**
 * The progress made on the theoretical endgames: one card per endgame, in the store shared by every training
 * (see `trainingStore`). `record` notes the result of one position (the card moves on at once, and is written in
 * the background). `cards` is null while the progress is being read.
 */
export function useEndgameCards(now: () => number = Date.now) {
  const [cards, setCards] = useState<ReadonlyMap<string, Card> | null>(null);
  const cardsRef = useRef<ReadonlyMap<string, Card> | null>(null);
  const nowRef = useRef(now);
  useEffect(() => {
    nowRef.current = now;
  });

  useEffect(() => {
    let isCancelled = false;
    void loadCards().then((loaded) => {
      if (isCancelled) return;
      cardsRef.current = loaded;
      setCards(loaded);
    });
    return () => {
      isCancelled = true;
    };
  }, []);

  const record = useCallback((endgame: Endgame, isSuccess: boolean): Card | null => {
    const previous = cardsRef.current;
    if (previous === null) return null;
    const id = endgameCardId(endgame);
    const card = review(id, previous.get(id), isSuccess, nowRef.current());
    const next = new Map(previous).set(id, card);
    cardsRef.current = next; // two results in a row must not start from the same cards
    setCards(next);
    void saveCard(card);
    void recordPractice(card.lastSeen);
    return card;
  }, []);

  return { cards, record };
}
