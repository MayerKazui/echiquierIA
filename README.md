# Échiquier IA

Analyse de parties d'échecs dans le navigateur : Stockfish 19 évalue chaque coup, classe les gaffes, erreurs et
coups brillants, trace la courbe d'évaluation et un « entraîneur IA » (Gemini) explique les moments clés en français.

- Import d'un PGN (collé, fichier ou exemples) avec reconnaissance de l'ouverture (base lichess, ~3 800 lignes)
- Import direct des dernières parties d'un compte **chess.com** ou **Lichess** (pseudo, filtre de cadence, parties plus anciennes à la demande) : le navigateur appelle leurs API publiques, sans passer par le serveur
- Analyse Stockfish en parallèle dans des Web Workers, profondeur réglable (8 à 18) : les coups s'affichent dès qu'ils sont analysés et l'analyse peut être annulée
- Les parties analysées (500 au plus, les 50 plus récentes complètes) sont conservées dans le navigateur (IndexedDB) : la dernière se rouvre après un rechargement, « Mes parties » (en-tête) permet d'en rouvrir une autre sans relancer Stockfish, et ré-analyser un même PGN est instantané. Rien n'est envoyé à un serveur
- « S'entraîner » (en-tête) : rejouer les positions où l'on s'est trompé dans ses propres parties, avec correction par le moteur ; une position ratée revient le lendemain, une position réussie après 1, 3 puis 7 jours ; filtres par type d'erreur et par phase
- « Puzzles » (en-tête) : 200 000 puzzles de Lichess (CC0) embarqués, au niveau (tranche d'Elo) et sur les thèmes de votre choix (73 thèmes, en français), avec un chronomètre au choix (3, 5, 10 ou 15 minutes) ; un puzzle raté ne coûte que le temps passé et revient en répétition espacée (demain, puis après 1, 3 et 7 jours). Chargés à la demande par tranche d'Elo, utilisables hors ligne une fois vus
- « Mon profil » (en-tête) : ce qui revient dans vos parties (phase, type d'erreur, pendule, couleur, adversaire, évolution)
- **Sauvegarde** : « Mes parties » exporte tout ce que l'application garde dans le navigateur (parties, progression d'entraînement, puzzles ratés, études, réglages) en un fichier JSON, et le réimporte (fusion avec l'existant) ; le bouton « Synchroniser avec Google Drive » garde la même copie dans le dossier caché de votre Drive, pour retrouver vos données sur un autre appareil, à la demande ou automatiquement (à l'ouverture et après chaque partie ou étude ajoutée, modifiée ou supprimée, suppressions comprises) ; sans serveur : voir `IMPROVEMENTS.md`
- **Application installable et utilisable hors ligne** (PWA) : le moteur, la base d'ouvertures et l'interface sont mis en cache ; une nouvelle version est proposée sans interrompre la partie en cours. Ne marchent pas hors ligne : l'import chess.com / Lichess et le coach IA
- Noms d'ouverture en français (« Défense sicilienne : variante Dragon »)
- Bilan par joueur : précision, phases de jeu, répartition des coups, gestion du temps si le PGN contient les pendules
- Utilisable sur téléphone : en-tête et barre d'outils compacts, navigation en bas de l'écran, balayage pour changer de coup
- Accessible : échiquier et toutes les commandes utilisables au clavier, annonces pour lecteurs d'écran, contrastes et mouvement réduit respectés
- Mise en page : sur ordinateur l'échiquier est dimensionné sur la hauteur de la fenêtre, avec ses commandes de lecture, et un panneau à onglets (Coup / Liste) à côté du graphique d'évaluation
- Échiquier interactif : exploration libre (« Et si j'avais joué… ? », glisser-déposer à la souris ou au doigt, choix de la pièce à la promotion), animation des coups dans les deux sens avec les captures, flèches et surbrillances au clic droit,
  contrôle de l'espace, menaces tactiques, lecture automatique (qui s'arrête sur les erreurs, réglable), raccourcis clavier
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

| Commande                 | Rôle                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------- |
| `bun run dev`            | Serveur de développement (Express + Vite, rechargement à chaud)                       |
| `bun run build`          | Construit l'interface (`dist/`) et compile le serveur en `server.js`                  |
| `bun run start`          | Sert `dist/` en production (`NODE_ENV=production`, via tsx) : lancer `build` avant    |
| `bun run test`           | Tests unitaires (Vitest)                                                              |
| `bun run lint`           | ESLint                                                                                |
| `bun run typecheck`      | `tsc --noEmit` (mode `strict`)                                                        |
| `bun run format`         | Formate avec Prettier (`format:check` pour seulement vérifier)                        |
| `bun run check`          | lint + typecheck + format + tests, comme la CI                                        |
| `bun run build:openings` | Régénère `public/openings.json` depuis `src/data/openings/*.tsv`                      |
| `bun run build:puzzles`  | Régénère `public/puzzles/` depuis la base de puzzles Lichess (307 Mo)                 |
| `bun run calibrate`      | Écart de la précision avec chess.com sur les parties de référence (`fetch`, `record`) |

La CI (GitHub Actions) exécute lint, typecheck, format, tests et build à chaque pull request.

## Configuration

Variables d'environnement (voir `.env.example`) :

| Variable                | Rôle                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------ |
| `GEMINI_API_KEY`        | Clé de l'API Gemini (côté serveur uniquement)                                                          |
| `PORT`                  | Port d'écoute, 3000 par défaut                                                                         |
| `APP_URL`               | URL publique, toujours autorisée à appeler `/api`                                                      |
| `ALLOWED_ORIGINS`       | Autres origines autorisées (CORS), séparées par des virgules                                           |
| `TRUST_PROXY`           | Nombre de proxies devant le serveur, pour les limites de débit (auto sur Cloud Run)                    |
| `VITE_API_URL`          | À la construction : adresse de l'API si elle est sur un autre hôte (vide : même hôte)                  |
| `VITE_GOOGLE_CLIENT_ID` | À la construction : identifiant client OAuth de la synchronisation Google Drive (vide : bouton masqué) |
| `BASE_PATH`             | À la construction : sous-dossier du site (`/echiquierIA/` sur GitHub Pages), `/` par défaut            |

## Architecture

```
server.ts            API Express : /api/coach/explain (Gemini) et /api/lichess/import, CORS, limites de débit
server/              schémas de validation (zod), configuration
src/
  App.tsx            composition de l'interface
  hooks/             état et logique de l'application (analyse, lecture, exploration, raccourcis…)
  components/        échiquier, graphiques, liste de coups, bilan, import PGN…
  services/          stockfishEngine (pool de workers, cache), openingBook, gameStore (parties analysées, IndexedDB),
                     gameImport (parties d'un compte chess.com / Lichess), trainingStore (progression de l'entraînement, IndexedDB),
                     backup (export / import JSON de tout cela), googleAuth / googleDrive / driveSync (copie dans Google Drive)
  utils/             logique pure testée : classification des coups, précision, PGN, pendules, notation…
  data/openings/     fichiers .tsv de lichess, source de public/openings.json
vite/                plugins : servir et empaqueter le moteur Stockfish, construire le service worker (sw.js)
src/pwa/             service worker (hors ligne) et son inscription
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

### Un seul serveur (Cloud Run, VPS…)

`bun run build` puis `node server.js` (ou `bun run start`). `build` compile le serveur en `server.js`, qui démarre en une fraction de seconde (tsx compile le TypeScript au lancement, ce qui prend plusieurs secondes sur un hôte lent) : c'est ce que lance la commande par défaut de Cloud Run (`if [ -f server.js ]; then node server.js; else npm start; fi`), qui laisse peu de temps au conteneur pour écouter sur son port. Le serveur écoute sur `PORT` (3000 par défaut) et sert `dist/` compressé (brotli/gzip), avec un cache long pour les fichiers hachés et une revalidation pour le reste. Derrière un
reverse proxy, définissez `TRUST_PROXY` (automatique sur Cloud Run) et `APP_URL`.

### Interface sur GitHub Pages, API ailleurs

GitHub Pages ne sert que des fichiers statiques : l'analyse (Stockfish dans le navigateur) et l'import des parties chess.com / Lichess (appels directs du navigateur) y fonctionnent entièrement, mais le coach IA (clé Gemini) et l'import vers Lichess ont besoin du serveur, qui reste par exemple sur Cloud Run. Le workflow `.github/workflows/pages.yml` publie `dist/` à chaque push sur `main`. Le service worker (`sw.js`) est construit par `vite build` lui-même : il fonctionne aussi sur Pages (portée `/<dépôt>/`).

1. **Pages** : dans les réglages du dépôt, _Pages_ > _Source_ : **GitHub Actions** (un dépôt public est nécessaire sur l'offre gratuite).
2. **Adresse de l'API** : variable de dépôt `API_URL` (_Settings_ > _Secrets and variables_ > _Actions_ > _Variables_), par exemple `https://mon-service.europe-west2.run.app`, sans barre finale. Sans elle, l'interface appelle `/api/...` sur son propre site, qui n'existe pas sur Pages : le coach bascule sur ses explications locales et l'import Lichess ouvre la page « coller un PGN ».
3. **Serveur** : variable d'environnement `ALLOWED_ORIGINS=https://<utilisateur>.github.io` (l'origine, sans le nom du dépôt). Sans elle, le serveur refuse les appels venus d'un autre site (403).
4. L'interface est servie depuis `https://<utilisateur>.github.io/<dépôt>/` : le workflow construit avec `BASE_PATH=/<dépôt>/`. Pour tester en local : `BASE_PATH=/echiquierIA/ VITE_API_URL=http://localhost:3000 bunx vite build --outDir /tmp/site/echiquierIA`.

La clé Gemini ne doit jamais figurer dans l'interface : elle reste une variable d'environnement du serveur.

## Suivi des améliorations

Voir [`IMPROVEMENTS.md`](IMPROVEMENTS.md).
