import type { GameAnalysisResult } from '../types/chess';
import type { PlayerColor } from '../types/ui';
import { chooseOpening } from './openingBook';
import type { GameAnalysisOutput } from './stockfishEngine';
import { parsePgnHeaders } from '../utils/pgnParser';

/** Whether a player name is the engine of "Jouer contre Stockfish" ("Stockfish (Club)"). */
const isEngineName = (name: string): boolean => /^stockfish \(/i.test(name.trim());

/**
 * Picks the side the user played from the PGN player names, falling back to `fallback`. In a game against the engine
 * the player is the side that is not "Stockfish (…)", whatever their pseudo.
 */
export function detectUserColor(
  headers: { white?: string; black?: string },
  userPseudo: string,
  fallback: PlayerColor
): PlayerColor {
  const white = (headers.white || '').toLowerCase();
  const black = (headers.black || '').toLowerCase();
  const pseudo = userPseudo.toLowerCase();
  if (pseudo) {
    if (black.includes(pseudo) && !white.includes(pseudo)) return 'b';
    if (white.includes(pseudo)) return 'w';
  }
  if (isEngineName(white) !== isEngineName(black)) return isEngineName(white) ? 'b' : 'w';
  return fallback;
}

/**
 * The result of an analysis as the app keeps it: the engine output, the PGN headers, the opening (the database
 * first, the PGN header as a fallback) and the side the user played.
 */
export function buildGameResult(
  pgn: string,
  output: GameAnalysisOutput,
  userPseudo: string,
  userColor: PlayerColor
): GameAnalysisResult {
  const headers = parsePgnHeaders(pgn);
  const metadata = { ...headers };
  const opening = chooseOpening(output.detectedOpening ?? null, headers);
  metadata.opening = opening?.name;
  metadata.eco = opening?.eco;
  return {
    metadata,
    moves: output.moves,
    statsWhite: output.statsWhite,
    statsBlack: output.statsBlack,
    userColor: detectUserColor(metadata, userPseudo, userColor),
    userPseudo,
  };
}
