# Échiquier IA

Analyse de parties d'échecs dans le navigateur : Stockfish 19 évalue chaque coup, classe les gaffes, erreurs et
coups brillants, trace la courbe d'évaluation et un « entraîneur IA » (Gemini) explique les moments clés en français.

- Import d'un PGN (collé, fichier ou exemples) avec reconnaissance de l'ouverture (base lichess, ~3 800 lignes)
- Import direct des dernières parties d'un compte **chess.com** ou **Lichess** (pseudo, filtre de cadence, parties plus anciennes à la demande, bouton « Analyser seulement les nouvelles » pour tenir son profil à jour) : le navigateur appelle leurs API publiques, sans passer par le serveur
- Analyse Stockfish en parallèle dans des Web Workers, profondeur réglable (8 à 18) : les coups s'affichent dès qu'ils sont analysés et l'analyse peut être annulée
- Les parties analysées (500 au plus, les 50 plus récentes complètes) sont conservées dans le navigateur (IndexedDB) : la dernière se rouvre après un rechargement, « Mes parties » (en-tête) permet d'en rouvrir une autre sans relancer Stockfish, et ré-analyser un même PGN est instantané. Rien n'est envoyé à un serveur
- « Mes parties » : **recherche** (adversaire, ouverture en anglais ou en français, code ECO, événement, date, note, étiquette ; tous les mots tapés doivent se trouver), **filtres** par résultat, couleur, adversaire, ouverture, période (7 jours à 12 mois, ou entre deux dates), précision et étiquette, **tri** (analysées récemment, date de la partie, précision, adversaire), et pour chaque partie une **note personnelle** et des **étiquettes** (« à revoir », « tournoi »…). Notes et étiquettes sont gardées à part des parties : elles ne changent pas leur ordre, sont dans la sauvegarde et la synchronisation Drive, et suivent la partie si on l'analyse de nouveau
- « À réviser aujourd'hui » (menu, et carte sur l'accueil dès qu'il y a quelque chose à réviser) : **un seul compteur** pour ce qui revient aujourd'hui dans les cinq endroits où une répétition espacée existe (erreurs rejouées, puzzles ratés, lignes d'ouverture, finales, cycle Woodpecker en cours), un bouton par stock et **« Tout réviser »** (il ouvre le premier stock qui a quelque chose, puis la liste revient pour continuer avec le suivant), la **série de jours** d'entraînement d'affilée avec son record et un **calendrier d'assiduité** des 16 dernières semaines. Le nombre s'affiche aussi sur l'icône de l'application installée (`navigator.setAppBadge`, sans serveur) : il est mis à jour quand l'application est ouverte ou revient au premier plan
- **Export PGN annoté** (bouton « Exporter » sur la partie analysée, ou l'icône d'une ligne de « Mes parties ») : les coups avec leurs évaluations (`[%eval 0.34]`, `[%eval #3]` pour un mat), les pendules (`[%clk 0:09:58]`), les symboles (`!!`, `!`, `?!`, `?`, `??`) et les commentaires du coach (verdict, meilleur coup, explication quand elle existe), au choix ; les en-têtes du PGN d'origine sont gardés. Le fichier se rouvre dans Lichess, ChessBase, Scid ou tout lecteur PGN ; l'application n'y écrit aucun lien et n'envoie rien nulle part
- « S'entraîner » (en-tête) : rejouer les positions où l'on s'est trompé dans ses propres parties, avec correction par le moteur ; une position ratée revient le lendemain, une position réussie après 1, 3 puis 7 jours ; filtres par type d'erreur et par phase ; une même position ratée dans plusieurs parties n'est proposée qu'une fois, et « Voir dans la partie » ouvre la partie au coup de l'erreur
- « Puzzles » (en-tête) : 200 000 puzzles de Lichess (CC0) embarqués, au niveau (tranche d'Elo) et sur les thèmes de votre choix (73 thèmes, en français), avec un chronomètre au choix (3, 5, 10 ou 15 minutes) ; un puzzle raté ne coûte que le temps passé et revient en répétition espacée (demain, puis après 1, 3 et 7 jours). Chargés à la demande par tranche d'Elo, utilisables hors ligne une fois vus. Onglet **Woodpecker** : un lot figé de 20 à 500 puzzles que l'on refait cycle après cycle, chronométré (avec pause), les puzzles ratés revenant en fin de cycle ; le temps de chaque cycle est comparé au précédent. Onglet **Statistiques** : réussite par thème (7 jours, 30 jours ou tout) et séances, effaçables ; les puzzles déjà joués reviennent en dernier
- « Ouvertures » (en-tête) : un **explorateur** en arbre (coups de la base lichess, avec vos résultats par coup) ; **Mes ouvertures**, le répertoire que vos parties montrent vraiment (score, précision de vos 10 coups qui suivent la sortie du livre, comparée à votre moyenne calculée de la même façon, ouverture la plus solide et la plus fragile, coup qui vous fait quitter la théorie et ce qu'il coûte) ; **S'entraîner**, deux sortes de positions à rejouer en répétition espacée (demain, puis après 1, 3 et 7 jours) : celles où vous avez quitté la théorie en perdant au moins 8 points de chances de gain, et vos lignes qui marchent (la position la plus profonde que deux de vos parties au moins partagent dans la théorie, pour ne pas les oublier) ; tout coup que la base d'ouvertures connaît à cet endroit est juste. « Mon plan » y renvoie depuis l'objectif sur la sortie de théorie.
- « Préparer un adversaire » (menu, ou onglet des Ouvertures) : lit directement chez chess.com ou Lichess les 50, 100 ou 200 dernières parties d'un pseudo (cadence au choix), sans les analyser ni les enregistrer, et en tire pour chaque couleur ses premiers coups ou ses réponses, ses ouvertures avec leurs résultats, sa **ligne favorite** (le coup le plus joué à chaque fois, tant que 3 parties au moins vont dans le même sens), l'ouverture qui lui réussit le moins et celle qui lui réussit le mieux (3 parties au moins), et combien de coups il reste dans la théorie. L'**explorateur** s'ouvre sur ses parties : ses coups classés par fréquence, avec ses résultats, à côté des vôtres vus du camp opposé
- « Mon profil » (en-tête) : ce qui revient dans vos parties (phase, type d'erreur, pendule, couleur, adversaire, évolution)
- « Finales » (en-tête) : onze positions théoriques (mat avec la dame et avec la tour, finales de pions, Lucena, Philidor) que l'on **joue contre le moteur** : il juge chaque coup (chances de gain perdues, mat retardé), répond, et l'exercice se termine sur le mat, un pion promu en position gagnée, ou la nulle tenue pendant 12 coups. Chaque position a été vérifiée avec Stockfish 19 complet. Le premier essai compte : un coup raté ou la solution demandée font revenir la position demain, puis après 1, 3 et 7 jours si elle est réussie (même progression que « S'entraîner », comprise dans la sauvegarde). On peut reprendre le coup, ou recommencer la position pour s'entraîner
- « Jouer contre Stockfish » (menu) : une partie contre le moteur, à la force réglable (sept niveaux, de Débutant à Maximum), depuis la position initiale, une FEN, la position affichée d'une partie analysée (« Jouer ici »), une ligne de l'explorateur d'ouvertures, une position d'étude ou une position critique de « S'entraîner ». On choisit son camp, on peut reprendre son coup ou abandonner, et la partie jouée peut être analysée ensuite quand son chemin depuis la position initiale est connu. **La partie en cours est gardée après chaque coup** : fermer la fenêtre (ou le navigateur) ne la perd pas, et l'écran de départ propose de la reprendre. **Une partie finie** (mat, nulle, abandon) est gardée dans « Mes parties » avec l'étiquette « Contre Stockfish · niveau » (et les indices et évaluations demandés), cherchable, filtrable (« Origine »), avec note et étiquettes ; elle s'analyse quand on le décide. **« Indice »** montre d'abord la pièce à jouer, puis le coup, et **« Évaluer la position »** donne le score vu de son côté, à la demande et à la force maximale du moteur (profondeur 16), jamais sans que l'on le demande
- « Analyser une position » (menu ; « Analyser ici » au-dessus de l'échiquier d'une partie analysée ; « Analyser la position » dans l'explorateur d'ouvertures, donc aussi sur la ligne favorite d'un adversaire dans « Préparer un adversaire ») : les **trois meilleures lignes de Stockfish en direct** sur n'importe quelle position, avec leur évaluation vue des Blancs, la profondeur atteinte et une flèche par ligne sur l'échiquier. On colle une FEN (celle d'une partie d'un adversaire, par exemple) ou on pose les pièces à la main avec l'éditeur (pièces, gomme, trait, roques) ; une position impossible est refusée avec la raison. On joue sur l'échiquier pour suivre une ligne (un clic sur un coup d'une ligne la joue), on peut annuler, retourner l'échiquier, mettre le moteur en pause, et demander de 1 à 5 lignes (le choix est gardé)
- « Vision » (menu) : quatre exercices courts pour voir l'échiquier sans bouger les pièces, entièrement dans le navigateur (aucun réseau, utilisables hors ligne). **Coordonnées** : un nom de case (« e4 ») s'affiche, on clique dessus sur un échiquier sans coordonnées, 30 secondes, du côté des Blancs ou des Noirs ; une case manquée est montrée en vert avant de passer à la suivante. Deux autres niveaux : **nommer la case** éclairée (une lettre et un chiffre, au clavier ou avec les boutons) et dire si une case est **claire ou foncée**. Le chronomètre s'arrête quand l'onglet est caché. **Mode aveugle** : une vraie partie, célèbre ou une des vôtres (parmi celles que vous avez analysées), est lue coup par coup (6, 12 ou 20 demi-coups) sur un échiquier sans une pièce, puis cinq questions « que contient la case f3 ? » (vide ou l'une des douze pièces) ; les pièces apparaissent à la fin pour vérifier, et la liste des coups déjà lus peut rester affichée (plus facile). **Calcul de lignes** : un bout de partie (2, 4 ou 6 demi-coups) s'écrit sous la position, que l'on ne joue pas : on dit où une pièce a fini (clic sur la case, ou « la pièce est prise ») ou ce que contient une case, puis l'échiquier montre la position atteinte. **Partie à l'aveugle** : une partie complète contre Stockfish (sept niveaux) sur un échiquier sans pièces, les coups tapés au clavier (`Cf3`, `Nf3`, `g1f3`, `O-O`) ; on peut regarder l'échiquier, mais chaque regard est compté et une partie où l'on a regardé ne compte pas pour le record (victoire 2, nulle 1, défaite 0). **Progression** : la courbe des dernières séries de chaque niveau, avec le record et la moyenne des cinq dernières. Chaque réponse est celle que donnent les règles (rejouées avec chess.js, les pièces suivies à travers les prises, l'en passant et le roque). Le **meilleur score de chaque niveau** est gardé, avec le nombre de parties, dans la sauvegarde (format 10, `visionRecords`) et la synchronisation Drive ; chaque série compte aussi pour la série de jours
- **Sauvegarde** : « Mes parties » exporte tout ce que l'application garde dans le navigateur (parties et leurs notes, progression d'entraînement, jours travaillés, records de vision, puzzles ratés, lot Woodpecker et lots précédents, historique des puzzles, études, réglages) en un fichier JSON, et le réimporte (fusion avec l'existant) ; le bouton « Synchroniser avec Google Drive » garde la même copie dans le dossier caché de votre Drive, pour retrouver vos données sur un autre appareil, à la demande ou automatiquement (à l'ouverture et après chaque partie ou étude ajoutée, modifiée ou supprimée, suppressions comprises) ; sans serveur
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

| Commande                 | Rôle                                                                                   |
| ------------------------ | -------------------------------------------------------------------------------------- |
| `bun run dev`            | Serveur de développement (Express + Vite, rechargement à chaud)                        |
| `bun run build`          | Construit l'interface (`dist/`) et compile le serveur en `server.js`                   |
| `bun run start`          | Sert `dist/` en production (`NODE_ENV=production`, via tsx) : lancer `build` avant     |
| `bun run test`           | Tests unitaires et de composants (Vitest)                                              |
| `bun run test:e2e`       | Tests de bout en bout (Playwright) : construit l'application et la teste en vrai       |
| `bun run lint`           | ESLint                                                                                 |
| `bun run typecheck`      | `tsc --noEmit` (mode `strict`)                                                         |
| `bun run format`         | Formate avec Prettier (`format:check` pour seulement vérifier)                         |
| `bun run check`          | lint + typecheck + format + tests, comme la CI                                         |
| `bun run build:openings` | Régénère `public/openings.json` depuis `src/data/openings/*.tsv`                       |
| `bun run build:puzzles`  | Régénère `public/puzzles/` depuis la base de puzzles Lichess (307 Mo)                  |
| `bun run calibrate`      | Écart de la précision avec chess.com sur les parties de référence (`fetch`, `record`)  |
| `bun run thresholds`     | Seuils posés à la main, mesurés sur de vraies parties (`accuracy`, `endgames`, `prep`) |
| `bun run faultstats`     | Erreurs de référence par type et thème (`faultstats theme:fork` : exemples)            |

La CI (GitHub Actions) exécute lint, typecheck, format, tests et build à chaque pull request, et dans un second job les tests de bout en bout.

### Tests de bout en bout

`bun run test:e2e` construit l'application (`vite build`), la sert (`vite preview`, port 3100) et la pilote dans Chromium avec le vrai Stockfish. Une fois, pour installer le navigateur : `bunx playwright install chromium`. Les tests couvrent l'import d'un PGN et son analyse, le rechargement, l'import des parties d'un pseudo chess.com, l'export et l'import d'une sauvegarde, la synchronisation entre deux appareils par Google Drive, et un contrôle d'accessibilité (axe-core, WCAG A et AA). Rien ne sort de la machine : chess.com, la connexion Google et Drive sont remplacés par des faux (`e2e/support/`). Les traces des tests en échec sont dans `test-results/` (`bunx playwright show-trace <fichier>`).

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

Voir [`BILAN_ET_SUITES.md`](BILAN_ET_SUITES.md) : ce qui est fait, ce qui reste et les idées d'évolution.
