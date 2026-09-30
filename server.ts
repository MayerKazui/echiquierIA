import express, { type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import { resolvePort } from './server/config';
import type { ZodType } from 'zod';
import {
  explainSchema,
  explanationSchema,
  isGoodClassification,
  lichessImportSchema,
  type Explanation,
  type LichessImportRequest,
  type ExplainRequest,
  type MoveRef,
  type MoveClassification,
} from './server/schemas';

dotenv.config();

const app = express();

// Behind a reverse proxy (Cloud Run sets K_SERVICE) the client IP comes from X-Forwarded-For.
// Without this, every visitor would share the proxy's IP and therefore one rate-limit bucket.
// Override with TRUST_PROXY (number of proxy hops, or an express "trust proxy" value).
const trustProxy = process.env.TRUST_PROXY ?? (process.env.K_SERVICE ? '1' : undefined);
if (trustProxy) {
  app.set('trust proxy', /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy);
}

// The API only takes small JSON bodies (a FEN and a few moves, or one PGN).
app.use(express.json({ limit: '100kb' }));

// CORS: same-origin requests are always accepted. Other sites must be listed in
// APP_URL / ALLOWED_ORIGINS (comma-separated); everything else gets a 403.
function toOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value.trim()).origin;
  } catch {
    return null;
  }
}

const allowedOrigins = new Set(
  [process.env.APP_URL, ...(process.env.ALLOWED_ORIGINS ?? '').split(',')]
    .map(toOrigin)
    .filter((origin): origin is string => origin !== null && origin !== 'null')
);

app.use('/api', (req, res, next) => {
  const origin = req.get('Origin');
  if (!origin) return next(); // Non-browser client or same-origin GET

  const originUrl = toOrigin(origin);
  const isSameOrigin = originUrl !== null && new URL(originUrl).host === req.get('Host');
  if (!originUrl || (!isSameOrigin && !allowedOrigins.has(originUrl))) {
    return res.status(403).json({ success: false, error: 'Origine non autorisée' });
  }

  res.vary('Origin');
  if (!isSameOrigin) {
    res.setHeader('Access-Control-Allow-Origin', originUrl);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Rate limits (per client IP). Explanations cost Gemini quota; Lichess rate-limits imports itself.
const rateLimitResponse = { success: false, error: 'Trop de requêtes, réessayez dans un instant' };
const explainLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: rateLimitResponse,
});
const lichessImportLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: rateLimitResponse,
});

function validateBody(schema: ZodType) {
  return (req: Request, res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: 'Requête invalide' });
    }
    req.body = parsed.data;
    next();
  };
}

const apiKey = process.env.GEMINI_API_KEY || undefined;
const ai = new GoogleGenAI({
  apiKey,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

// Gemini call budget. The client gives up after 10 s, so the whole cascade must finish before
// that: worst case is one slow model (5 s) followed by a second one cut short at the deadline.
// Errors that come back quickly (404, 429, bad JSON) move on to the next model immediately.
const GEMINI_MODELS = ['gemini-3.8-flash', 'gemini-3.1-flash-lite'];
const GEMINI_ATTEMPT_TIMEOUT_MS = 5000;
const GEMINI_TOTAL_TIMEOUT_MS = 9000;

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : 'Error');

// Helper: cascading Gemini caller. Each attempt is truly cancelled (AbortSignal) when it times out.
async function callGeminiWithFallback(prompt: string, systemInstruction: string): Promise<Explanation> {
  const deadline = Date.now() + GEMINI_TOTAL_TIMEOUT_MS;
  let lastError: unknown = null;

  for (const model of GEMINI_MODELS) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(new Error(`Timeout on model ${model}`)),
      Math.min(GEMINI_ATTEMPT_TIMEOUT_MS, remaining)
    );

    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          abortSignal: controller.signal,
        },
      });

      if (response?.text) {
        // Strip code fences if present (e.g. ```json ... ```)
        const cleaned = response.text
          .replace(/^```json\s*/i, '')
          .replace(/^```\s*/i, '')
          .replace(/\s*```$/i, '')
          .trim();
        // A reply that is not valid JSON or has the wrong shape counts as a failure of this model
        return explanationSchema.parse(JSON.parse(cleaned));
      }
    } catch (err) {
      console.warn(`Model ${model} failed (${errorMessage(err)}), trying next candidate...`);
      lastError = err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError || new Error('All Gemini models failed');
}

// In-memory cache of Gemini explanations (LRU, capped). Only real Gemini answers are cached, never
// the heuristic fallback, so a transient outage does not stick. Concurrent identical requests share
// one Gemini call.
const EXPLANATION_CACHE_MAX = 500;
const EXPLANATION_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const explanationCache = new Map<string, { data: Explanation; expires: number }>();
const explanationInFlight = new Map<string, Promise<Explanation>>();

function getCachedExplanation(key: string) {
  const entry = explanationCache.get(key);
  if (!entry) return undefined;
  if (entry.expires < Date.now()) {
    explanationCache.delete(key);
    return undefined;
  }
  // Re-insert to mark as most recently used.
  explanationCache.delete(key);
  explanationCache.set(key, entry);
  return entry.data;
}

function setCachedExplanation(key: string, data: Explanation) {
  explanationCache.set(key, { data, expires: Date.now() + EXPLANATION_CACHE_TTL_MS });
  if (explanationCache.size > EXPLANATION_CACHE_MAX) {
    const oldest = explanationCache.keys().next().value;
    if (oldest !== undefined) explanationCache.delete(oldest);
  }
}

// Helper: Dynamic, 100% situational heuristic chess coach (never generic boilerplate)
function generateSituationalExplanation(
  movePlayed: MoveRef | undefined,
  moveBest: MoveRef | undefined,
  pv: string | undefined,
  playerColor: string,
  moveNumber: number,
  classificationKey: MoveClassification
): Explanation {
  const playedSan = movePlayed?.san || movePlayed?.uci || '';
  const bestSan = moveBest?.san || moveBest?.uci || playedSan;
  const isWhite = playerColor === 'white';
  const oppColor = isWhite ? 'noires' : 'blanches';

  const isBlunder = classificationKey === 'blunder' || classificationKey === 'missedWin';
  const isGoodMove = isGoodClassification(classificationKey) || playedSan === bestSan || !moveBest?.san;

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

  let whyPlayedIsBad: string;
  let whyBestIsBetter: string;

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
    steps.push(
      `2. Enchaîner avec la suite tactique ${pvList.slice(1).join(' ➔ ')} afin de déstabiliser les pièces ${oppColor}.`
    );
  }
  steps.push(
    `3. Poursuivre en augmentant la pression sur les cases sensibles du camp adverse tout en consolidant l'initiative.`
  );
  const plan = steps.join('\n');

  return {
    concept,
    whyPlayedIsBad,
    whyBestIsBetter,
    plan,
  };
}

