import { Chess, Square } from 'chess.js';

export interface PawnInfo {
  square: string;
  file: string; // 'a'..'h'
  rank: number; // 1..8
  fileIdx: number; // 0..7
  color: 'w' | 'b';
  isPassed: boolean;
  isIsolated: boolean;
  isDoubled: boolean;
  isBackward: boolean;
  isHanging: boolean;
}

export interface OutpostSquare {
  square: string;
  color: 'w' | 'b'; // Which side benefits from this outpost
  rank: number;
  file: string;
  isProtectedByPawn: boolean;
  description: string;
}

export interface PawnBreak {
  fromSquare: string;
  toSquare: string;
  color: 'w' | 'b';
  san: string;
  targetPawnSquare: string;
  description: string;
  isAvailableNow: boolean;
}

export interface PawnStructureAnalysis {
  name: string;
  category: string;
  description: string;
  whitePawns: PawnInfo[];
  blackPawns: PawnInfo[];
  whiteIslands: number;
  blackIslands: number;
  whitePassedCount: number;
  blackPassedCount: number;
  whiteIsolatedCount: number;
  blackIsolatedCount: number;
  whiteDoubledCount: number;
  blackDoubledCount: number;
  whiteBackwardCount: number;
  blackBackwardCount: number;
  outposts: OutpostSquare[];
  breaks: PawnBreak[];
  whitePlan: string;
  blackPlan: string;
  centerTension: 'locked' | 'open' | 'semi-open' | 'fluid';
  majorityAdvantage: {
    side: 'white' | 'black' | 'equal';
    wing: 'queenside' | 'kingside' | 'center' | 'none';
    description: string;
  };
}

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

/**
 * Extracts all pawns of a given color and their positions.
 */
function extractPawns(chess: Chess, color: 'w' | 'b'): PawnInfo[] {
  const pawns: PawnInfo[] = [];

  for (let f = 0; f < 8; f++) {
    const file = FILES[f];
    for (let rank = 1; rank <= 8; rank++) {
      const square = `${file}${rank}` as Square;
      const piece = chess.get(square);
      if (piece && piece.type === 'p' && piece.color === color) {
        pawns.push({
          square,
          file,
          rank,
          fileIdx: f,
          color,
          isPassed: false,
          isIsolated: false,
          isDoubled: false,
          isBackward: false,
          isHanging: false,
        });
      }
    }
  }

  // Calculate Doubled, Isolated, Passed, Backward, Hanging
  const enemyColor = color === 'w' ? 'b' : 'w';
  const enemyPawnsMap = new Map<string, number[]>(); // file -> ranks of enemy pawns
  const friendlyPawnsMap = new Map<string, number[]>(); // file -> ranks of friendly pawns

  for (let f = 0; f < 8; f++) {
    enemyPawnsMap.set(FILES[f], []);
    friendlyPawnsMap.set(FILES[f], []);
  }

  for (let f = 0; f < 8; f++) {
    const file = FILES[f];
    for (let rank = 1; rank <= 8; rank++) {
      const p = chess.get(`${file}${rank}` as Square);
      if (p && p.type === 'p') {
        if (p.color === enemyColor) {
          enemyPawnsMap.get(file)!.push(rank);
        } else {
          friendlyPawnsMap.get(file)!.push(rank);
        }
      }
    }
  }

  for (const pawn of pawns) {
    const fIdx = pawn.fileIdx;
    const sameFileFriendly = friendlyPawnsMap.get(pawn.file)!;
    pawn.isDoubled = sameFileFriendly.length > 1;

    // Isolated: No friendly pawns on adjacent files (left and right)
    const leftFile = fIdx > 0 ? friendlyPawnsMap.get(FILES[fIdx - 1])! : [];
    const rightFile = fIdx < 7 ? friendlyPawnsMap.get(FILES[fIdx + 1])! : [];
    pawn.isIsolated = leftFile.length === 0 && rightFile.length === 0;

    // Passed: No enemy pawns in front on same file or adjacent files
    let isPassed = true;
    const checkFiles = [
      enemyPawnsMap.get(pawn.file)!,
      fIdx > 0 ? enemyPawnsMap.get(FILES[fIdx - 1])! : [],
      fIdx < 7 ? enemyPawnsMap.get(FILES[fIdx + 1])! : [],
    ];

    for (const enemyRanks of checkFiles) {
      for (const enemyRank of enemyRanks) {
        if (color === 'w' && enemyRank > pawn.rank) {
          isPassed = false;
          break;
        } else if (color === 'b' && enemyRank < pawn.rank) {
          isPassed = false;
          break;
        }
      }
      if (!isPassed) break;
    }
    pawn.isPassed = isPassed;

    // Backward: No friendly pawns on adjacent files that are behind or on same rank,
    // and the push square is controlled by an enemy pawn
    if (!pawn.isIsolated && !pawn.isPassed) {
      const adjacentBehindFriendly = [...leftFile, ...rightFile].some((r) =>
        color === 'w' ? r <= pawn.rank : r >= pawn.rank
      );

      if (!adjacentBehindFriendly) {
        const nextRank = color === 'w' ? pawn.rank + 1 : pawn.rank - 1;
        const enemyControlsStopSquare = (fIdx > 0 && enemyPawnsMap.get(FILES[fIdx - 1])!.includes(color === 'w' ? nextRank + 1 : nextRank - 1)) ||
          (fIdx < 7 && enemyPawnsMap.get(FILES[fIdx + 1])!.includes(color === 'w' ? nextRank + 1 : nextRank - 1));

        pawn.isBackward = enemyControlsStopSquare;
      }
    }

    // Hanging pawns: c and d pawns on the same or adjacent ranks without neighbor pawns on b or e
    if ((pawn.file === 'c' || pawn.file === 'd') && !pawn.isIsolated) {
      const bPawns = friendlyPawnsMap.get('b')!;
      const ePawns = friendlyPawnsMap.get('e')!;
      const otherFile = pawn.file === 'c' ? 'd' : 'c';
      const otherPawns = friendlyPawnsMap.get(otherFile)!;

      if (bPawns.length === 0 && ePawns.length === 0 && otherPawns.length > 0) {
        pawn.isHanging = true;
      }
    }
  }

  return pawns;
}

