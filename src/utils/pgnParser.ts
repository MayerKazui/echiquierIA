import { Chess } from 'chess.js';
import { GameMetadata } from '../types/chess';

export function parsePgnHeaders(pgn: string): GameMetadata {
  const metadata: GameMetadata = {};

  const lines = pgn.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      const match = trimmed.match(/\[(\w+)\s+"(.*)"\]/);
      if (match) {
        const key = match[1].toLowerCase();
        const value = match[2];

        if (key === 'event') metadata.event = value;
        else if (key === 'site') metadata.site = value;
        else if (key === 'date') metadata.date = value;
        else if (key === 'round') metadata.round = value;
        else if (key === 'white') metadata.white = value;
        else if (key === 'black') metadata.black = value;
        else if (key === 'result') metadata.result = value;
        else if (key === 'whiteelo') metadata.whiteElo = value;
        else if (key === 'blackelo') metadata.blackElo = value;
        else if (key === 'eco') metadata.eco = value;
        else if (key === 'opening') metadata.opening = value;
        else if (key === 'timecontrol') metadata.timeControl = value;
      }
    }
  }

  // Fallback defaults
  if (!metadata.white) metadata.white = 'Joueur Blancs';
  if (!metadata.black) metadata.black = 'Joueur Noirs';
  if (!metadata.result) metadata.result = '*';

  return metadata;
}

export function validatePgn(pgn: string): { valid: boolean; error?: string; moveCount: number } {
  try {
    const chess = new Chess();
    chess.loadPgn(pgn);
    const moves = chess.history();
    if (moves.length === 0) {
      return { valid: false, error: 'Aucun coup détecté dans le PGN.', moveCount: 0 };
    }
    return { valid: true, moveCount: moves.length };
  } catch (err: any) {
    return {
      valid: false,
      error: err.message || 'Format PGN invalide ou coup illégal détecté.',
      moveCount: 0,
    };
  }
}
