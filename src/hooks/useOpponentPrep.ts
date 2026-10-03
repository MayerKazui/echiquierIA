import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ImportError,
  SOURCE_LABELS,
  fetchGames,
  fetchGamesPage,
  type ImportSource,
  type SpeedFilter,
} from '../services/gameImport';
import { ensureOpeningBookLoaded, getOpeningPosition, isOpeningDatasetLoaded } from '../services/openingBook';
import { isAbortError } from '../services/stockfishEngine';
import { useStableCallback } from './useStableCallback';
import { buildOpponentPrep, toOpponentGames, type OpponentPrep } from '../utils/opponentPrep';

export interface OpponentSearch {
  source: ImportSource;
  username: string;
  speed: SpeedFilter;
  /** Games asked for (fewer are read when the history is shorter). */
  target: number;
}

export type OpponentState =
  | { status: 'idle' }
  | { status: 'loading'; search: OpponentSearch; fetched: number }
  | { status: 'ready'; search: OpponentSearch; prep: OpponentPrep }
  | { status: 'error'; message: string };

/** Lets the page paint between two slices of work. */
const yieldToUi = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Reads the recent games of an opponent from chess.com or Lichess (straight from the browser, like the import of
 * one's own games) and prepares what the explorer and the summary show. The games are only kept in memory: they
 * are not analysed, not stored, and they do not enter the player's own profile.
 */
export function useOpponentPrep(fetchPage: typeof fetchGamesPage = fetchGamesPage) {
  const [state, setState] = useState<OpponentState>({ status: 'idle' });
  const controllerRef = useRef<AbortController | null>(null);
  const readPage = useStableCallback(fetchPage);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const reset = useCallback(() => {
    controllerRef.current?.abort();
    setState({ status: 'idle' });
  }, []);

  const search = useCallback(
    async (request: OpponentSearch) => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      const username = request.username.trim();
      const target: OpponentSearch = { ...request, username };
      setState({ status: 'loading', search: target, fetched: 0 });

      try {
        const [games] = await Promise.all([
          fetchGames(request.source, username, {
            target: request.target,
            speed: request.speed,
            signal: controller.signal,
            fetchPage: readPage,
            onProgress: (fetched) => {
              if (!controller.signal.aborted) setState({ status: 'loading', search: target, fetched });
            },
          }),
          ensureOpeningBookLoaded(),
        ]);
        if (controller.signal.aborted) return;
        if (!isOpeningDatasetLoaded()) {
          setState({
            status: 'error',
            message:
              "La base des ouvertures n'a pas pu être téléchargée : vérifiez la connexion, puis réessayez (une fois chargée, elle reste disponible hors ligne).",
          });
          return;
        }
        const prep = await buildOpponentPrep(await toOpponentGames(games, { yieldToUi }), getOpeningPosition, {
          yieldToUi,
        });
        if (!controller.signal.aborted) setState({ status: 'ready', search: target, prep });
      } catch (error) {
        if (controller.signal.aborted || isAbortError(error)) return;
        setState({
          status: 'error',
          message:
            error instanceof ImportError
              ? error.message
              : `Lecture impossible depuis ${SOURCE_LABELS[request.source]}.`,
        });
      }
    },
    [readPage]
  );

  return { state, search, reset };
}
