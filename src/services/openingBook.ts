import { Chess } from 'chess.js';
import { EngineEvaluation } from './stockfishEngine';
import { toEnglishSan } from '../utils/chessNotation';

/**
 * Standard grandmaster opening repertoires to evaluate opening positions in 0 ms.
 * Covers mainlines of 1. e4, 1. d4, 1. c4, 1. Nf3 and their key defenses.
 */
const OPENING_LINES: string[][] = [
  // Ruy Lopez (Espagnole)
  [
    'e4',
    'e5',
    'Nf3',
    'Nc6',
    'Bb5',
    'a6',
    'Ba4',
    'Nf6',
    'O-O',
    'Be7',
    'Re1',
    'b5',
    'Bb3',
    'd6',
    'c3',
    'O-O',
    'h3',
    'Nb8',
    'd4',
  ],
  ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7', 'Re1', 'b5', 'Bb3', 'O-O', 'c3', 'd5'],
  ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'Nf6', 'O-O', 'Nxe4', 'd4', 'Nd6', 'Bxc6', 'dxc6', 'dxe5', 'Nf5', 'Qxd8+', 'Kxd8'],
  ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'Bc5', 'c3', 'Nf6', 'd4', 'exd4', 'e5', 'Nd5', 'O-O'],

  // Italian Game (Italienne)
  ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3', 'Nf6', 'd3', 'd6', 'O-O', 'O-O', 'h3', 'a6', 'Bb3', 'Ba7'],
  ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'O-O', 'Nf6', 'd3', 'd6', 'c3', 'a6', 'a4', 'Ba7'],
  ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'd3', 'Be7', 'O-O', 'O-O', 'Re1', 'd6', 'c3', 'Na5'],
  [
    'e4',
    'e5',
    'Nf3',
    'Nc6',
    'Bc4',
    'Nf6',
    'Ng5',
    'd5',
    'exd5',
    'Na5',
    'Bb5+',
    'c6',
    'dxc6',
    'bxc6',
    'Be2',
    'h6',
    'Nf3',
    'e4',
  ],

  // Sicilian Defense (Sicilienne)
  // Najdorf
  [
    'e4',
    'c5',
    'Nf3',
    'd6',
    'd4',
    'cxd4',
    'Nxd4',
    'Nf6',
    'Nc3',
    'a6',
    'Be3',
    'e5',
    'Nb3',
    'Be6',
    'f3',
    'Be7',
    'Qd2',
    'O-O',
    'O-O-O',
    'Nbd7',
  ],
  [
    'e4',
    'c5',
    'Nf3',
    'd6',
    'd4',
    'cxd4',
    'Nxd4',
    'Nf6',
    'Nc3',
    'a6',
    'Bg5',
    'e6',
    'f4',
    'Be7',
    'Qf3',
    'Qc7',
    'O-O-O',
    'Nbd7',
  ],
  [
    'e4',
    'c5',
    'Nf3',
    'd6',
    'd4',
    'cxd4',
    'Nxd4',
    'Nf6',
    'Nc3',
    'a6',
    'Bc4',
    'e6',
    'Bb3',
    'b5',
    'Bg5',
    'Be7',
    'Qf3',
    'Qc7',
    'O-O-O',
    'Bb7',
  ],
  // Classical / Dragon / Richter-Rauzer
  ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'Nc6', 'Bg5', 'e6', 'Qd2', 'a6', 'O-O-O', 'Bd7'],
  [
    'e4',
    'c5',
    'Nf3',
    'd6',
    'd4',
    'cxd4',
    'Nxd4',
    'Nf6',
    'Nc3',
    'g6',
    'Be3',
    'Bg7',
    'f3',
    'O-O',
    'Qd2',
    'Nc6',
    'Bc4',
    'Bd7',
    'O-O-O',
  ],
  // Sveshnikov
  [
    'e4',
    'c5',
    'Nf3',
    'Nc6',
    'd4',
    'cxd4',
    'Nxd4',
    'Nf6',
    'Nc3',
    'e5',
    'Ndb5',
    'd6',
    'Bg5',
    'a6',
    'Na3',
    'b5',
    'Nd5',
    'Be7',
    'Bxf6',
    'Bxf6',
    'c3',
  ],
  // Paulsen / Kan / Taimanov
  ['e4', 'c5', 'Nf3', 'e6', 'd4', 'cxd4', 'Nxd4', 'a6', 'Bd3', 'Nf6', 'O-O', 'Qc7', 'Qe2', 'd6', 'c4', 'g6'],
  ['e4', 'c5', 'Nf3', 'e6', 'd4', 'cxd4', 'Nxd4', 'Nc6', 'Nc3', 'Qc7', 'Be3', 'a6', 'Qd2', 'Nf6', 'O-O-O'],
  // Alapin
  ['e4', 'c5', 'c3', 'd5', 'exd5', 'Qxd5', 'd4', 'Nf6', 'Nf3', 'e6', 'Be2', 'Be7', 'O-O', 'O-O'],

  // French Defense (Française)
  ['e4', 'e6', 'd4', 'd5', 'Nc3', 'Nf6', 'Bg5', 'Be7', 'e5', 'Nfd7', 'Bxe7', 'Qxe7', 'f4', 'O-O', 'Nf3', 'c5'],
  ['e4', 'e6', 'd4', 'd5', 'Nc3', 'Bb4', 'e5', 'c5', 'a3', 'Bxc3+', 'bxc3', 'Ne7', 'Qg4', 'O-O', 'Bd3', 'Nbc6'],
  ['e4', 'e6', 'd4', 'd5', 'Nd2', 'c5', 'exd5', 'Qxd5', 'Ngf3', 'cxd4', 'Bc4', 'Qd6', 'O-O', 'Nf6'],
  ['e4', 'e6', 'd4', 'd5', 'e5', 'c5', 'c3', 'Nc6', 'Nf3', 'Qb6', 'a3', 'c4', 'Nbd2', 'Na5'],

  // Caro-Kann Defense
  [
    'e4',
    'c6',
    'd4',
    'd5',
    'Nc3',
    'dxe4',
    'Nxe4',
    'Bf5',
    'Ng3',
    'Bg6',
    'h4',
    'h6',
    'Nf3',
    'Nd7',
    'h5',
    'Bh7',
    'Bd3',
    'Bxd3',
    'Qxd3',
  ],
  ['e4', 'c6', 'd4', 'd5', 'e5', 'Bf5', 'Nf3', 'e6', 'Be2', 'c5', 'Be3', 'Qb6', 'Nc3', 'Nc6', 'O-O'],
  ['e4', 'c6', 'd4', 'd5', 'exd5', 'cxd5', 'Bd3', 'Nc6', 'c3', 'Nf6', 'Bf4', 'Bg4', 'Qb3', 'Qc8'],

  // Queen's Gambit Declined (Gambit Dame)
  [
    'd4',
    'd5',
    'c4',
    'e6',
    'Nc3',
    'Nf6',
    'Bg5',
    'Be7',
    'e3',
    'O-O',
    'Nf3',
    'h6',
    'Bh4',
    'b6',
    'cxd5',
    'Nxd5',
    'Bxe7',
    'Qxe7',
    'Nxd5',
    'exd5',
  ],
  ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'cxd5', 'exd5', 'Bg5', 'c6', 'e3', 'Be7', 'Bd3', 'O-O', 'Qc2', 'Nbd7'],
  // Slav Defense (Slave)
  [
    'd4',
    'd5',
    'c4',
    'c6',
    'Nf3',
    'Nf6',
    'Nc3',
    'dxc4',
    'a4',
    'Bf5',
    'e3',
    'e6',
    'Bxc4',
    'Bb4',
    'O-O',
    'O-O',
    'Qe2',
    'Nbd7',
  ],
  ['d4', 'd5', 'c4', 'c6', 'Nc3', 'Nf6', 'e3', 'e6', 'Nf3', 'Nbd7', 'Bd3', 'dxc4', 'Bxc4', 'b5', 'Bd3', 'Bb7'],

  // King's Indian Defense (Est-Indienne)
  [
    'd4',
    'Nf6',
    'c4',
    'g6',
    'Nc3',
    'Bg7',
    'e4',
    'd6',
    'Nf3',
    'O-O',
    'Be2',
    'e5',
    'O-O',
    'Nc6',
    'd5',
    'Ne7',
    'Ne1',
    'Nd7',
    'Be3',
    'f5',
  ],
  ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'Bg7', 'e4', 'd6', 'f3', 'O-O', 'Be3', 'e5', 'd5', 'c6', 'Qd2', 'cxd5', 'cxd5'],

  // Grünfeld Defense
  ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'd5', 'cxd5', 'Nxd5', 'e4', 'Nxc3', 'bxc3', 'Bg7', 'Nf3', 'c5', 'Rb1', 'O-O', 'Be2'],

  // Nimzo-Indian Defense
  [
    'd4',
    'Nf6',
    'c4',
    'e6',
    'Nc3',
    'Bb4',
    'e3',
    'O-O',
    'Bd3',
    'd5',
    'Nf3',
    'c5',
    'O-O',
    'Nc6',
    'a3',
    'Bxc3',
    'bxc3',
    'dxc4',
    'Bxc4',
  ],
  ['d4', 'Nf6', 'c4', 'e6', 'Nc3', 'Bb4', 'Qc2', 'O-O', 'a3', 'Bxc3+', 'Qxc3', 'b6', 'Bg5', 'Bb7'],

  // English Opening (Anglaise)
  ['c4', 'e5', 'Nc3', 'Nf6', 'Nf3', 'Nc6', 'g3', 'd5', 'cxd5', 'Nxd5', 'Bg2', 'Nb6', 'O-O', 'Be7', 'd3', 'O-O'],
  ['c4', 'c5', 'Nc3', 'Nc6', 'g3', 'g6', 'Bg2', 'Bg7', 'Nf3', 'Nf6', 'O-O', 'O-O', 'd4', 'cxd4', 'Nxd4'],

  // Reti / King's Indian Attack
  ['Nf3', 'd5', 'g3', 'Nf6', 'Bg2', 'c6', 'O-O', 'Bf5', 'd3', 'e6', 'Nbd2', 'h6', 'Qe1', 'Be7', 'e4'],
  ['Nf3', 'Nf6', 'c4', 'e6', 'g3', 'd5', 'Bg2', 'Be7', 'O-O', 'O-O', 'b3', 'c5', 'Bb2', 'Nc6'],

  // Scandinavian Defense (Scandinave)
  ['e4', 'd5', 'exd5', 'Qxd5', 'Nc3', 'Qa5', 'd4', 'Nf6', 'Nf3', 'c6', 'Bc4', 'Bf5', 'Bd2', 'e6', 'Nd5', 'Qd8'],

  // Philidor Defense
  ['e4', 'e5', 'Nf3', 'd6', 'd4', 'exd4', 'Nxd4', 'Nf6', 'Nc3', 'Be7', 'Be2', 'O-O', 'O-O', 'Re8'],
];