/**
 * Calculates pawn islands: number of isolated groups of adjacent files.
 */
function countPawnIslands(pawns: PawnInfo[]): number {
  if (pawns.length === 0) return 0;
  const filesWithPawns = new Set<number>(pawns.map((p) => p.fileIdx));

  let islands = 0;
  let inIsland = false;

  for (let f = 0; f < 8; f++) {
    if (filesWithPawns.has(f)) {
      if (!inIsland) {
        islands++;
        inIsland = true;
      }
    } else {
      inIsland = false;
    }
  }

  return islands;
}

/**
 * Detects strong outpost squares for knights/bishops.
 */
function detectOutposts(chess: Chess, whitePawns: PawnInfo[], blackPawns: PawnInfo[]): OutpostSquare[] {
  const outposts: OutpostSquare[] = [];

  // 1. White outposts (typically ranks 4, 5, 6)
  for (let f = 1; f < 7; f++) {
    const file = FILES[f];
    for (let r = 4; r <= 6; r++) {
      const sq = `${file}${r}`;
      // Can black pawns ever attack this square?
      const enemyLeft = f > 0 ? blackPawns.filter((p) => p.fileIdx === f - 1 && p.rank > r) : [];
      const enemyRight = f < 7 ? blackPawns.filter((p) => p.fileIdx === f + 1 && p.rank > r) : [];

      if (enemyLeft.length === 0 && enemyRight.length === 0) {
        // Protected by friendly pawn?
        const isProtected = whitePawns.some(
          (p) => (p.fileIdx === f - 1 || p.fileIdx === f + 1) && p.rank === r - 1
        );

        if (isProtected || r >= 5) {
          outposts.push({
            square: sq,
            color: 'w',
            rank: r,
            file,
            isProtectedByPawn: isProtected,
            description: `Avant-poste ${sq} pour les Blancs (inattaquable par les pions noirs)`,
          });
        }
      }
    }
  }

  // 2. Black outposts (ranks 5, 4, 3)
  for (let f = 1; f < 7; f++) {
    const file = FILES[f];
    for (let r = 3; r <= 5; r++) {
      const sq = `${file}${r}`;
      // Can white pawns ever attack this square?
      const enemyLeft = f > 0 ? whitePawns.filter((p) => p.fileIdx === f - 1 && p.rank < r) : [];
      const enemyRight = f < 7 ? whitePawns.filter((p) => p.fileIdx === f + 1 && p.rank < r) : [];

      if (enemyLeft.length === 0 && enemyRight.length === 0) {
        const isProtected = blackPawns.some(
          (p) => (p.fileIdx === f - 1 || p.fileIdx === f + 1) && p.rank === r + 1
        );

        if (isProtected || r <= 4) {
          outposts.push({
            square: sq,
            color: 'b',
            rank: r,
            file,
            isProtectedByPawn: isProtected,
            description: `Avant-poste ${sq} pour les Noirs (inattaquable par les pions blancs)`,
          });
        }
      }
    }
  }

  // Deduplicate and filter out squares occupied by friendly pawns
  return outposts.filter((o) => {
    const p = chess.get(o.square as Square);
    return !(p && p.type === 'p');
  }).slice(0, 4);
}

