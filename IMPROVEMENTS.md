# Pistes d'amélioration

Suivi des améliorations identifiées lors de la revue du dépôt (2026-09-30).
Les points de la revue initiale sont basés sur la lecture du code. L'épuration de l'interface a été vérifiée avec `tsc --noEmit`, `vite build`, un lancement de l'app et un export PDF.

Légende : `[ ]` à faire · `[x]` fait

## Épuration de l'interface (fait)

Fonctionnalités retirées pour alléger l'app (≈4 200 lignes supprimées) :

- [x] **Bilan pédagogique du Grand Maître IA** (Dashboard) et l'endpoint `POST /api/coach/summary`, le type `aiSummary`.
- [x] **Moments décisifs** (Dashboard) : accessibles depuis l'analyse (saut d'erreur en erreur, liste des coups).
- [x] **Radar** de menace ennemie (bouton, bandeau, touche `R`, `enemyThreatRadar.ts`).
- [x] **Structure** de pions (labo, surbrillances sur l'échiquier, touche `P`, `pawnStructure.ts`).
- [x] **Plein écran** (`FullscreenBoard.tsx`, les deux boutons, `Maj + F` / `F11`).
- [x] Boutons **FEN** (copie), **FEN Lichess** et **Image** (`exportBoardImage.ts`, touche `C`).
- [x] **Export PDF** (boutons de l'en-tête et du Dashboard, `pdfExport.ts`, dépendance `jspdf`).
- [x] **Flèches + Menaces fusionnés** en un seul bouton « Annotations » (touche `E` ; la touche `T` est supprimée).

Conservés : « Partie Lichess » (`/api/lichess/import`), le graphique radar du joueur (`PlayerRadarChart`), « Clavier », le thème, la taille de l'échiquier, le contrôle de l'espace et « Partager le Bilan » (copie d'un résumé texte).

## Priorité haute

### 1. Sécurité du serveur (`server.ts`) — fait

- [x] CORS : plus de `*`. Les requêtes de même origine passent ; les autres sites doivent être listés dans `APP_URL` / `ALLOWED_ORIGINS`, sinon 403 (l'origine `null` est refusée aussi).
- [x] Rate-limit par IP (`express-rate-limit`) : 20 requêtes/min sur `/api/coach/explain`, 10 requêtes/10 min sur `/api/lichess/import`. `TRUST_PROXY` est réglé automatiquement sur Cloud Run (`K_SERVICE`) pour lire la vraie IP.
- [x] Taille du body plafonnée à 100 Ko (413 au-delà) ; PGN limité à 60 000 caractères ; timeout de 10 s sur l'appel à Lichess.
- [x] Validation des corps de requête avec `zod` (400 sinon) : FEN vérifié par `chess.js`, coups, évaluations, classification et `pv` restreints à des jeux de caractères sans guillemets ni retours à la ligne, ce qui empêche d'injecter des instructions dans le prompt Gemini. Les champs inconnus sont ignorés.
- [x] Erreurs génériques côté client (plus de `error.message` ni de texte brut de Lichess) ; l'`id` renvoyé par Lichess est validé avant d'être réutilisé. Un gestionnaire d'erreurs JSON couvre les corps trop gros ou mal formés.

### 2. Latence et coût de l'appel Gemini (`server.ts`) — fait

- [x] `Promise.race` remplacé par un `AbortController` par tentative (`config.abortSignal`) : le timeout annule réellement la requête.
- [x] Pire cas ramené de 24 s à 9 s (2 modèles, 5 s par tentative, budget total de 9 s < timeout client de 10 s). `gemini-flash-latest`, alias redondant, est retiré ; les erreurs rapides (404, 429, JSON invalide) passent au modèle suivant sans attendre.
- [x] Cache LRU en mémoire (500 entrées, 24 h) sur le prompt complet (FEN, coups, évaluations, classification…) : seules les vraies réponses Gemini sont mises en cache, jamais le repli heuristique. Les requêtes identiques simultanées partagent un seul appel.
- [x] Noms de modèles vérifiés : `gemini-3.8-flash` et `gemini-3.1-flash-lite` figurent dans les types du SDK installé (`@google/genai`), `gemini-flash-latest` dans son README.
- [x] Le client envoie `classificationKey` (enum `MoveClassification`, validé par `zod`) ; le serveur n'analyse plus de sous-chaînes françaises. Le libellé `classification` ne sert plus qu'à l'affichage dans le prompt.

### 3. Découpage des gros fichiers — fait

Vérifié avec `tsc --noEmit`, `vite build`, une comparaison du DOM avant/après (Playwright, sur une partie analysée, avec heatmap, échiquier retourné, aperçu de l'alternative, thème/taille, Bilan et modale PGN) et un test des interactions (navigation clavier, exploration libre, flèches au clic droit, auto-play, préférences conservées après rechargement). Les seules différences de DOM sont l'ordre de certaines classes/attributs et le bruit du moteur Stockfish (résultats non déterministes d'une analyse à l'autre).

- [x] `src/App.tsx` : 1671 → 409 lignes (composition uniquement). Logique extraite dans `src/hooks/` : `usePersistentState` (remplace les 5 usages de `localStorage` dupliqués), `useGameAnalysis`, `usePlayback`, `useMoveSound`, `useGamePosition`, `useMoveAnnotations`, `useCriticalMoments`, `useSandbox`, `useLichessImport`, `useKeyboardShortcuts`. Interface extraite dans `components/AppHeader/` (en-tête, bandeau de progression) et `components/GameView/` (bandeau ouverture, barre joueur, barre d'outils, résumé du contrôle de l'espace, notices, contrôles de lecture). Types partagés dans `src/types/ui.ts`, constantes de mise en page dans `src/utils/boardLayout.ts`.
- [x] `ChessBoard.tsx` : 999 → 378 lignes. Extraits : `boardTheme.ts`, `useBoardDrawing.ts` (flèches/surbrillances au clic droit), `ArrowsOverlay.tsx`, `HeatmapOverlay.tsx`, `ThreatMarkers.tsx`, `threatInfo.ts`.
- [x] `Dashboard.tsx` : 598 → 99 lignes. Extraits : `PlayerAccuracyCard`, `PhaseBreakdown`, `MoveBreakdown`, `utils/phaseStats.ts` (calcul des phases, maintenant typé : plus de `any` dans `PlayerRadarChart`) et `utils/gameSummary.ts` (texte du bilan partagé).
- Petits changements de comportement assumés : `runAnalysis` lit désormais le pseudo et la couleur courants (il utilisait ceux du premier rendu à cause d'un `useCallback` sans dépendances) ; toute navigation manuelle (boutons, graphique, liste de coups, clavier) quitte l'exploration libre et arrête l'auto-play, comme le faisait déjà le clavier ; les raccourcis avec Ctrl/Cmd/Alt ne sont plus interceptés (Ctrl+F…) ; une phase sans coup affiche « - » dans « Gaffes / Fautes ».
- Reste volumineux (hors périmètre de ce point) : `MoveComparison.tsx` (724), `EvaluationChart.tsx` (653), `PlayerRadarChart.tsx` (549), `MoveList.tsx` (423).

## Priorité moyenne

### 4. Qualité et outillage — fait

Commandes : `bun run test` (Vitest), `bun run lint` (ESLint), `bun run typecheck` (`tsc --noEmit`), `bun run format` / `format:check` (Prettier), `bun run check` (tout sauf le build).

- [x] **Tests Vitest** (138 tests, 9 fichiers, ~1 s) sur la logique pure : classification des coups, pourcentage de victoire, précision et statistiques (`utils/moveAnalysis.ts`, extrait de `stockfishEngine.ts` pour être testable sans moteur), `pgnParser`, `clockUtils`, `openingBook` (livre intégré et base complète), `chessNotation`, `chessMaterial`, `phaseStats`, `gameSummary`, et les schémas de validation du serveur (`server/schemas.ts`, extraits de `server.ts`), dont le garde-fou contre l'injection de prompt.
- [x] **ESLint** (config plate, `typescript-eslint`, `react-hooks` v7) et **Prettier** (`singleQuote`, 120 colonnes), dépôt entièrement reformaté dans un commit à part. `typescript-eslint` ne supporte pas encore TypeScript 7 : `eslint.config.js` redirige son `require('typescript')` vers `@typescript/typescript6` (le compilateur `tsc` reste en TS 7). À retirer quand `typescript-eslint` supportera TS ≥ 7.1.
- [x] **CI** GitHub Actions (`.github/workflows/ci.yml`) : lint, typecheck, format, tests, build, avec Bun.
- [x] **`any` réduits à zéro** (la règle `no-explicit-any` est en erreur) : corps de requête du serveur typés par `zod`, réponse de Gemini validée par `explanationSchema` (une réponse mal formée bascule sur le modèle suivant puis sur le repli heuristique), erreurs en `unknown`.
- Bugs trouvés par les tests et corrigés : `formatPvToFrench` numérotait toujours la variante à partir de 1 (il lisait `history()`, vide quand on charge une FEN) et retombait sur de l'UCI brut au premier coup illégal.
- Trois points relevés pendant ce travail, corrigés ensuite :
  - **Noms d'ouverture décalés** : `public/openings.json` attachait à une position le nom d'une ligne qui la prolonge (après `1.e4 e6`, « King's Indian Attack »). Il est maintenant régénéré depuis les `.tsv` par `scripts/build-openings.ts` (`bun run build:openings`) : le nom n'est renseigné que sur la position où une ligne nommée se termine, et toutes les suites connues sont conservées (un coup théorique n'est plus rejeté parce qu'il n'était pas la suite retenue). `checkIsTheoreticalMove` renvoie le nom de la position atteinte, et `analyzeFullGame` garde le dernier nom rencontré pour les coups théoriques sans nom exact (au lieu du nom final de la partie). Un test vérifie que le JSON est à jour par rapport aux `.tsv`.
  - **Coups de Tour en notation française** : `Te1` devenait `Ke1` dans `checkIsTheoreticalMove`. Ajout de `toEnglishSan` (inverse de `toFrenchSan`, en une seule passe) ; un coup légal tel quel en anglais est gardé, sinon il est lu en français.
  - **`strict` activé** dans `tsconfig.json` (le code passait déjà). `tsconfig.json` a maintenant un `include` explicite : sans lui, `tsc` analysait `dist/` et `public/*.js`, ce qui le ralentissait de 4 s à près de 100 s.

### 5. Dépôt et dépendances — fait

- [x] **Source unique pour le moteur** : `public/` passe de 7,9 Mo à 1 Mo (il ne reste que `openings.json` et le favicon). Les fichiers du moteur (`stockfish-19.js`/`.wasm`, identiques octet pour octet à ceux du paquet) ne sont plus copiés dans le dépôt : `vite/stockfishPlugin.ts` les sert à la racine en développement et les ajoute à `dist/` au build, depuis `node_modules/stockfish`. Le plugin échoue avec un message clair si les fichiers manquent (mise à jour du paquet), et la CI vérifie leur présence dans `dist/`.
- [x] **Ancien repli supprimé** : le moteur v10 (`stockfish.js` + 2 wasm) et le build asm.js de Stockfish 19 (3,1 Mo, jamais chargé) sont retirés. Il n'y a plus qu'un moteur ; s'il ne peut pas tourner (WebAssembly absent, worker en erreur), les positions sont évaluées par l'heuristique intégrée, qui existait déjà comme dernier repli.
- [x] **Dépendances** : retrait de `stockfish.js`, et de `motion`, `autoprefixer` et `esbuild` qui n'étaient importés nulle part (5 paquets en moins dans `bun.lock`). `stockfish` reste, il alimente le plugin.
- [x] **Paquet renommé** `echiquier-ia` (avec une description) ; `tsx` passe en `dependencies`.
- [x] **Un seul gestionnaire : Bun** (`bun.lock`), déclaré par `"packageManager": "bun@1.3.11"`, documenté dans le README, et les verrous des autres gestionnaires sont ignorés par git.
- [x] **README** (démarrage, commandes, configuration, architecture, déploiement) ; `.env.example` réécrit (variables réelles, sans référence à AI Studio) ; **`PORT`** lu depuis l'environnement (`server/config.ts`, 3000 par défaut, valeur invalide ignorée).
- Changements de comportement : `bun run start` lance maintenant le serveur **en production** (`NODE_ENV=production`, sert `dist/`) ; avant, il démarrait le serveur de développement. `bun run dev` est inchangé.
- Vérifié : le moteur est chargé depuis `node_modules` en développement et en production (workers → `200 /stockfish-19.wasm`, évaluations réelles), `bun run start` sur un `PORT` donné, build sans avertissement (import du plugin avec extension, `__dirname` remplacé par `import.meta.dirname`).

### 6. Moteur Stockfish (`src/services/stockfishEngine.ts`) — fait

Mesures (partie réelle de 82 demi-coups, machine à 4 cœurs, navigateur headless) :

| Workers | 1     | 2     | 3 (défaut ici) | 4     |
| ------- | ----- | ----- | -------------- | ----- |
| d = 14  | 3,9 s | 2,6 s | 1,8 s          | 1,7 s |

| Profondeur        | 8     | 10    | 12    | 14    | 16    | 18   | 20   |
| ----------------- | ----- | ----- | ----- | ----- | ----- | ---- | ---- |
| Durée (3 workers) | 0,9 s | 1,0 s | 0,9 s | 1,8 s | 5,7 s | 14 s | 20 s |

- [x] **Nombre de workers** : `defaultWorkerCount(navigator.hardwareConcurrency)` = cœurs − 1, entre 1 et 6 (2 si inconnu). Sur 4 cœurs : 3 workers au lieu de 2, soit −30 % de temps (le 4ᵉ n'apporte rien). L'écran d'import affiche le nombre de processus utilisés.
- [x] **Profondeur et temps réglables** : le choix de profondeur existait mais n'était pas mémorisé et ses durées affichées (« ~15 s », « ~35 s ») étaient 10 à 20 fois trop pessimistes. Il est maintenant conservé entre les sessions, les durées sont les mesures ci-dessus, et deux niveaux s'ajoutent : Expert (16) et Maître (18). Le délai maximum par position (`searchTimeLimitMs`) n'est plus fixé à 3,5 s : il reste à 3,5 s jusqu'à la profondeur 12 puis croît de 50 % par niveau (plafond 30 s), sinon une analyse profonde était coupée en silence.
- [x] **Table de transposition bornée** : cache LRU de 2 000 évaluations (`utils/lruCache.ts`). Il mémorise aussi la profondeur atteinte : avant, une position analysée à d = 8 était resservie telle quelle à d = 14, et les évaluations heuristiques de repli (timeout, erreur) étaient mises en cache définitivement. Seules les évaluations issues du moteur sont désormais conservées, et une entrée ne répond qu'aux demandes de profondeur égale ou inférieure.
- [x] **COOP/COEP : inutiles, décision prise.** `public/stockfish-19.js` + `.wasm` est la build _lite mono-thread_ de `stockfish` (mêmes tailles : 21 415 o et 1,79 Mo) ; la build multi-thread pèse ~94 Mo et exige l'isolation cross-origin. Pour analyser une partie entière, le parallélisme entre positions (un worker par position) est de toute façon plus efficace qu'une recherche multi-thread sur une seule position. Aucun en-tête à ajouter. (Le badge « Stockfish 19 » désigne donc la version lite.)
- [x] **Bug corrigé : `bestmove` périmé après un timeout.** À l'expiration du délai, le worker était réutilisé aussitôt pour la position suivante alors qu'il n'avait pas fini d'afficher le `bestmove` de la recherche interrompue : celui-ci pouvait terminer la recherche suivante avec le mauvais coup. Le worker reste maintenant occupé jusqu'à ce `bestmove`, et est redémarré s'il ne répond pas dans les 1,5 s.
- Tests : 27 tests du service avec un faux worker UCI (pool, file d'attente, cache, timeout, course `bestmove`, worker muet, repli classique, `destroy`), vérifiés par mutation (en réintroduisant les deux défauts, 4 tests échouent).

## Priorité basse

### 7. Accessibilité et UX — fait

État de départ : audit axe-core (2 à 3 règles en échec par écran : contraste, zoom désactivé, repères de page) et audit manuel : **aucun** attribut ARIA dans l'appli, cases de l'échiquier inaccessibles au clavier, aucune annonce, et le raccourci global Espace volait la touche aux boutons focalisés. Après : **0 violation axe** sur les quatre écrans (accueil, échiquier analysé, bilan, modale).

- [x] **Échiquier au clavier** : grille ARIA (`role="grid"`, une seule case dans l'ordre de tabulation, « roving tabindex »). Flèches, Début/Fin pour se déplacer (directions miroir quand l'échiquier est retourné), Entrée/Espace pour sélectionner ou jouer en exploration libre, Échap pour quitter. Chaque case porte un nom en français (« e4, pion blanc », « tour blanche », « sélectionné », « coup possible », menace tactique). Le focus obtenu à la souris n'est pas gardé : après un clic, les flèches continuent de naviguer dans la partie.
- [x] **Annonces aux lecteurs d'écran** : région `aria-live` qui annonce le coup courant en navigation (joueur, coup en français, qualité, évaluation, meilleur coup après une faute, position dans la partie), le début et la fin d'analyse, les coups et la sortie de l'exploration, et chaque bascule (échiquier retourné, annotations, contrôle de l'espace, aperçu, son, lecture). Pas d'annonce coup par coup pendant la lecture automatique.
- [x] **Raccourcis** : Espace/Entrée restent aux boutons et liens focalisés, les flèches restent à la grille, tout reste aux champs de formulaire et aux dialogues. (L'aide des raccourcis, touche `?` et bouton de l'en-tête, a été retirée ensuite : voir le point 10.)
- [x] **Dialogues** accessibles (`Modal`) pour l'import PGN : focus piégé, Échap, focus rendu au déclencheur, reste de la page rendu inerte.
- [x] **Sémantique** : liste de coups (`aria-current`, libellé complet « Coup 3, Blancs : Fb5, Erreur, réflexion longue… »), boutons à bascule en `aria-pressed`, groupes nommés, boutons icône nommés, barre et graphiques décrits (`role="img"`), radar décrit, progression de l'analyse en `progressbar`, explication de l'IA annoncée.
- [x] **Formulaire d'import** : champs libellés, profondeur en boutons radio natifs (flèches), sélecteur de fichier enfin atteignable au clavier (il était en `display:none`), erreurs en `role="alert"`.
- [x] **Visuel** : contraste (`text-slate-500` à 3,6–4:1 remplacé par `text-slate-400`), zoom autorisé (`user-scalable=no` retiré), focus clavier visible partout, `prefers-reduced-motion` respecté (CSS et défilement), lien d'évitement « Aller au contenu principal ».
- Tests : environnement `jsdom` + Testing Library ; 70 tests de composants et de hooks (échiquier, liste de coups, formulaire, dialogues, annonces, raccourcis) et des parcours navigateur de bout en bout (clavier seul : analyse, exploration, dialogues, annonces).
- Limite : vérifié avec axe-core, des tests DOM et le navigateur, pas avec un vrai lecteur d'écran (NVDA, VoiceOver) : à faire pour valider le ressenti.

### 8. Performance front — fait

Mesures en production, partie réelle, réseau « 3G rapide » simulé (1,6 Mb/s, 150 ms) et CPU ralenti ×4 :

|                                                    | Avant                                                                             | Après                                                                            |
| -------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Premier affichage (FCP / LCP)                      | 3 560 ms                                                                          | **1 676 ms**                                                                     |
| JS chargé avant le premier affichage (brut → gzip) | 435 Ko → 132 Ko                                                                   | 115 Ko + React 219 Ko (chunk stable) + chess.js 35 Ko → **115 Ko** gzip au total |
| `openings.json`                                    | 995 Ko non compressé, demandé au clic sur « Analyser » (il bloquait le démarrage) | **152 Ko** (brotli), préchargé au repos                                          |
| `stockfish-19.wasm`                                | 1,75 Mo non compressé, téléchargé dès l'ouverture de la page                      | 1,12 Mo (brotli), téléchargé quand le navigateur est au repos                    |

- [x] **Compression** brotli/gzip et **en-têtes de cache** côté serveur (`server/static.ts`) : `assets/*` (noms hachés) immuables un an, le reste revalidé par ETag (304). Le serveur n'avait aucune compression.
- [x] **Chargement différé** : le moteur ne démarre plus à l'import (workers créés au premier besoin ou par `warmUp()`), le livre d'ouvertures (1 Mo) est téléchargé au repos, une analyse n'attend plus son téléchargement, et un échec de chargement est retenté (il restait vide jusque-là). Le chargeur est injectable : le code Node (`fs`) disparaît du bundle navigateur.
- [x] **Découpage du bundle** : échiquier, graphique d'évaluation, comparaison de coups, liste de coups et bilan sont des chunks chargés à la demande (`React.lazy`), préchargés au repos et au lancement de l'analyse ; React et chess.js ont chacun un chunk stable (cache conservé entre déploiements).
- Les graphiques sont déjà du SVG maison : il n'y a pas de bibliothèque de graphiques à différer.

### 9. Persistance des parties analysées — fait

Proposition 1. Une analyse prend de quelques secondes à plusieurs dizaines de secondes (selon la profondeur) et était perdue au rechargement de la page.

- [x] **Service `gameStore`** (`src/services/gameStore.ts`, IndexedDB, sans dépendance) : enregistre le PGN, la profondeur et le résultat complet de l'analyse (explications de l'entraîneur IA et perspective Blancs/Noirs comprises). Clé = empreinte du PGN normalisé (retours à la ligne et espaces ignorés), avec comparaison du texte à la lecture ; 20 parties au plus (les plus anciennes sont supprimées) ; version de schéma (`SCHEMA_VERSION`) pour ignorer les anciens formats, et entrées illisibles ignorées ; sans effet si IndexedDB est indisponible (navigation privée, quota, blocage) : l'app fonctionne comme avant.
- [x] **Restauration au démarrage** (`restoreLast`, appelée par `App`) : la dernière partie analysée est rouverte directement sur l'échiquier, au premier coup, avec sa perspective ; annonce « Dernière partie analysée rouverte » pour les lecteurs d'écran. Un indicateur de chargement remplace brièvement l'écran d'accueil pendant la lecture (abandon après 2 s si le stockage ne répond pas), et une analyse lancée entre-temps n'est jamais écrasée.
- [x] **Ré-analyse instantanée** : analyser un PGN déjà enregistré avec une profondeur égale ou inférieure à celle enregistrée réutilise le résultat sans relancer Stockfish (pseudo et couleur courants appliqués) ; une profondeur supérieure relance l'analyse et remplace l'entrée.
- [x] **Synchronisation** : chaque changement du résultat affiché (nouvelle analyse, nouvelle explication IA, changement de perspective) est réécrit, avec un délai de 250 ms pour regrouper les changements rapprochés ; un résultat tout juste restauré n'est pas réécrit.
- [x] **Tests** (`fake-indexeddb`, 24 tests) : aller-retour, normalisation, collision de clé, plafond de 20, version de schéma, données corrompues, stockage indisponible ; dans `useGameAnalysis` : enregistrement, explications, réutilisation selon la profondeur, pseudo/couleur courants, restauration (une seule fois, sans réécriture, sans écraser une analyse en cours, abandon sur délai). Vérifiés par mutation : chacun des défauts réintroduits fait échouer un test. Cette vérification a révélé deux tests vides (leur jeu de données était refusé par le service), corrigés.
- Vérifié dans le navigateur (partie d'exemple, profondeur 18) : analyse réelle 7,8 s ; après rechargement, plateau restauré en 0,67 s avec la perspective Noirs ; même PGN ré-analysé en 0,33 s ; sans IndexedDB, l'écran d'accueil et l'analyse fonctionnent normalement.
- Piège de mesure relevé : la barre d'outils de l'échiquier s'affiche dès le début d'une analyse, pas à sa fin ; un test qui attend ce texte mesure l'apparition de l'écran. Il faut attendre l'annonce « Analyse terminée ».
- Hors périmètre, volontairement : pas d'écran « mes parties » (l'interface vient d'être allégée) et pas de synchronisation entre appareils. Les données restent dans le navigateur ; les effacer passe par les réglages du navigateur.

### 10. Retrait de l'aide des raccourcis — fait

Proposition 2. L'aide (fenêtre « Raccourcis clavier ») a été retirée à la demande dans la PR #4, puis réintroduite par le travail d'accessibilité (PR #9) : touche `?` **et** bouton (icône clavier) dans l'en-tête. Les raccourcis eux-mêmes restent actifs.

- [x] Retiré : `KeyboardHelp`, le bouton de l'en-tête, la touche `?` (`onHelp`), l'état `isHelpOpen`, les tests correspondants et la mention dans le README. Les raccourcis (flèches, `Maj+←/→`, Espace, `F`, `E`, `M`, `A`, `H`, Échap) restent actifs et accessibles ; seule leur liste n'est plus affichée dans l'appli.

### 11. Mobile et écran d'analyse — fait

Points 3 et 4 de la liste de priorités reçue (voir « Reste de la liste » plus bas).

**Écran d'analyse (point 4)**

- [x] **Annulation** : `analyzeFullGame` et `evaluatePosition` acceptent un `AbortSignal`. Les positions en attente sont retirées de la file, les recherches en cours reçoivent `stop` et leur worker reste occupé jusqu'à son `bestmove` (le `bestmove` périmé ne peut donc pas être pris pour la position suivante), et rien n'est mis en cache. `useGameAnalysis.analyze` rend `{ status: 'done' | 'cancelled' | 'failed' }` ; une annulation laisse la partie précédente et le stockage intacts. Une nouvelle analyse remplace celle qui tourne, et quitter la page l'annule.
- [x] **Affichage progressif** : le moteur envoie les coups déjà analysés (préfixe de la partie, dès que les deux positions d'un coup sont évaluées, au plus un envoi toutes les 200 ms, avec un envoi différé pour que le dernier lot ne soit pas perdu). `useGameAnalysis` expose `partial` ; l'échiquier s'ouvre dès 8 demi-coups (`PROGRESSIVE_MIN_PLIES`) et la suite arrive au fur et à mesure. L'onglet « Bilan », les explications IA et l'enregistrement attendent la fin ; « Partie Lichess » utilise le PGN de la partie affichée.
- [x] **Progression dans le formulaire** : l'écran d'accueil et la fenêtre « Autre PGN » restent ouverts pendant l'analyse, avec barre de progression, positions évaluées et bouton « Annuler l'analyse » (les champs sont verrouillés). La fenêtre se referme quand les premiers coups s'affichent ; ensuite une bannière (progression + « Annuler ») prend le relais. Annuler depuis la bannière revient à la partie précédente.
- Vérifié dans le navigateur (partie de 82 demi-coups, profondeur 18) : formulaire avec progression, plateau dès 8 demi-coups puis jusqu'à 82, « Bilan » désactivé puis réactivé, annulation depuis le formulaire (formulaire éditable, annonce « Analyse annulée ») et depuis la bannière (partie précédente restaurée).
- Tests : 13 nouveaux pour le moteur (faux worker UCI) et 10 pour le hook ; vérifiés par mutation (15 défauts réintroduits : tous détectés). Cette vérification a trouvé un vrai défaut, corrigé : un résultat partiel pouvait encore être envoyé juste après une annulation. `isAbortError` ne s'appuie plus sur `instanceof Error` (faux pour `DOMException` sous jsdom).

**Mobile (point 3)**

- [x] **En-tête compacté** : une seule rangée sur téléphone (pseudo et perspective en icônes, son, « Autre PGN ») ; le doublon des deux boutons « son » est supprimé. **51 px** de haut au lieu de 2 rangées.
- [x] **Barre d'outils compactée** : une seule rangée défilante au lieu de trois, sans le choix de taille de l'échiquier (inutile quand il prend toute la largeur) ; zones de toucher agrandies. Le début de l'échiquier passe d'environ 330 px à **228 px** du haut sur un écran de 844 px.
- [x] **Navigation collée en bas** (`BottomNav`) : « Échiquier » / « Bilan » en bas de l'écran, avec la zone de sécurité des iPhone (`viewport-fit=cover`) ; les onglets de l'en-tête (`ViewTabs`) ne restent que sur les écrans plus larges.
- [x] **Balayage** (`useSwipe`, événements pointer, tactile uniquement) : vers la gauche = coup suivant, vers la droite = coup précédent. Il s'applique à la vue de jeu **hors échiquier** : sur tactile, glisser une pièce d'une case à une autre joue un coup, un balayage sur le plateau pourrait donc jouer une pièce. Sont aussi exclus les bandes défilantes (`data-no-swipe` : barre d'outils, « Tournants clés »), les champs et les dialogues. Seuils : 60 px, mouvement plutôt horizontal (×1,5), moins de 600 ms ; désactivé pendant l'exploration libre.
- Vérifié avec de vrais gestes tactiles (Chrome émulé, 390 × 844) : balayage gauche puis droite sur la barre joueur (coup 1 → 2 → 1), sans effet sur le plateau, barre d'outils qui défile, navigation basse, aucun débordement horizontal ; le bureau est inchangé. Tests : 12 pour `useSwipe` (9 mutations détectées) et 3 pour `BottomNav`.
- Limite : vérifié sur Chrome émulé, pas sur un vrai téléphone (iOS Safari notamment : zone de sécurité, comportement du balayage).

### Reste de la liste de priorités reçue

- [ ] **Points 1 et 2 : mise en page** : échiquier calé sur la hauteur de l'écran, liste de coups remontée, contrôles toujours visibles.
- [ ] **Point 5 : historique des parties** : la persistance (point 9) conserve 20 parties mais n'a pas d'écran pour les rouvrir.
- [ ] **Polish** : animation inversée et captures, glisser avec événements pointer, `prompt()` remplacé (le pseudo l'utilise encore), doublons retirés (deux boutons « son » fusionnés dans l'en-tête, il reste celui des contrôles de lecture), noms d'ouverture harmonisés.

## Ordre suggéré

1 (sécurité serveur) → 2 (Gemini) → 4 (tests sur la logique pure) → 3 (découpage de `App.tsx`), puis le reste.
