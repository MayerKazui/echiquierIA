import { jsPDF } from 'jspdf';
import { GameAnalysisResult, MoveAnalysis } from '../types/chess';

export function generateChessAnalysisPdf(analysis: GameAnalysisResult) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const { metadata, moves, statsWhite, statsBlack, aiSummary } = analysis;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;

  // Colors
  const darkBg: [number, number, number] = [15, 23, 42]; // #0f172a
  const indigoPrimary: [number, number, number] = [79, 70, 229]; // #4f46e5
  const emeraldAccent: [number, number, number] = [16, 185, 129]; // #10b981
  const roseAccent: [number, number, number] = [244, 63, 94]; // #f43f5e
  const amberAccent: [number, number, number] = [245, 158, 11]; // #f59e0b
  const slateText: [number, number, number] = [51, 65, 85]; // #334155
  const slateLight: [number, number, number] = [241, 245, 249]; // #f1f5f9
  const borderGray: [number, number, number] = [203, 213, 225]; // #cbd5e1

  // ==================== PAGE 1 ====================
  // Header Banner
  doc.setFillColor(...indigoPrimary);
  doc.rect(0, 0, pageWidth, 28, 'F');

  // Title
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('RAPPORT D’ANALYSE ÉCHIQUÉENNE', margin, 12);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(224, 231, 255);
  doc.text('Moteur Stockfish & Intelligence Artificielle Pédagogique', margin, 18);

  const printDate = new Date().toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  doc.setFontSize(8);
  doc.text(`Édité le ${printDate}`, pageWidth - margin, 18, { align: 'right' });

  let y = 35;

  // Metadata Card
  doc.setFillColor(...slateLight);
  doc.setDrawColor(...borderGray);
  doc.roundedRect(margin, y, contentWidth, 22, 2, 2, 'FD');

  doc.setTextColor(...darkBg);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  const whiteTitle = `${metadata.white || 'Blancs'} ${metadata.whiteElo ? `(${metadata.whiteElo})` : ''}`;
  const blackTitle = `${metadata.black || 'Noirs'} ${metadata.blackElo ? `(${metadata.blackElo})` : ''}`;
  doc.text(`${whiteTitle}  vs  ${blackTitle}`, margin + 5, y + 8);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...slateText);
  const openingText = metadata.opening ? ` · Ouv. : ${metadata.eco ? `[${metadata.eco}] ` : ''}${metadata.opening}` : '';
  const eventInfo = `${metadata.event || 'Partie d’échecs'} · ${metadata.site || 'En ligne'}${openingText}`;
  doc.text(eventInfo, margin + 5, y + 15);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...indigoPrimary);
  doc.text(`Résultat : ${metadata.result || '*'}`, pageWidth - margin - 5, y + 12, { align: 'right' });

  y += 28;

  // Section 1: Key Statistics
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...darkBg);
  doc.text('1. STATISTIQUES CLÉS & PRÉCISION', margin, y);
  y += 5;

  // Stats Table Header
  const colWidth = contentWidth / 3;
  doc.setFillColor(226, 232, 240);
  doc.rect(margin, y, contentWidth, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...slateText);
  doc.text('MÉTRIQUE', margin + 4, y + 5);
  doc.text('BLANCS', margin + colWidth + 4, y + 5);
  doc.text('NOIRS', margin + colWidth * 2 + 4, y + 5);
  y += 7;

  const statRows = [
    { label: 'Précision globale (CAPS)', white: `${statsWhite.accuracy}%`, black: `${statsBlack.accuracy}%`, highlight: true },
    { label: 'Gaffes critiques', white: `${statsWhite.blunders + statsWhite.missedWins}`, black: `${statsBlack.blunders + statsBlack.missedWins}`, isBad: true },
    { label: 'Erreurs', white: `${statsWhite.mistakes}`, black: `${statsBlack.mistakes}`, isWarning: true },
    { label: 'Imprécisions', white: `${statsWhite.inaccuracies}`, black: `${statsBlack.inaccuracies}` },
    { label: 'Meilleurs & Brillants', white: `${statsWhite.best + statsWhite.brilliant}`, black: `${statsBlack.best + statsBlack.brilliant}`, isGood: true },
    { label: 'Perte moyenne en centipions (ACPL)', white: `${(statsWhite.avgCentipawnLoss / 100).toFixed(1)} pions`, black: `${(statsBlack.avgCentipawnLoss / 100).toFixed(1)} pions` },
  ];

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);

  statRows.forEach((row, idx) => {
    if (idx % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, y, contentWidth, 6.5, 'F');
    }
    doc.setTextColor(...slateText);
    if (row.highlight) {
      doc.setFont('helvetica', 'bold');
    } else {
      doc.setFont('helvetica', 'normal');
    }

    doc.text(row.label, margin + 4, y + 4.5);

    if (row.isBad) {
      doc.setTextColor(...roseAccent);
      doc.setFont('helvetica', 'bold');
    } else if (row.isWarning) {
      doc.setTextColor(...amberAccent);
      doc.setFont('helvetica', 'bold');
    } else if (row.isGood) {
      doc.setTextColor(...emeraldAccent);
      doc.setFont('helvetica', 'bold');
    }

    doc.text(row.white, margin + colWidth + 4, y + 4.5);
    doc.text(row.black, margin + colWidth * 2 + 4, y + 4.5);

    y += 6.5;
  });

  // Table border
  doc.setDrawColor(...borderGray);
  doc.rect(margin, y - 7 - statRows.length * 6.5, contentWidth, 7 + statRows.length * 6.5);

  y += 7;

  // Section 2: Evaluation Chart
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...darkBg);
  doc.text('2. COURBE D’ÉVALUATION DU MATCH', margin, y);
  y += 5;

  const chartHeight = 36;
  const chartWidth = contentWidth;
  const zeroLineY = y + chartHeight / 2;

  // Background box for chart
  doc.setFillColor(15, 23, 42); // dark background like in app
  doc.rect(margin, y, chartWidth, chartHeight, 'F');

  // Zero axis line
  doc.setDrawColor(100, 116, 139);
  doc.setLineDashPattern([1, 1], 0);
  doc.line(margin, zeroLineY, margin + chartWidth, zeroLineY);
  doc.setLineDashPattern([], 0); // reset dash

  // Chart Labels
  doc.setTextColor(148, 163, 184);
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'bold');
  doc.text('+6.0 Blancs', margin + 3, y + 6);
  doc.text('0.0 Égalité', margin + 3, zeroLineY - 1);
  doc.text('-6.0 Noirs', margin + 3, y + chartHeight - 2);

  // Draw Stockfish Evaluation Curve
  if (moves.length > 0) {
    const MAX_CP = 600;
    const points: Array<{ x: number; y: number; m: MoveAnalysis }> = moves.map((m, index) => {
      const px = margin + 18 + (index / Math.max(1, moves.length - 1)) * (chartWidth - 24);
      const clampedEval = Math.max(-MAX_CP, Math.min(MAX_CP, m.evalAfter));
      const py = zeroLineY - (clampedEval / MAX_CP) * (chartHeight / 2 - 4);
      return { x: px, y: py, m };
    });

    // Draw curve
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.4);
    for (let i = 0; i < points.length - 1; i++) {
      doc.line(points[i].x, points[i].y, points[i + 1].x, points[i + 1].y);
    }

    // Draw dots for blunders and mistakes
    points.forEach((p) => {
      const isBlunder = p.m.classification === 'blunder' || p.m.classification === 'missedWin';
      const isMistake = p.m.classification === 'mistake';

      if (isBlunder) {
        doc.setFillColor(...roseAccent);
        doc.circle(p.x, p.y, 1.1, 'F');
      } else if (isMistake) {
        doc.setFillColor(...amberAccent);
        doc.circle(p.x, p.y, 0.9, 'F');
      }
    });
  }

  y += chartHeight + 8;

  // Section 3: Major Errors & Tactical Critical Moments
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...darkBg);
  doc.text('3. MOMENTS DÉCISIFS & ERREURS MAJEURES', margin, y);
  y += 5;

  const criticalMoves = moves.filter(
    (m) => m.classification === 'blunder' || m.classification === 'mistake' || m.classification === 'missedWin'
  );

  if (criticalMoves.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(...slateText);
    doc.text('Aucune gaffe ou erreur majeure détectée. Partie remarquablement précise !', margin, y + 4);
    y += 10;
  } else {
    // Show top critical moments that fit on page 1 (or 3-4 key ones)
    const page1Moves = criticalMoves.slice(0, 4);

    page1Moves.forEach((cm) => {
      const isBlunder = cm.classification === 'blunder' || cm.classification === 'missedWin';
      const badgeColor = isBlunder ? roseAccent : amberAccent;
      const badgeLabel = isBlunder ? 'GAFFE' : 'ERREUR';
      const playerColor = cm.color === 'w' ? 'Blancs' : 'Noirs';

      // Card container
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(...borderGray);
      doc.roundedRect(margin, y, contentWidth, 23, 1.5, 1.5, 'FD');

      // Left vertical accent stripe
      doc.setFillColor(...badgeColor);
      doc.rect(margin, y, 2.5, 23, 'F');

      // Title line: Move number, Player, Badge
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...darkBg);
      doc.text(`Coup ${cm.moveNumber} (${playerColor})`, margin + 6, y + 5.5);

      // Badge
      doc.setFillColor(...badgeColor);
      doc.roundedRect(margin + 42, y + 2, 18, 4.5, 1, 1, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(7);
      doc.text(badgeLabel, margin + 51, y + 5.2, { align: 'center' });

      // Centipawn loss and think time info
      doc.setTextColor(...roseAccent);
      doc.setFontSize(7.5);
      const thinkLabel = cm.thinkTimeFormatted ? ` | Temps: ${cm.thinkTimeFormatted}${cm.isLongThink ? ' (!)' : ''}` : '';
      doc.text(`Perte : -${(cm.centipawnLoss / 100).toFixed(1)} pions${thinkLabel}`, pageWidth - margin - 4, y + 5.5, { align: 'right' });

      // Move comparison line
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(...slateText);
      doc.text(`Coup joué :`, margin + 6, y + 11.5);
      doc.setTextColor(...roseAccent);
      doc.text(`${cm.san} (${cm.from} ➔ ${cm.to})`, margin + 27, y + 11.5);

      doc.setTextColor(...slateText);
      doc.text(`Alternative Stockfish :`, margin + 65, y + 11.5);
      doc.setTextColor(...emeraldAccent);
      doc.text(`${cm.bestMoveSan || cm.bestMoveUci} (${cm.bestMoveFrom} ➔ ${cm.bestMoveTo})`, margin + 104, y + 11.5);

      // AI pedagogical concept / explanation
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(71, 85, 105);

      const explanation = cm.aiExplanation
        ? `Idée : ${cm.aiExplanation.concept} — ${cm.aiExplanation.whyBestIsBetter || cm.aiExplanation.whyPlayedIsBad}`
        : cm.pv.length > 0
        ? `Variante recommandée : ${cm.pv.slice(0, 5).join(' ')}`
        : `Le coup joué concède l'avantage alors que ${cm.bestMoveSan} stabilisait la position.`;

      const truncatedExp = doc.splitTextToSize(explanation, contentWidth - 10);
      doc.text(truncatedExp[0] || '', margin + 6, y + 17.5);

      y += 26;
    });
  }

  // Footer Page 1
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);
  doc.text('Page 1 / 2 — Échiquier IA Stockfish & Gemini Coach', margin, pageHeight - 8);

  // ==================== PAGE 2 ====================
  doc.addPage();

  // Header Banner Page 2
  doc.setFillColor(...indigoPrimary);
  doc.rect(0, 0, pageWidth, 16, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('RAPPORT D’ANALYSE ÉCHIQUÉENNE — SUITE & BILAN DU COACH', margin, 11);

  y = 24;

  // Remaining critical moments if any
  if (criticalMoves.length > 4) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...darkBg);
    doc.text(`AUTRES ERREURS IDENTIFIÉES (${criticalMoves.length - 4} restantes)`, margin, y);
    y += 5;

    const remainingMoves = criticalMoves.slice(4, 8);
    remainingMoves.forEach((cm) => {
      const isBlunder = cm.classification === 'blunder' || cm.classification === 'missedWin';
      const badgeColor = isBlunder ? roseAccent : amberAccent;
      const badgeLabel = isBlunder ? 'GAFFE' : 'ERREUR';
      const playerColor = cm.color === 'w' ? 'Blancs' : 'Noirs';

      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(...borderGray);
      doc.roundedRect(margin, y, contentWidth, 20, 1.5, 1.5, 'FD');

      doc.setFillColor(...badgeColor);
      doc.rect(margin, y, 2.5, 20, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(...darkBg);
      doc.text(`Coup ${cm.moveNumber} (${playerColor}) - ${badgeLabel}`, margin + 6, y + 5);

      doc.setTextColor(...roseAccent);
      doc.setFontSize(7.5);
      const page2Think = cm.thinkTimeFormatted ? ` | ${cm.thinkTimeFormatted}${cm.isLongThink ? ' (!)' : ''}` : '';
      doc.text(`-${(cm.centipawnLoss / 100).toFixed(1)} pions${page2Think}`, pageWidth - margin - 4, y + 5, { align: 'right' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...slateText);
      doc.text(`Joué : ${cm.san}  |  Meilleur : ${cm.bestMoveSan}`, margin + 6, y + 10.5);

      const exp = cm.aiExplanation
        ? cm.aiExplanation.concept
        : cm.pv.length > 0 ? `Ligne : ${cm.pv.slice(0, 4).join(' ')}` : '';
      doc.setFontSize(7.5);
      doc.text(exp, margin + 6, y + 15.5);

      y += 23;
    });

    y += 4;
  }

  // Section 4: Pedagogical Coaching Report & Advice
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...darkBg);
  doc.text('4. BILAN DU GRAND MAÎTRE & AXES D’AMÉLIORATION', margin, y);
  y += 6;

  // AI Narrative Summary Card
  doc.setFillColor(...slateLight);
  doc.setDrawColor(...borderGray);
  doc.roundedRect(margin, y, contentWidth, 28, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...indigoPrimary);
  doc.text(aiSummary?.title || 'Synthèse Globale de la Partie', margin + 5, y + 7);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...slateText);
  const narrative = aiSummary?.narrative ||
    `Cette partie a mis en évidence un duel tactique intense. Les Blancs (${statsWhite.accuracy}% de précision) et les Noirs (${statsBlack.accuracy}%) ont disputé des positions dynamiques où les moments clés ont fait pencher l'évaluation.`;
  const splitNarrative = doc.splitTextToSize(narrative, contentWidth - 10);
  doc.text(splitNarrative.slice(0, 3), margin + 5, y + 13);

  y += 34;

  // Strengths & Weaknesses 2-Column Grid
  const halfColWidth = (contentWidth - 6) / 2;

  // Strengths Box
  doc.setFillColor(240, 253, 244); // emerald-50
  doc.setDrawColor(167, 243, 208); // emerald-200
  doc.roundedRect(margin, y, halfColWidth, 42, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...emeraldAccent);
  doc.text('POINTS FORTS OBSERVÉS', margin + 5, y + 7);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...slateText);
  const strengths = aiSummary?.strengthsWhite || [
    'Bonne combativité au centre en début de partie',
    'Recherche d\'initiative et pression tactique',
    'Création de contre-chances lors des transitions',
  ];
  strengths.slice(0, 3).forEach((s, idx) => {
    doc.text(`• ${s}`, margin + 5, y + 14 + idx * 8, { maxWidth: halfColWidth - 10 });
  });

  // Weaknesses Box
  const col2X = margin + halfColWidth + 6;
  doc.setFillColor(255, 241, 242); // rose-50
  doc.setDrawColor(254, 205, 211); // rose-200
  doc.roundedRect(col2X, y, halfColWidth, 42, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...roseAccent);
  doc.text('AXES D’AMÉLIORATION PRIORITAIRES', col2X + 5, y + 7);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...slateText);
  const weaknesses = aiSummary?.weaknessesWhite || [
    'Surveiller les pièces non protégées et surchargées',
    'Approfondir le calcul des réponses forcées adverses',
    'Mieux convertir les positions gagnantes',
  ];
  weaknesses.slice(0, 3).forEach((w, idx) => {
    doc.text(`• ${w}`, col2X + 5, y + 14 + idx * 8, { maxWidth: halfColWidth - 10 });
  });

  y += 48;

  // Training Advice Cards
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(...darkBg);
  doc.text('PROGRAMME D’ENTRAÎNEMENT RECOMMANDÉ', margin, y);
  y += 5;

  const trainingAdvice = aiSummary?.trainingAdvice || [
    'Résoudre quotidiennement des exercices sur les clouages et déviations.',
    'Analyser ses parties lentes sans moteur avant de vérifier avec Stockfish.',
    'Travailler les finales de tours théoriques élémentaires.',
  ];

  const cardWidth = (contentWidth - 6) / 3;
  trainingAdvice.slice(0, 3).forEach((advice, idx) => {
    const cardX = margin + idx * (cardWidth + 3);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(...borderGray);
    doc.roundedRect(cardX, y, cardWidth, 34, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...indigoPrimary);
    doc.text(`Conseil #${idx + 1}`, cardX + 4, y + 6);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...slateText);
    const splitAdvice = doc.splitTextToSize(advice, cardWidth - 8);
    doc.text(splitAdvice, cardX + 4, y + 12);
  });

  // Footer Page 2
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);
  doc.text('Page 2 / 2 — Rapport généré par Échiquier IA & Stockfish', margin, pageHeight - 8);

  // Trigger download in browser
  const safeFilename = `Analyse_${(metadata.white || 'Blancs').replace(/\s+/g, '_')}_vs_${(metadata.black || 'Noirs').replace(/\s+/g, '_')}.pdf`;
  doc.save(safeFilename);
}