/**
 * Detects tactical and strategic pawn breaks (leviers de pions).
 */
function detectPawnBreaks(chess: Chess, whitePawns: PawnInfo[], blackPawns: PawnInfo[]): PawnBreak[] {
  const breaks: PawnBreak[] = [];
  const legalMoves = chess.moves({ verbose: true });

  // Look for friendly pawn advances that can challenge or attack an enemy pawn
  for (const move of legalMoves) {
    if (move.piece === 'p') {
      const isWhite = move.color === 'w';
      const toFileIdx = FILES.indexOf(move.to[0]);
      const toRank = parseInt(move.to[1], 10);
      const enemyPawns = isWhite ? blackPawns : whitePawns;

      // Does landing on move.to attack an enemy pawn or challenge an adjacent pawn?
      const attackedPawn = enemyPawns.find((ep) => {
        const fileDiff = Math.abs(ep.fileIdx - toFileIdx);
        const rankDiff = isWhite ? ep.rank - toRank : toRank - ep.rank;
        return fileDiff === 1 && rankDiff === 1;
      });

      const faceToFacePawn = enemyPawns.find((ep) => {
        const fileDiff = Math.abs(ep.fileIdx - toFileIdx);
        const rankDiff = isWhite ? ep.rank - toRank : toRank - ep.rank;
        return fileDiff === 0 && rankDiff === 1;
      });

      if (attackedPawn || faceToFacePawn) {
        const target = (attackedPawn || faceToFacePawn)!;
        breaks.push({
          fromSquare: move.from,
          toSquare: move.to,
          color: move.color,
          san: move.san,
          targetPawnSquare: target.square,
          description: `Rupture ${move.san} défiant le pion ${target.square.toUpperCase()}`,
          isAvailableNow: true,
        });
      }
    }
  }

  // Deduplicate by toSquare
  const uniqueBreaks: PawnBreak[] = [];
  const seen = new Set<string>();
  for (const b of breaks) {
    if (!seen.has(b.toSquare)) {
      seen.add(b.toSquare);
      uniqueBreaks.push(b);
    }
  }

  return uniqueBreaks.slice(0, 4);
}

/**
 * Classifies the pawn structure into well-known classical chess structures.
 */
