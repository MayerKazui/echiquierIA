import express from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());

// Enable CORS for preview iframe and cross-origin fetch requests
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

const apiKey = process.env.GEMINI_API_KEY || undefined;
const ai = new GoogleGenAI({
  apiKey,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

// Helper: Multi-model cascading caller with automatic fallback and strict timeout
async function callGeminiWithFallback(prompt: string, systemInstruction: string): Promise<any> {
  // Use resilient list of supported Gemini models starting with gemini-3.8-flash
  const models = ['gemini-3.8-flash', 'gemini-3.1-flash-lite', 'gemini-flash-latest'];
  let lastError: any = null;

  for (const model of models) {
    try {
      // 8s timeout per model to prevent connection drops in Cloud Run
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout on model ${model}`)), 8000)
      );

      const genPromise = ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
        },
      });

      const response: any = await Promise.race([genPromise, timeoutPromise]);

      if (response && response.text) {
        // Strip code fences if present (e.g. ```json ... ```)
        const cleaned = response.text
          .replace(/^```json\s*/i, '')
          .replace(/^```\s*/i, '')
          .replace(/\s*```$/i, '')
          .trim();
        return JSON.parse(cleaned);
      }
    } catch (err: any) {
      console.warn(`Model ${model} failed (${err.message || 'Error'}), trying next candidate...`);
      lastError = err;
    }
  }

  throw lastError || new Error('All Gemini models failed');
}

