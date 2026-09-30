import { GameAnalysisResult } from '../types/chess';
import { PhaseStats } from './phaseStats';

/** Plain-text summary of the game, ready to paste on Discord, WhatsApp or X. */
export function buildGameSummary(analysis: GameAnalysisResult, phaseStats: PhaseStats): string {
  const { metadata, moves, statsWhite, statsBlack } = analysis;
  const whiteName = metadata.white || 'Blancs';
  const blackName = metadata.black || 'Noirs';
  const resultStr = metadata.result && metadata.result !== '*' ? `🏆 Résultat : ${metadata.result}\n` : '';
  const openingStr = metadata.opening
    ? `📖 Ouverture : ${metadata.opening}${metadata.eco ? ` [${metadata.eco}]` : ''}\n`
    : '';
  const { opening, middlegame, endgame } = phaseStats;

  return `♟️ Échiquier IA — Bilan de la partie
${whiteName} (${statsWhite.accuracy}%) vs ${blackName} (${statsBlack.accuracy}%)
${resultStr}${openingStr}⏱️ Durée : ${Math.ceil(moves.length / 2)} coups
⚪ Blancs : ${statsWhite.best + statsWhite.brilliant} meilleurs coups · ${statsWhite.inaccuracies} imprécision(s) · ${statsWhite.mistakes} erreur(s) · ${statsWhite.blunders + statsWhite.missedWins} gaffe(s)
⚫ Noirs : ${statsBlack.best + statsBlack.brilliant} meilleurs coups · ${statsBlack.inaccuracies} imprécision(s) · ${statsBlack.mistakes} erreur(s) · ${statsBlack.blunders + statsBlack.missedWins} gaffe(s)
${opening.whiteAccuracy !== null ? `\n📊 Précision par phase :
• Ouverture (coups 1-12) : Blancs ${opening.whiteAccuracy ?? '-'}% | Noirs ${opening.blackAccuracy ?? '-'}%
• Milieu de jeu (coups 13-30) : Blancs ${middlegame.whiteAccuracy ?? '-'}% | Noirs ${middlegame.blackAccuracy ?? '-'}%
• Finale (coups 31+) : ${endgame.totalMoves > 0 ? `Blancs ${endgame.whiteAccuracy ?? '-'}% | Noirs ${endgame.blackAccuracy ?? '-'}%` : 'Non atteinte'}` : ''}

Analysé avec Échiquier IA & Stockfish 19`;
}
