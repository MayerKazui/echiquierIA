# Échiquier IA

Analyse de parties d'échecs dans le navigateur : Stockfish 19 évalue chaque coup, classe les gaffes, erreurs et
coups brillants, trace la courbe d'évaluation et un « entraîneur IA » (Gemini) explique les moments clés en français.

- Import d'un PGN (collé, fichier ou exemples) avec reconnaissance de l'ouverture (base lichess, ~3 800 lignes)
- Analyse Stockfish en parallèle dans des Web Workers, profondeur réglable (8 à 18) : les coups s'affichent dès qu'ils sont analysés et l'analyse peut être annulée
- Les parties analysées (20 au plus) sont conservées dans le navigateur (IndexedDB) : la dernière se rouvre après un rechargement, « Mes parties » (en-tête) permet d'en rouvrir une autre sans relancer Stockfish, et ré-analyser un même PGN est instantané. Rien n'est envoyé à un serveur
- Bilan par joueur : précision, phases de jeu, répartition des coups, gestion du temps si le PGN contient les pendules
- Utilisable sur téléphone : en-tête et barre d'outils compacts, navigation en bas de l'écran, balayage pour changer de coup
- Accessible : échiquier et toutes les commandes utilisables au clavier, annonces pour lecteurs d'écran, contrastes et mouvement réduit respectés
- Mise en page : sur ordinateur l'échiquier est dimensionné sur la hauteur de la fenêtre, avec ses commandes de lecture, et un panneau à onglets (Coup / Liste) à côté du graphique d'évaluation
- Échiquier interactif : exploration libre (« Et si j'avais joué… ? », glisser-déposer à la souris ou au doigt, choix de la pièce à la promotion), animation des coups dans les deux sens avec les captures, flèches et surbrillances au clic droit,
  contrôle de l'espace, menaces tactiques, lecture automatique, raccourcis clavier
- Explications pédagogiques via l'API Gemini, appelée uniquement côté serveur

## Démarrage

Prérequis : [Bun](https://bun.sh) 1.3 ou plus récent (c'est le seul gestionnaire de paquets du projet, `bun.lock`).

```bash
bun install
cp .env.example .env     # puis renseignez GEMINI_API_KEY (optionnel)
bun run dev              # http://localhost:3000
```

Sans clé Gemini, l'application fonctionne : les explications de l'entraîneur IA utilisent un repli heuristique local.

## Commandes

| Commande                 | Rôle                                                                      |
| ------------------------ | ------------------------------------------------------------------------- |
| `bun run dev`            | Serveur de développement (Express + Vite, rechargement à chaud)           |
| `bun run build`          | Construit le front dans `dist/`                                           |
| `bun run start`          | Sert `dist/` en production (`NODE_ENV=production`) : lancer `build` avant |
| `bun run test`           | Tests unitaires (Vitest)                                                  |
| `bun run lint`           | ESLint                                                                    |
| `bun run typecheck`      | `tsc --noEmit` (mode `strict`)                                            |
| `bun run format`         | Formate avec Prettier (`format:check` pour seulement vérifier)            |
| `bun run check`          | lint + typecheck + format + tests, comme la CI                            |
| `bun run build:openings` | Régénère `public/openings.json` depuis `src/data/openings/*.tsv`          |

La CI (GitHub Actions) exécute lint, typecheck, format, tests et build à chaque pull request.

## Configuration

Variables d'environnement (voir `.env.example`) :

| Variable          | Rôle                                                                                |
| ----------------- | ----------------------------------------------------------------------------------- |
| `GEMINI_API_KEY`  | Clé de l'API Gemini (côté serveur uniquement)                                       |
| `PORT`            | Port d'écoute, 3000 par défaut                                                      |
| `APP_URL`         | URL publique, toujours autorisée à appeler `/api`                                   |
| `ALLOWED_ORIGINS` | Autres origines autorisées (CORS), séparées par des virgules                        |
| `TRUST_PROXY`     | Nombre de proxies devant le serveur, pour les limites de débit (auto sur Cloud Run) |

## Architecture

```
server.ts            API Express : /api/coach/explain (Gemini) et /api/lichess/import, CORS, limites de débit
server/              schémas de validation (zod), configuration
src/
  App.tsx            composition de l'interface
  hooks/             état et logique de l'application (analyse, lecture, exploration, raccourcis…)
  components/        échiquier, graphiques, liste de coups, bilan, import PGN…
  services/          stockfishEngine (pool de workers, cache), openingBook, gameStore (parties analysées, IndexedDB)
  utils/             logique pure testée : classification des coups, précision, PGN, pendules, notation…
  data/openings/     fichiers .tsv de lichess, source de public/openings.json
vite/                plugin qui sert et empaquette le moteur Stockfish
scripts/             génération de public/openings.json
```

### Le moteur Stockfish

Le moteur est le paquet npm [`stockfish`](https://www.npmjs.com/package/stockfish) (build _lite_ mono-thread,
WebAssembly). Il n'est pas copié dans le dépôt : `vite/stockfishPlugin.ts` le sert à `/stockfish-19.js` en
développement et l'ajoute à `dist/` au build. Comme il est mono-thread, il ne demande pas d'en-têtes COOP/COEP ;
le parallélisme vient d'un worker par position analysée (nombre de cœurs − 1, entre 1 et 6). Si WebAssembly ou le
moteur est indisponible, les positions sont évaluées par une heuristique simple.

### Sécurité du serveur

CORS restreint, limites de débit par IP, corps de requête plafonné, validation stricte des entrées (les chaînes
insérées dans le prompt Gemini ne peuvent contenir ni guillemets ni retours à la ligne), réponse de Gemini validée,
erreurs génériques côté client.

## Déploiement

`bun run build` puis `bun run start`. Le serveur écoute sur `PORT` (3000 par défaut) et sert `dist/` compressé (brotli/gzip), avec un cache long pour les fichiers hachés et une revalidation pour le reste. Derrière un
reverse proxy, définissez `TRUST_PROXY` (automatique sur Cloud Run) et `APP_URL`.

## Suivi des améliorations

Voir [`IMPROVEMENTS.md`](IMPROVEMENTS.md).