function classifyStructure(whitePawns: PawnInfo[], blackPawns: PawnInfo[]): {
  name: string;
  category: string;
  description: string;
  whitePlan: string;
  blackPlan: string;
  centerTension: 'locked' | 'open' | 'semi-open' | 'fluid';
} {
  const hasWP = (f: string, r: number) => whitePawns.some((p) => p.file === f && p.rank === r);
  const hasBP = (f: string, r: number) => blackPawns.some((p) => p.file === f && p.rank === r);

  // 1. Structure Chaîne Française (e5/d4 vs e6/d5)
  if (hasWP('e', 5) && hasWP('d', 4) && hasBP('d', 5) && hasBP('e', 6)) {
    return {
      name: 'Chaîne de pions Française',
      category: 'Centre verrouillé',
      description: 'Chaîne de pions rigide avec avantage d\'espace blanc à l\'aile roi et pression noire sur le point d4.',
      whitePlan: 'Soutenir la chaîne avec c3 et f4, puis organiser une attaque à l\'aile roi via le levier f5 ou g4.',
      blackPlan: 'Démanteler la base de la chaîne avec la rupture c5, puis miner la pointe avec f6.',
      centerTension: 'locked',
    };
  }

  // 2. Structure Carlsbad (d4/c3 vs d5/e6/c6, pion e4 échangé)
  if (
    hasWP('d', 4) &&
    hasWP('c', 3) &&
    !hasWP('e', 4) &&
    !hasWP('e', 5) &&
    hasBP('d', 5) &&
    hasBP('e', 6) &&
    hasBP('c', 6)
  ) {
    return {
      name: 'Structure Carlsbad',
      category: 'Gambit Dame / Caro-Kann d\'échange',
      description: 'Structure asymétrique classique permettant l\'attaque de minorité ou la poussée centrale e4.',
      whitePlan: 'Attaque de minorité à l\'aile dame avec la poussée b4-b5 pour créer un pion faible arriéré en c6, ou levier e4.',
      blackPlan: 'Contre-attaque à l\'aile roi, occupation de l\'avant-poste e4 avec un cavalier, ou rupture c5.',
      centerTension: 'semi-open',
    };
  }

  // 3. Structure Hérisson / Hedgehog (Noirs avec a6, b6, d6, e6 face à c4, e4)
  if (
    hasBP('a', 6) &&
    hasBP('b', 6) &&
    hasBP('d', 6) &&
    hasBP('e', 6) &&
    (hasWP('c', 4) || hasWP('e', 4))
  ) {
    return {
      name: 'Structure Hérisson (Hedgehog)',
      category: 'Système hypermoderne',
      description: 'Position noire ultra-compacte et hérissée d\'épines, prête à exploser par une rupture soudaine.',
      whitePlan: 'Maintenir la pression spatiale (Maróczy), éviter d\'autoriser les ruptures b5 ou d5, manœuvrer patiemment.',
      blackPlan: 'Attendre le moment opportun pour dynamiter le centre avec la rupture b5 ou d5.',
      centerTension: 'fluid',
    };
  }

  // 4. Structure Maróczy Bind (Blancs avec c4 et e4, Noirs avec d6 ou c6)
  if (hasWP('c', 4) && hasWP('e', 4) && !hasWP('d', 4)) {
    return {
      name: 'Étreinte de Maróczy',
      category: 'Contrôle spatial',
      description: 'Les pions blancs c4 et e4 contrôlent fermement la case d5, privant l\'adversaire de libération centrale.',
      whitePlan: 'Asphyxier les Noirs, échanger les pièces actives adverses et préparer une rupture à l\'aile avec f4 ou b4.',
      blackPlan: 'Chercher à libérer la position par des échanges de pièces mineures ou préparer les leviers b5 ou f5.',
      centerTension: 'semi-open',
    };
  }

  // 5. Structure Pion Dame Isolé (PDI / IQP)
  const isWhiteIQP = whitePawns.some((p) => p.file === 'd' && p.isIsolated);
  const isBlackIQP = blackPawns.some((p) => p.file === 'd' && p.isIsolated);
  if (isWhiteIQP || isBlackIQP) {
    const iqpSide = isWhiteIQP ? 'Blancs' : 'Noirs';
    const oppSide = isWhiteIQP ? 'Noirs' : 'Blancs';
    return {
      name: `Pion Dame Isolé (${iqpSide})`,
      category: 'Dynamisme vs Faiblesse à long terme',
      description: `Le pion d${isWhiteIQP ? '4' : '5'} est isolé sans pions sur les colonnes adjacentes. Il offre de l\'espace et des lignes ouvertes pour l\'attaque.`,
      whitePlan: isWhiteIQP
        ? 'Exploiter l\'avant-poste e5 pour lancer une violente attaque de mat, ou pousser d5 pour percer.'
        : 'Bloquer la case d4 avec un cavalier, forcer les simplifications vers une finale gagnante.',
      blackPlan: isBlackIQP
        ? 'Créer des menaces tactiques rapides avec l\'avant-poste e4 et des lignes ouvertes.'
        : 'Établir un blocus solide sur la case d5, attaquer le pion d4 et échanger les pièces.',
      centerTension: 'open',
    };
  }

  // 6. Structure Pions Pendants (Hanging Pawns sur c4/d4 ou c5/d5)
  const isWhiteHanging = whitePawns.some((p) => p.isHanging);
  const isBlackHanging = blackPawns.some((p) => p.isHanging);
  if (isWhiteHanging || isBlackHanging) {
    return {
      name: `Pions Pendants (${isWhiteHanging ? 'Blancs' : 'Noirs'})`,
      category: 'Tension centrale dynamique',
      description: 'Deux pions centraux côte à côte contrôlent de nombreuses cases clés, mais sont vulnérables aux attaques de pièces.',
      whitePlan: isWhiteHanging
        ? 'Pousser d5 ou c5 au bon moment pour ouvrir le jeu ou créer un pion passé puissant.'
        : 'Clouer et fixer les pions pendants, puis les assiéger avec tours et pièces mineures.',
      blackPlan: isBlackHanging
        ? 'Pousser d4 ou c4 pour créer une percée victorieuse.'
        : 'Bloquer les pions pendants sur les cases blanches/noires et attaquer leur base.',
      centerTension: 'fluid',
    };
  }

  // 7. Structure Stonewall (f4/e3/d4/c3 ou f5/e6/d5/c6)
  if (hasWP('f', 4) && hasWP('e', 3) && hasWP('d', 4) && hasWP('c', 3)) {
    return {
      name: 'Mur de pierre (Stonewall Blanc)',
      category: 'Forteresse d\'attaque',
      description: 'Formation inexpugnable avec ancrage d\'un cavalier en e5, mais case e4 concédée à l\'adversaire.',
      whitePlan: 'Installer un cavalier indélogeable en e5, monter une attaque directe sur le roque avec Fd3, Tf3-h3 et Dh5.',
      blackPlan: 'Installer un cavalier sur le trou e4, contester le fou de cases blanches et échanger les pièces actives.',
      centerTension: 'locked',
    };
  }

  if (hasBP('f', 5) && hasBP('e', 6) && hasBP('d', 5) && hasBP('c', 6)) {
    return {
      name: 'Mur de pierre (Stonewall Noir)',
      category: 'Forteresse d\'attaque',
      description: 'Structure hollandaise solide avec verrouillage du centre et tremplin sur e4.',
      whitePlan: 'Exploiter le trou en e5, échanger les fous de cases noires et ouvrir le jeu à l\'aile dame.',
      blackPlan: 'Installer un cavalier en e4, transférer la dame en h5 et attaquer le roi blanc.',
      centerTension: 'locked',
    };
  }

  // 8. Structure Sicilienne Schéveningue / Dragon (e6/d6 ou g6/d6)
  if (hasBP('c', 5) || (hasBP('d', 6) && (hasBP('e', 6) || hasBP('g', 6)))) {
    return {
      name: 'Structure Sicilienne Ouverte',
      category: 'Déséquilibre asymétrique',
      description: 'Majorité centrale blanche (pion e4) contre colonne c semi-ouverte et majorité à l\'aile dame pour les Noirs.',
      whitePlan: 'Organiser une attaque rapide à l\'aile roi (poussées f4-f5 ou assaut avec g4-h4).',
      blackPlan: 'Contre-jeu énergique sur la colonne c, pression sur le cavalier c3 et poussée libératrice d5.',
      centerTension: 'open',
    };
  }

  // 9. Structure Espagnole / Ruy Lopez (e4/d3/c3 vs e5/d6)
  if (hasWP('e', 4) && hasWP('c', 3) && hasBP('e', 5)) {
    return {
      name: 'Structure Espagnole / Italienne',
      category: 'Centre mobile classique',
      description: 'Structure riche et manœuvrière favorisant les réorganisations de cavaliers et la rupture d4.',
      whitePlan: 'Préparer la poussée centrale d4 avec c3, recycler le cavalier b1 vers f5 via d2-f1-g3.',
      blackPlan: 'Contenir la poussée d4, renforcer la case e5 et chercher du contre-jeu à l\'aile dame via b5/c5.',
      centerTension: 'fluid',
    };
  }

  // Default: Structure standard / Équilibrée
  const totalCenterPawns =
    (hasWP('d', 4) ? 1 : 0) +
    (hasWP('e', 4) ? 1 : 0) +
    (hasBP('d', 5) ? 1 : 0) +
    (hasBP('e', 5) ? 1 : 0);

  return {
    name: totalCenterPawns >= 2 ? 'Structure Classique Centrale' : 'Structure Ouverte / Dynamique',
    category: 'Jeu de pièces & Manœuvres',
    description: 'Structure équilibrée sans déséquilibre majeur immédiat. Le placement et la coordination des pièces priment.',
    whitePlan: 'Contrôler les colonnes ouvertes avec les tours et chercher à créer un levier favorable.',
    blackPlan: 'Égaliser par des échanges coordonnés et contester les cases centrales.',
    centerTension: totalCenterPawns >= 3 ? 'locked' : 'open',
  };
}