/**
 * Normalizes FEN by keeping only piece placement, active color, castling rights, and en passant target.
 * Ignores halfmove clock and fullmove number to match transpositions.
 */
export function normalizeFen(fen: string): string {
  const parts = fen.trim().split(/\s+/);
  return parts.slice(0, 4).join(' ');
}

/** Shape of an entry of public/openings.json (see scripts/openingsDataset.ts). */
export type DatasetEntry = [
  bestMoveSan: string,
  bestMoveUci: string,
  eco: string,
  name: string,
  pv: string[],
  nextSans?: string[],
];

// Map of normalized FEN -> Book move evaluation & Opening details
export interface BookEntry {
  eval: EngineEvaluation;
  validMoves: Set<string>;
  eco?: string;
  name?: string;
  /** The name comes from the full dataset (the built-in labels of the base book are only a fallback). */
  isDatasetName?: boolean;
}

const bookCache = new Map<string, BookEntry>();
let isBookInitialized = false;
let isFullDatasetLoaded = false;

function initOpeningBook() {
  if (isBookInitialized) return;

  try {
    for (const line of OPENING_LINES) {
      const chess = new Chess();
      for (let i = 0; i < line.length; i++) {
        const normFen = normalizeFen(chess.fen());
        const moveSan = line[i];

        let entry = bookCache.get(normFen);
        if (!entry) {
          const isWhiteTurn = chess.turn() === 'w';
          entry = {
            eval: {
              cp: isWhiteTurn ? 20 : 15,
              mate: null,
              bestMoveSan: moveSan,
              bestMoveUci: '',
              pv: line.slice(i, i + 5),
            },
            validMoves: new Set<string>(),
          };
          bookCache.set(normFen, entry);
        }
        entry.validMoves.add(moveSan);

        const moveRes = chess.move(moveSan);
        if (!moveRes) break;
      }
    }

    // Well-established primary branches for opening theory
    const registerBranch = (fen: string, moves: string[], eco?: string, name?: string) => {
      const norm = normalizeFen(fen);
      let entry = bookCache.get(norm);
      if (!entry) {
        entry = {
          eval: {
            cp: norm.includes(' w ') ? 20 : 15,
            mate: null,
            bestMoveSan: moves[0] || '',
            bestMoveUci: '',
            pv: moves.slice(0, 5),
          },
          validMoves: new Set<string>(),
          eco,
          name,
        };
        bookCache.set(norm, entry);
      } else {
        if (eco && !entry.eco) entry.eco = eco;
        if (name && !entry.name) entry.name = name;
      }
      moves.forEach((m) => entry!.validMoves.add(m));
    };

    // 1. Initial Position (White move 1)
    registerBranch(
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      ['e4', 'd4', 'Nf3', 'c4', 'g3', 'b3', 'f4', 'Nc3', 'b4', 'd3', 'e3'],
      'A00',
      'Position initiale'
    );

    // 2. Main replies to 1. e4
    registerBranch(
      'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
      ['e5', 'c5', 'e6', 'c6', 'd6', 'd5', 'g6', 'Nf6', 'Nc6', 'b6'],
      'B00',
      'Ouverture du pion Roi'
    );

    // 3. Main replies to 1. d4
    registerBranch(
      'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1',
      ['Nf6', 'd5', 'e6', 'g6', 'c5', 'f5', 'd6', 'c6', 'e5'],
      'A40',
      'Ouverture du pion Dame'
    );

    // 4. Main replies to 1. c4 (English)
    registerBranch(
      'rnbqkbnr/pppppppp/8/8/2P5/8/PP1PPPPP/RNBQKBNR b KQkq - 0 1',
      ['e5', 'c5', 'Nf6', 'e6', 'c6', 'g6', 'd5'],
      'A10',
      'Ouverture anglaise'
    );

    // 5. Main replies to 1. Nf3 (Reti)
    registerBranch(
      'rnbqkbnr/pppppppp/8/8/8/5N2/PPPPPPPP/RNBQKB1R b KQkq - 0 1',
      ['d5', 'Nf6', 'c5', 'g6', 'e6', 'd6', 'f5'],
      'A04',
      'Ouverture Réti'
    );

    // 6. After 1. e4 c5 (Sicilian)
    registerBranch(
      'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
      ['Nf3', 'Nc3', 'c3', 'd4', 'f4', 'g3', 'Bc4', 'b3', 'Ne2'],
      'B20',
      'Défense sicilienne'
    );

    // 7. After 1. e4 c5 2. Nf3
    registerBranch(
      'rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2',
      ['d6', 'Nc6', 'e6', 'g6', 'a6', 'Nf6'],
      'B27',
      'Défense sicilienne (2. Cf3)'
    );

    // 8. After 1. e4 e5 (Open Game)
    registerBranch(
      'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
      ['Nf3', 'Nc3', 'Bc4', 'f4', 'd4', 'c3', 'Qh5'],
      'C20',
      'Partie ouverte (1. e4 e5)'
    );

    // 9. After 1. e4 e5 2. Nf3
    registerBranch(
      'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2',
      ['Nc6', 'Nf6', 'd6', 'f5', 'Qe7', 'd5'],
      'C40',
      'Début du pion Roi'
    );

    // 10. After 1. d4 d5 (Closed Game)
    registerBranch(
      'rnbqkbnr/ppp1pppp/8/3p4/3P4/8/PPP1PPPP/RNBQKBNR w KQkq - 0 2',
      ['c4', 'Nf3', 'Bf4', 'Nc3', 'e3', 'Bg5'],
      'D00',
      'Partie fermée'
    );

    // 11. After 1. d4 d5 2. c4 (Queen\'s Gambit)
    registerBranch(
      'rnbqkbnr/ppp1pppp/8/3p4/2PP4/8/PP2PPPP/RNBQKBNR b KQkq - 0 2',
      ['e6', 'c6', 'dxc4', 'Nc6', 'Nf6', 'e5', 'c5'],
      'D06',
      'Gambit Dame'
    );

    // 12. After 1. d4 Nf6 (Indian Defenses)
    registerBranch(
      'rnbqkbnr/pppppppp/5n2/8/3P4/8/PPP1PPPP/RNBQKBNR w KQkq - 1 2',
      ['c4', 'Nf3', 'Bg5', 'Nc3', 'Bf4', 'g3', 'e3'],
      'A45',
      'Défenses indiennes'
    );

    // 13. After 1. d4 Nf6 2. c4
    registerBranch(
      'rnbqkbnr/pppppppp/5n2/8/2PP4/8/PP2PPPP/RNBQKBNR b KQkq - 0 2',
      ['g6', 'e6', 'c5', 'e5', 'b6', 'd6'],
      'A50',
      'Système indien (2. c4)'
    );
  } catch (err) {
    console.warn('Error populating base opening book:', err);
  } finally {
    isBookInitialized = true;
  }
}