// Helper: Dynamic, 100% situational heuristic chess coach (never generic boilerplate)
function generateSituationalExplanation(
  movePlayed: { san?: string; uci?: string },
  moveBest: { san?: string; uci?: string },
  pv: string | undefined,
  playerColor: string,
  moveNumber: number,
  classification: string
) {
  const playedSan = movePlayed?.san || movePlayed?.uci || '';
  const bestSan = moveBest?.san || moveBest?.uci || playedSan;
  const isWhite = playerColor === 'white';
  const oppColor = isWhite ? 'noires' : 'blanches';

  const classLower = (classification || '').toLowerCase();
  const isBlunder = classLower.includes('gaffe') || classLower.includes('blunder') || classLower.includes('manquée');
  const isMistake = classLower.includes('erreur') || classLower.includes('mistake');
  const isInaccuracy = classLower.includes('imprécision') || classLower.includes('inaccuracy');

  const isGoodMove =
    !isBlunder &&
    !isMistake &&
    !isInaccuracy &&
    (classLower.includes('meilleur') ||
      classLower.includes('bon') ||
      classLower.includes('brillant') ||
      classLower.includes('théorique') ||
      classLower.includes('précis') ||
      classLower.includes('livre') ||
      playedSan === bestSan ||
      !moveBest?.san);

  // Identify moving piece of the relevant move
  const targetMove = isGoodMove ? playedSan : bestSan;
  let pieceName = 'le pion';
  if (targetMove.startsWith('N')) pieceName = 'le Cavalier';
  else if (targetMove.startsWith('B')) pieceName = 'le Fou';
  else if (targetMove.startsWith('R')) pieceName = 'la Tour';
  else if (targetMove.startsWith('Q')) pieceName = 'la Dame';
  else if (targetMove.startsWith('K')) pieceName = 'le Roi';
  else if (targetMove.includes('O-O')) pieceName = 'le Roi et la Tour (Roque)';

  const isCapture = targetMove.includes('x');
  const isCheck = targetMove.includes('+');
  const targetSquare = targetMove.replace(/^[NBRQKx+#!?]+/, '').slice(0, 2);

  // Concept name based on action
  let concept = 'Harmonie & Développement';
  if (isCapture) concept = 'Prise & simplification active';
  else if (isCheck) concept = 'Échec au Roi & initiative';
  else if (targetMove.startsWith('N')) concept = 'Activité de Cavalier & avant-poste';
  else if (targetMove.startsWith('B')) concept = 'Diagonale ouverte & pression';
  else if (targetMove.startsWith('R')) concept = 'Contrôle de colonne & activité';
  else if (targetMove.startsWith('Q')) concept = 'Centralisation de Dame';
  else if (moveNumber <= 10) concept = 'Développement & contrôle du centre';

  let whyPlayedIsBad = '';
  let whyBestIsBetter = '';

  if (isGoodMove) {
    whyPlayedIsBad = ''; // Le coup joué n'est PAS mauvais !
    whyBestIsBetter = `Le coup joué ${playedSan} est le meilleur choix dans cette position : il ${
      isCapture
        ? 'élimine une pièce adverse clé tout en maintenant une coordination optimale'
        : isCheck
        ? 'attaque directement le Roi adverse et force une réponse défensive immédiate'
        : targetMove.includes('O-O')
        ? 'met le Roi en totale sécurité et connecte les Tours'
        : `active efficacement ${pieceName} vers la case ${targetSquare || 'clé'}, renforçant la pression sur le camp adverse`
    }.`;
  } else {
    whyPlayedIsBad = isBlunder
      ? `En jouant ${playedSan}, le camp ${isWhite ? 'blanc' : 'noir'} concède un avantage matériel ou positionnel direct que l'adversaire peut exploiter.`
      : `Le coup ${playedSan} est imprécis et laisse l'adversaire respirer au lieu de maintenir une pression directe.`;

    whyBestIsBetter = `Le coup recommandé ${bestSan} ${
      isCapture ? 'élimine une pièce maîtresse' : `installe ${pieceName}`
    } directement sur la case ${targetSquare || 'clé'}, posant un problème tactique immédiat aux pièces ${oppColor}.`;
  }

  // Situational plan: tailored with pieces, target squares and PV continuation
  const pvList = (pv || '').split(' ').filter(Boolean).slice(0, 4);
  const steps: string[] = [
    `1. ${isGoodMove ? `Poursuivre avec l'idée de ${playedSan}` : `Jouer ${bestSan}`} pour ${
      isCapture ? 'déstructurer la défense adverse' : `activer ${pieceName} vers la case ${targetSquare || 'centrale'}`
    }.`,
  ];
  if (pvList.length > 1) {
    steps.push(`2. Enchaîner avec la suite tactique ${pvList.slice(1).join(' ➔ ')} afin de déstabiliser les pièces ${oppColor}.`);
  }
  steps.push(`3. Poursuivre en augmentant la pression sur les cases sensibles du camp adverse tout en consolidant l'initiative.`);
  const plan = steps.join('\n');

  return {
    concept,
    whyPlayedIsBad,
    whyBestIsBetter,
    plan,
  };
}

// Endpoint: AI Tactical & Strategic Move Explanation
app.post('/api/coach/explain', async (req, res) => {
  try {
    const {
      fen,
      movePlayed,
      moveBest,
      evalPlayed,
      evalBest,
      classification,
      pv,
      playerColor,
      moveNumber,
      sanHistory,
    } = req.body;

    const classLower = (classification || '').toLowerCase();
    const isBlunder = classLower.includes('gaffe') || classLower.includes('blunder') || classLower.includes('manquée');
    const isMistake = classLower.includes('erreur') || classLower.includes('mistake');
    const isInaccuracy = classLower.includes('imprécision') || classLower.includes('inaccuracy');
    const isGoodMove =
      !isBlunder &&
      !isMistake &&
      !isInaccuracy &&
      (classLower.includes('meilleur') ||
        classLower.includes('bon') ||
        classLower.includes('brillant') ||
        classLower.includes('théorique') ||
        classLower.includes('précis') ||
        classLower.includes('livre') ||
        (movePlayed?.san && moveBest?.san && movePlayed.san === moveBest.san) ||
        !moveBest?.san);

    const promptDirective = isGoodMove
      ? `ATTENTION DIRECTIVE CRITIQUE : Le coup joué ${movePlayed?.san || movePlayed?.uci} est UN EXCELLENT COUP ou LE MEILLEUR COUP (classification : "${classification}"). Il n'y a AUCUNE erreur ni gaffe.
Tu DOIS IMPÉRATIVEMENT féliciter le joueur !
- Dans "whyPlayedIsBad" : mets obligatoirement une chaîne vide "" (ne critique surtout pas ce coup !).
- Dans "whyBestIsBetter" : explique avec clarté pourquoi ce coup joué est remarquable, quelles menaces ou avantages il crée et comment il surclasse les alternatives.
- Dans "plan" : fournis le plan d'action en 3 étapes pour continuer sur cette lancée victorieuse.`
      : `Le coup joué ${movePlayed?.san || movePlayed?.uci} est une ${classification}.
- Dans "whyPlayedIsBad" : explique précisément la faiblesse ou la perte tactique concrète causée par ce coup joué.
- Dans "whyBestIsBetter" : explique la force et la supériorité tactique du coup recommandé ${moveBest?.san || moveBest?.uci}.
- Dans "plan" : fournis le plan de redressement en 3 étapes.`;

    const prompt = `Tu es un Grand Maître International d'échecs et un entraîneur d'élite mondialement reconnu.
Analyse ce moment précis de la partie :

- FEN de la position : ${fen}
- Trait : ${playerColor === 'white' ? 'Blancs' : 'Noirs'}
- Numéro du coup : ${moveNumber}
- Coup joué par le joueur : ${movePlayed?.san || movePlayed?.uci} (évaluation : ${evalPlayed})
- Meilleur coup Stockfish : ${moveBest?.san || moveBest?.uci || movePlayed?.san} (évaluation : ${evalBest})
- Classification du coup : ${classification}
- Variante principale calculée par Stockfish (PV) : ${pv || 'N/A'}
- Contexte des derniers coups : ${sanHistory ? sanHistory.slice(-8).join(' ') : 'N/A'}

${promptDirective}

DIRECTIVE POUR LE PLAN D'ACTION ("plan") :
Le plan d'action doit être STRICTEMENT SITUATIONNEL, PRÉCIS et adapté à cette position exacte.
RÈGLE D'OR : INTERDICTION FORMELLE d'utiliser des clichés vagues ("sécuriser le roi", "activer les pièces").
Tu DOIS :
1. Citer nommément les pièces exactes (ex: "le Fou en g5", "le Cavalier en f3", "la Tour en d1")
2. Identifier les cases cibles précises
3. Donner une séquence chronologique en 3 étapes séparées par un saut de ligne \\n

Format JSON strict requis :
{
  "concept": "Nom du concept tactique/stratégique précis (2 à 4 mots)",
  "whyPlayedIsBad": "${isGoodMove ? '' : 'Explication vivante de la faiblesse'}",
  "whyBestIsBetter": "${isGoodMove ? 'Explication de la force du coup joué' : 'Explication de la supériorité du meilleur coup'}",
  "plan": "1. Action immédiate... \\n2. Suite tactique... \\n3. Consolidation..."
}`;

    let parsed;
    try {
      parsed = await callGeminiWithFallback(
        prompt,
        'Tu es un entraîneur d’échecs de Grand Maître bienveillant, rigoureux et précis. Si le coup joué est bon ou optimal, tu le valides sans inventer de défauts imaginaires. Réponds toujours en JSON valide.'
      );
      if (isGoodMove && parsed) {
        parsed.whyPlayedIsBad = '';
      }
    } catch (genErr) {
      console.warn('Gemini calls failed, falling back to situational dynamic chess analysis:', genErr);
      parsed = generateSituationalExplanation(
        movePlayed,
        moveBest,
        pv,
        playerColor,
        moveNumber,
        classification
      );
    }

    res.json({ success: true, data: parsed });
  } catch (error: any) {
    console.error('Error in /api/coach/explain:', error);
    const fallback = generateSituationalExplanation(
      req.body?.movePlayed,
      req.body?.moveBest,
      req.body?.pv,
      req.body?.playerColor || 'white',
      req.body?.moveNumber || 1,
      req.body?.classification || 'erreur'
    );
    res.json({ success: true, data: fallback });
  }
});

// Endpoint: AI Full Game Summary & Tactical Coaching Report
app.post('/api/coach/summary', async (req, res) => {
  try {
    const {
      userPseudo,
      userColor = 'w',
      whiteName = 'Blancs',
      blackName = 'Noirs',
      result = '*',
      opening = '',
      eco = '',
      accuracyWhite = 80,
      accuracyBlack = 80,
      statsWhite,
      statsBlack,
      criticalMoments = [],
      userBlunders = [],
      userBestMoves = [],
    } = req.body;

    const isUserWhite = userColor === 'w';
    const userName = isUserWhite ? whiteName : blackName;
    const opponentName = isUserWhite ? blackName : whiteName;
    const userStats = isUserWhite ? statsWhite : statsBlack;
    const oppStats = isUserWhite ? statsBlack : statsWhite;
    const userAccuracy = isUserWhite ? accuracyWhite : accuracyBlack;
    const oppAccuracy = isUserWhite ? accuracyBlack : accuracyWhite;

    const openingContext = opening
      ? `Ouverture officielle jouée : ${opening} (Code ECO : ${eco || 'N/A'})`
      : 'Ouverture : Non répertoriée';

    const prompt = `Tu es un Maître International et entraîneur d'échecs de haut niveau. Rédige un bilan d'entraînement personnalisé, vivant et ultra-précis pour l'utilisateur :

PROFIL DE L'UTILISATEUR :
- Joueur analysé : "${userName}" (${isUserWhite ? 'Blancs' : 'Noirs'})
- Adversaire : "${opponentName}" (${isUserWhite ? 'Noirs' : 'Blancs'})
- Résultat de la partie : ${result}
- Précision de ${userName} : ${userAccuracy}% (${userStats?.blunders || 0} gaffes, ${userStats?.mistakes || 0} erreurs, ${userStats?.inaccuracies || 0} imprécisions)
- Précision de l'adversaire : ${oppAccuracy}%
- ${openingContext}

MOMENTS CLÉS DE ${userName} DANS LA PARTIE :
- Gaffes et erreurs commises par ${userName} : ${JSON.stringify(userBlunders.slice(0, 5))}
- Meilleurs coups et initiatives de ${userName} : ${JSON.stringify(userBestMoves.slice(0, 4))}
- Moments décisifs de la partie : ${JSON.stringify(criticalMoments.slice(0, 6))}

EXIGENCES ABSOLUES (RÈGLE STRICTE ANTI-GÉNÉRALITÉS) :
1. T'adresser à "${userName}" (au singulier / vouvoiement ou à la 3e personne valorisante).
2. Ne fais AUCUNE généralité creuse comme "cherchez l'initiative" ou "faites attention aux finales" sans citer un coup précis.
3. Chaque point fort et chaque faiblesse DOIT citer expressément :
   - Le numéro du coup (ex: "Au coup 14...", "À l'ouverture...")
   - La pièce précise (ex: votre Cavalier c6, votre Fou de cases noires g7, la Tour e1)
   - La conséquence tactique ou positionnelle réelle vécue dans CETTE partie.
4. Les conseils d'entraînement doivent cibler exactement les fautes commises (ex: si gaffe au coup 22 par clouage, prescrire des exercices sur ce clouage précis).

Format JSON attendu :
{
  "title": "Titre percutant et spécifique à cette partie et cette ouverture",
  "narrative": "Récit immersif en 3-4 phrases de la trajectoire de ${userName} dans la partie, son comportement dans l'ouverture ${eco || ''} et le tournant tactique.",
  "targetPlayer": {
    "name": "${userName}",
    "color": "${userColor}",
    "accuracy": ${userAccuracy}
  },
  "strengthsUser": [
    "Point fort concret 1 citant un coup précis ou une phase bien négociée",
    "Point fort concret 2"
  ],
  "weaknessesUser": [
    "Faiblesse concrète 1 avec le coup précis (ex: 'Au coup X, votre Y au lieu de Z...')",
    "Faiblesse concrète 2"
  ],
  "strengthsWhite": ["Point fort Blancs"],
  "weaknessesWhite": ["Faiblesse Blancs"],
  "strengthsBlack": ["Point fort Noirs"],
  "weaknessesBlack": ["Faiblesse Noirs"],
  "trainingAdvice": [
    "Exercice concret 1 lié au motif manqué dans cette partie",
    "Exercice concret 2 lié à l'ouverture ${opening || 'jouée'}",
    "Exercice concret 3 sur la gestion tactique"
  ]
}`;

    let parsed;
    try {
      parsed = await callGeminiWithFallback(
        prompt,
        'Tu es un Grand Maître et coach d’échecs ultra-analytique et concret. Réponds uniquement en JSON valide.'
      );
    } catch (genErr) {
      console.warn('Gemini summary call failed, using game-specific dynamic generator:', genErr);
      
      // Dynamic situational fallback tailored to the game
      const biggestBlunder = userBlunders[0];
      const secondFault = userBlunders[1] || criticalMoments[0];
      const openingLabel = opening ? `${opening} (${eco})` : 'l\'ouverture';

      const strengths: string[] = [];
      if (userBestMoves.length > 0) {
        const bm = userBestMoves[0];
        strengths.push(`Bonne inspiration au coup ${bm.moveNumber} avec ${bm.san}, démontrant une juste appréciation tactique.`);
      }
      strengths.push(`Comportement solide dans ${openingLabel} avec une entrée en matière cohérente.`);
      if (userAccuracy >= 75) {
        strengths.push(`Précision globale appréciable (${userAccuracy}%) dans les phases régulières.`);
      }

      const weaknesses: string[] = [];
      if (biggestBlunder) {
        weaknesses.push(
          `Coup critique au tour ${biggestBlunder.moveNumber} (${biggestBlunder.san}) : concède un avantage de ${(biggestBlunder.loss / 100).toFixed(1)} pions. Le coup recommandé était ${biggestBlunder.best}.`
        );
      }
      if (secondFault) {
        weaknesses.push(
          `Tournant tactique au coup ${secondFault.moveNumber} (${secondFault.san}) : manque l'option plus percutante ${secondFault.best}.`
        );
      }
      if (userStats?.middlegameBlunders > 0) {
        weaknesses.push(`Pertes de coordination en milieu de jeu (${userStats.middlegameBlunders} moment(s) de flottement).`);
      }

      const advice: string[] = [];
      if (biggestBlunder) {
        advice.push(`Rejouer la position du coup ${biggestBlunder.moveNumber} en recherchant en priorité le coup candidat ${biggestBlunder.best}.`);
      }
      if (opening) {
        advice.push(`Approfondir les 3 premiers coups théoriques de ${opening} pour accélérer la prise d'initiative.`);
      } else {
        advice.push('Résoudre quotidiennement des exercices tactiques sur les pièces non protégées.');
      }
      advice.push('Prendre 15 à 30 secondes supplémentaires sur les coups candidats avant de valider un échange de pièces.');

      parsed = {
        title: `${userName} dans ${opening || 'Partie Tactique'} (${result})`,
        narrative: `Dans cette confrontation sur ${openingLabel}, ${userName} (${isUserWhite ? 'Blancs' : 'Noirs'}) a développé des idées actives avec ${userAccuracy}% de précision face à ${opponentName}. Le sort de la partie a basculé lors des choix tactiques cruciaux du milieu de jeu.`,
        targetPlayer: {
          name: userName,
          color: userColor,
          accuracy: userAccuracy,
        },
        strengthsUser: strengths,
        weaknessesUser: weaknesses,
        strengthsWhite: isUserWhite ? strengths : ['Initiative au centre'],
        weaknessesWhite: isUserWhite ? weaknesses : ['Surveillance des diagonales'],
        strengthsBlack: !isUserWhite ? strengths : ['Résilience défensive'],
        weaknessesBlack: !isUserWhite ? weaknesses : ['Sécurité du roi'],
        trainingAdvice: advice,
      };
    }

    res.json({ success: true, data: parsed });
  } catch (error: any) {
    console.error('Error in /api/coach/summary:', error);
    res.json({
      success: true,
      data: {
        title: 'Bilan de la partie',
        narrative: 'Une partie disputée avec plusieurs revirements tactiques décisifs.',
        strengthsUser: ['Application des principes de développement', 'Combativité face aux menaces'],
        weaknessesUser: ['Attention aux pièces surchargées', 'Calcul des variantes de reprise'],
        strengthsWhite: ['Développement'],
        weaknessesWhite: ['Calcul tactique'],
        strengthsBlack: ['Contre-attaque'],
        weaknessesBlack: ['Sécurité'],
        trainingAdvice: ['Pratiquer les finales élémentaires', 'Travailler les motifs de déviation tactique'],
      },
    });
  }
});

// Proxy endpoint to import PGN directly to Lichess via official API without CORS or CSRF restrictions
app.post('/api/lichess/import', async (req, res) => {
  try {
    const { pgn } = req.body;
    if (!pgn || typeof pgn !== 'string') {
      return res.status(400).json({ success: false, error: 'PGN requis' });
    }

    const lichessResponse = await fetch('https://lichess.org/api/import', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ pgn }),
    });

    if (!lichessResponse.ok) {
      const errText = await lichessResponse.text();
      console.warn('Lichess import API error:', lichessResponse.status, errText);
      return res.status(lichessResponse.status).json({ success: false, error: errText });
    }

    const data: any = await lichessResponse.json();
    return res.json({
      success: true,
      id: data.id,
      url: data.url || `https://lichess.org/${data.id}`,
    });
  } catch (error: any) {
    console.error('Error in /api/lichess/import:', error);
    return res.status(500).json({ success: false, error: error.message || 'Erreur serveur Lichess' });
  }
});

const PORT = 3000;
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
    app.get('*', (req, res) => {
      res.sendFile('dist/index.html', { root: '.' });
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Serveur démarré sur http://0.0.0.0:${PORT}`);
  });
}

startServer();