/**
 * Calculates majority advantage (e.g. queenside pawn majority).
 */
function calculatePawnMajority(whitePawns: PawnInfo[], blackPawns: PawnInfo[]): {
  side: 'white' | 'black' | 'equal';
  wing: 'queenside' | 'kingside' | 'center' | 'none';
  description: string;
} {
  const countWing = (pawns: PawnInfo[], minF: number, maxF: number) =>
    pawns.filter((p) => p.fileIdx >= minF && p.fileIdx <= maxF).length;

  // Queenside: a, b, c (files 0, 1, 2)
  const wQ = countWing(whitePawns, 0, 2);
  const bQ = countWing(blackPawns, 0, 2);

  // Kingside: f, g, h (files 5, 6, 7)
  const wK = countWing(whitePawns, 5, 7);
  const bK = countWing(blackPawns, 5, 7);

  if (wQ > bQ && bK > wK) {
    return {
      side: 'white',
      wing: 'queenside',
      description: `Majorité blanche à l'aile dame (${wQ} contre ${bQ}) vs majorité noire à l'aile roi (${bK} contre ${wK})`,
    };
  } else if (bQ > wQ && wK > bK) {
    return {
      side: 'black',
      wing: 'queenside',
      description: `Majorité noire à l'aile dame (${bQ} contre ${wQ}) vs majorité blanche à l'aile roi (${wK} contre ${bK})`,
    };
  } else if (wQ > bQ) {
    return {
      side: 'white',
      wing: 'queenside',
      description: `Majorité blanche à l'aile dame (${wQ} pions vs ${bQ}) pouvant créer un pion passé éloigné`,
    };
  } else if (bQ > wQ) {
    return {
      side: 'black',
      wing: 'queenside',
      description: `Majorité noire à l'aile dame (${bQ} pions vs ${wQ}) pouvant créer un pion passé éloigné`,
    };
  } else if (wK > bK) {
    return {
      side: 'white',
      wing: 'kingside',
      description: `Majorité blanche à l'aile roi (${wK} pions vs ${bK})`,
    };
  } else if (bK > wK) {
    return {
      side: 'black',
      wing: 'kingside',
      description: `Majorité noire à l'aile roi (${bK} pions vs ${wK})`,
    };
  }

  return {
    side: 'equal',
    wing: 'none',
    description: 'Équilibre numérique des pions sur les deux ailes',
  };
}