let datasetLoadPromise: Promise<void> | null = null;

/** Where the full dataset comes from: the file served next to the app. */
async function fetchOpenings(): Promise<Record<string, DatasetEntry>> {
  const res = await fetch('/openings.json');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/**
 * Loads the full 7,800+ theoretical openings database into memory (once). It is about 1 MB, so it is not
 * part of the bundle: the page prefetches it when idle, and an analysis waits for it if it is not there yet.
 * `load` replaces the download (tests read the file from disk). A failed load is retried on the next call.
 */
export async function ensureOpeningBookLoaded(
  load: () => Promise<Record<string, DatasetEntry>> = fetchOpenings
): Promise<void> {
  if (!isBookInitialized) {
    initOpeningBook();
  }

  if (isFullDatasetLoaded) {
    return;
  }

  if (!datasetLoadPromise) {
    datasetLoadPromise = (async () => {
      try {
        const data = await load();

        for (const [normFen, [bestMoveSan, bestMoveUci, eco, name, pv, nextSans]] of Object.entries(data)) {
          let entry = bookCache.get(normFen);
          if (!entry) {
            const isWhiteTurn = normFen.includes(' w ');
            entry = {
              eval: {
                cp: isWhiteTurn ? 20 : 15,
                mate: null,
                bestMoveSan: bestMoveSan || '',
                bestMoveUci: bestMoveUci || '',
                pv: pv || [],
              },
              validMoves: new Set<string>(),
              eco,
              name,
              isDatasetName: Boolean(name),
            };
            bookCache.set(normFen, entry);
          } else if (name && !entry.isDatasetName) {
            // One naming scheme everywhere: the dataset name replaces the built-in label of the base book
            // (the first dataset line reaching a position names it, as before)
            entry.eco = eco || entry.eco;
            entry.name = name;
            entry.isDatasetName = true;
          }

          if (bestMoveSan) {
            entry.validMoves.add(bestMoveSan);
          }
          if (pv && Array.isArray(pv) && pv[0]) {
            entry.validMoves.add(pv[0]);
          }
          // Every known continuation of this position counts as theory
          for (const san of nextSans ?? []) {
            entry.validMoves.add(san);
          }
        }
        isFullDatasetLoaded = true;
      } catch (err) {
        console.warn('Could not load complete openings dataset:', err);
        datasetLoadPromise = null; // let a later call try again (e.g. after a network hiccup)
      }
    })();
  }

  await datasetLoadPromise;
}

/**
 * Check if position is a known opening theoretical book move.
 * Returns instant EngineEvaluation in 0 ms.
 */
export function getOpeningBookEvaluation(fen: string): EngineEvaluation | null {
  if (!isBookInitialized) {
    initOpeningBook();
  }

  const normFen = normalizeFen(fen);
  const entry = bookCache.get(normFen);
  return entry ? entry.eval : null;
}

/**
 * Returns the move as English SAN (what the book stores). A move that is legal as written is kept;
 * otherwise it is read as French SAN (Cf3, Fc4, Te1, Dd1, Rg1). A leading R is a rook in English and
 * a king in French: when both readings are legal, the English one wins.
 */
function toBookSan(fen: string, san: string): string {
  try {
    return new Chess(fen).move(san).san;
  } catch {
    // Not legal as English SAN
  }
  try {
    return new Chess(fen).move(toEnglishSan(san)).san;
  } catch {
    return san;
  }
}

/**
 * Checks if a played move is a recognized theoretical book move from the position: either it is a known
 * continuation of the position, or it leads to a position found in the openings database.
 * `eco` / `name` describe the position reached by the move, and only when an opening ends exactly there.
 */
export function checkIsTheoreticalMove(
  fenBefore: string,
  moveSan: string,
  fenAfter?: string
): { isBook: boolean; eco?: string; name?: string } {
  if (!isBookInitialized) {
    initOpeningBook();
  }

  const entryAfter = fenAfter ? bookCache.get(normalizeFen(fenAfter)) : undefined;
  const reached = entryAfter?.name ? { eco: entryAfter.eco, name: entryAfter.name } : {};

  const entryBefore = bookCache.get(normalizeFen(fenBefore));
  if (entryBefore) {
    const san = toBookSan(fenBefore, moveSan);
    if (entryBefore.validMoves.has(san) || entryBefore.eval.bestMoveSan === san) {
      return { isBook: true, ...reached };
    }
  }

  // Playing this move arrives at an established opening position (e.g. by transposition)
  if (entryAfter) {
    return { isBook: true, ...reached };
  }

  return { isBook: false };
}

/**
 * The opening to show for a game: the one found in the openings database, which names the start screen, the
 * board and the summary the same way; the PGN header only when the database knows nothing of the game.
 * The name and the ECO code always come from the same source.
 */
export function chooseOpening(
  detected: { eco: string; name: string } | null,
  header: { opening?: string; eco?: string }
): { eco?: string; name: string } | null {
  if (detected) return { eco: detected.eco, name: detected.name };
  if (header.opening) return { eco: header.eco, name: header.opening };
  return null;
}

/**
 * Analyzes the played sequence of positions to identify the exact opening and ECO code
 * using the Lichess master openings database.
 */
export function identifyGameOpening(fensAfter: string[]): { eco: string; name: string } | null {
  if (!isBookInitialized) {
    initOpeningBook();
  }

  // Scan backwards from ply 35 down to find the deepest recognized named theoretical variation
  const maxScan = Math.min(fensAfter.length - 1, 35);
  for (let i = maxScan; i >= 0; i--) {
    const norm = normalizeFen(fensAfter[i]);
    const entry = bookCache.get(norm);
    if (entry && entry.eco && entry.name) {
      return {
        eco: entry.eco,
        name: entry.name,
      };
    }
  }

  return null;
}