// Endpoint: AI Tactical & Strategic Move Explanation
app.post('/api/coach/explain', explainLimiter, validateBody(explainSchema), async (req, res) => {
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
      classificationKey,
    } = req.body as ExplainRequest;

    const isGoodMove =
      isGoodClassification(classificationKey) ||
      (movePlayed?.san && moveBest?.san && movePlayed.san === moveBest.san) ||
      !moveBest?.san;

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

    // The prompt depends on everything below, so it is the natural cache key.
    const cacheKey = prompt;
    const cached = getCachedExplanation(cacheKey);
    if (cached) return res.json({ success: true, data: cached });

    let parsed: Explanation;
    try {
      let pending = explanationInFlight.get(cacheKey);
      if (!pending) {
        pending = callGeminiWithFallback(
          prompt,
          'Tu es un entraîneur d’échecs de Grand Maître bienveillant, rigoureux et précis. Si le coup joué est bon ou optimal, tu le valides sans inventer de défauts imaginaires. Réponds toujours en JSON valide.'
        ).finally(() => explanationInFlight.delete(cacheKey));
        explanationInFlight.set(cacheKey, pending);
      }
      parsed = await pending;
      if (isGoodMove) {
        parsed.whyPlayedIsBad = '';
      }
      setCachedExplanation(cacheKey, parsed);
    } catch (genErr) {
      console.warn('Gemini calls failed, falling back to situational dynamic chess analysis:', genErr);
      parsed = generateSituationalExplanation(movePlayed, moveBest, pv, playerColor, moveNumber, classificationKey);
    }

    res.json({ success: true, data: parsed });
  } catch (error) {
    console.error('Error in /api/coach/explain:', error);
    const body: Partial<ExplainRequest> = req.body ?? {};
    const fallback = generateSituationalExplanation(
      body.movePlayed,
      body.moveBest,
      body.pv,
      body.playerColor || 'white',
      body.moveNumber || 1,
      body.classificationKey || 'mistake'
    );
    res.json({ success: true, data: fallback });
  }
});

// Proxy endpoint to import PGN directly to Lichess via official API without CORS or CSRF restrictions
app.post('/api/lichess/import', lichessImportLimiter, validateBody(lichessImportSchema), async (req, res) => {
  try {
    const { pgn } = req.body as LichessImportRequest;

    const lichessResponse = await fetch('https://lichess.org/api/import', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ pgn }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!lichessResponse.ok) {
      const errText = await lichessResponse.text();
      console.warn('Lichess import API error:', lichessResponse.status, errText);
      if (lichessResponse.status === 429) {
        return res
          .status(429)
          .json({ success: false, error: 'Lichess limite temporairement les imports, réessayez plus tard' });
      }
      return res.status(502).json({ success: false, error: "L'import vers Lichess a échoué" });
    }

    const data = (await lichessResponse.json()) as { id?: unknown };
    if (typeof data.id !== 'string' || !/^[A-Za-z0-9]{8,12}$/.test(data.id)) {
      console.warn('Lichess import API returned an unexpected id:', data.id);
      return res.status(502).json({ success: false, error: "L'import vers Lichess a échoué" });
    }
    return res.json({
      success: true,
      id: data.id,
      url: `https://lichess.org/${data.id}`,
    });
  } catch (error) {
    console.error('Error in /api/lichess/import:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur Lichess' });
  }
});

// Body-parser errors (oversized or malformed JSON) and anything unexpected: never leak details.
app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) return next(err);
  const type = (err as { type?: string } | null)?.type;
  if (type === 'entity.too.large') {
    return res.status(413).json({ success: false, error: 'Requête trop volumineuse' });
  }
  if (type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, error: 'Requête invalide' });
  }
  console.error('Unhandled server error:', err);
  res.status(500).json({ success: false, error: 'Erreur serveur' });
});

const PORT = resolvePort();
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
