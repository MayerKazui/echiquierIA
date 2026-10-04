import express, { type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { resolvePort } from './server/config';
import { spaFallback, staticMiddlewares } from './server/static';
import type { ZodType } from 'zod';
import { lichessImportSchema, type LichessImportRequest } from './server/schemas';

dotenv.config();

const app = express();

// Behind a reverse proxy (Cloud Run sets K_SERVICE) the client IP comes from X-Forwarded-For.
// Without this, every visitor would share the proxy's IP and therefore one rate-limit bucket.
// Override with TRUST_PROXY (number of proxy hops, or an express "trust proxy" value).
const trustProxy = process.env.TRUST_PROXY ?? (process.env.K_SERVICE ? '1' : undefined);
if (trustProxy) {
  app.set('trust proxy', /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy);
}

// The API only takes small JSON bodies (one PGN).
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

// Rate limit (per client IP). Lichess rate-limits imports itself too.
const rateLimitResponse = { success: false, error: 'Trop de requêtes, réessayez dans un instant' };
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
    // Only the dev server needs Vite: loading it in production would slow the start for nothing
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(...staticMiddlewares('dist'));
    app.get('*', spaFallback('dist'));
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Serveur démarré sur http://0.0.0.0:${PORT}`);
  });
}

startServer();
