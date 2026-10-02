import { GameAnalysisResult } from '../types/chess';
import { moveRangeLabel, PhaseStat, PhaseStats } from './phaseStats';
import { toFrenchOpeningName } from './openingNames';

/** Plain-text summary of the game, ready to paste on Discord, WhatsApp or X. */
/** " (coups 1 à 9)" after the name of a phase, nothing when it was not played. */
const rangeOf = (stat: PhaseStat) => {
  const label = moveRangeLabel(stat);
  return label ? ` (${label})` : '';
};

export function buildGameSummary(analysis: GameAnalysisResult, phaseStats: PhaseStats): string {
  const { metadata, moves, statsWhite, statsBlack } = analysis;
  const whiteName = metadata.white || 'Blancs';
  const blackName = metadata.black || 'Noirs';
  const resultStr = metadata.result && metadata.result !== '*' ? `🏆 Résultat : ${metadata.result}\n` : '';
  const openingStr = metadata.opening
    ? `📖 Ouverture : ${toFrenchOpeningName(metadata.opening)}${metadata.eco ? ` [${metadata.eco}]` : ''}\n`
    : '';
  const { opening, middlegame, endgame } = phaseStats;

  return `♟️ Échiquier IA — Bilan de la partie
${whiteName} (${statsWhite.accuracy}%) vs ${blackName} (${statsBlack.accuracy}%)
${resultStr}${openingStr}⏱️ Durée : ${Math.ceil(moves.length / 2)} coups
⚪ Blancs : ${statsWhite.best + statsWhite.brilliant} meilleurs coups · ${statsWhite.inaccuracies} imprécision(s) · ${statsWhite.mistakes} erreur(s) · ${statsWhite.blunders} gaffe(s) · ${statsWhite.missedWins} occasion(s) manquée(s)
⚫ Noirs : ${statsBlack.best + statsBlack.brilliant} meilleurs coups · ${statsBlack.inaccuracies} imprécision(s) · ${statsBlack.mistakes} erreur(s) · ${statsBlack.blunders} gaffe(s) · ${statsBlack.missedWins} occasion(s) manquée(s)
${
  opening.whiteAccuracy !== null
    ? `\n📊 Précision par phase :
• Ouverture${rangeOf(opening)} : Blancs ${opening.whiteAccuracy ?? '-'}% | Noirs ${opening.blackAccuracy ?? '-'}%
• Milieu de jeu${rangeOf(middlegame)} : Blancs ${middlegame.whiteAccuracy ?? '-'}% | Noirs ${middlegame.blackAccuracy ?? '-'}%
• Finale${rangeOf(endgame)} : ${endgame.totalMoves > 0 ? `Blancs ${endgame.whiteAccuracy ?? '-'}% | Noirs ${endgame.blackAccuracy ?? '-'}%` : 'Non atteinte'}`
    : ''
}

Analysé avec Échiquier IA & Stockfish 19`;
}