/**
 * Main analysis function for the pawn skeleton of any position.
 */
export function analyzePawnSkeleton(fen: string): PawnStructureAnalysis {
  const chess = new Chess(fen);
  const whitePawns = extractPawns(chess, 'w');
  const blackPawns = extractPawns(chess, 'b');

  const whiteIslands = countPawnIslands(whitePawns);
  const blackIslands = countPawnIslands(blackPawns);

  const whitePassedCount = whitePawns.filter((p) => p.isPassed).length;
  const blackPassedCount = blackPawns.filter((p) => p.isPassed).length;

  const whiteIsolatedCount = whitePawns.filter((p) => p.isIsolated).length;
  const blackIsolatedCount = blackPawns.filter((p) => p.isIsolated).length;

  const whiteDoubledCount = whitePawns.filter((p) => p.isDoubled).length;
  const blackDoubledCount = blackPawns.filter((p) => p.isDoubled).length;

  const whiteBackwardCount = whitePawns.filter((p) => p.isBackward).length;
  const blackBackwardCount = blackPawns.filter((p) => p.isBackward).length;

  const outposts = detectOutposts(chess, whitePawns, blackPawns);
  const breaks = detectPawnBreaks(chess, whitePawns, blackPawns);
  const classification = classifyStructure(whitePawns, blackPawns);
  const majorityAdvantage = calculatePawnMajority(whitePawns, blackPawns);

  return {
    name: classification.name,
    category: classification.category,
    description: classification.description,
    whitePawns,
    blackPawns,
    whiteIslands,
    blackIslands,
    whitePassedCount,
    blackPassedCount,
    whiteIsolatedCount,
    blackIsolatedCount,
    whiteDoubledCount,
    blackDoubledCount,
    whiteBackwardCount,
    blackBackwardCount,
    outposts,
    breaks,
    whitePlan: classification.whitePlan,
    blackPlan: classification.blackPlan,
    centerTension: classification.centerTension,
    majorityAdvantage,
  };
}
