# Comparatif : besoin « Patchchess » et projet actuel (Échiquier IA)

Document de réflexion, établi le 2026-10-02 et mis à jour après les décisions prises ensemble (section 4). Aucun code n'a été modifié pour l'établir : il s'appuie sur la lecture de `README.md`, `ROADMAP.md`, `IMPROVEMENTS.md` et du code de `src/`. L'application n'a pas été lancée, donc certains « partiel » sont déduits du code et de la doc.

Légende : ✅ fait · 🟡 partiel · ❌ à faire · ⛔ abandonné

Principe retenu : **pas de serveur permanent**. Tout tourne dans le navigateur, avec les API publiques de Lichess et chess.com. Ce qui exigerait un serveur est abandonné.

## 1. Le besoin d'origine (Patchchess)

Application qui permet soit d'importer une partie pour l'analyser, soit de renseigner son pseudo Lichess ou chess.com pour analyser toutes ses parties.

**L'analyse.** Une fois l'analyse terminée, une étude complète du profil du joueur : points forts, points faibles, ouvertures utilisées et pourcentage de victoire. On doit pouvoir revenir sur une partie pour voir l'analyse poussée : gaffes, bons coups, qualité de l'ouverture, du milieu de jeu et de la finale, thèmes tactiques manqués, erreurs évitables avec explication tactique. L'étude est stockée, et peut être mise à jour à la demande avec les dernières parties. Un programme d'entraînement sur ses faiblesses doit être proposé.

**Woodpecker.** Choix d'une tranche d'Elo, du nombre de puzzles par cycle, et temps total affiché à la fin du cycle.

**Ouvertures.** Explorer les ouvertures en s'appuyant sur https://github.com/lichess-org/chess-openings.

**Tactique.** Puzzles avec choix des thèmes, d'une tranche d'Elo, et d'un timer (par exemple un maximum de puzzles en 10 minutes). Les puzzles ratés (comme pour Woodpecker) vont dans une catégorie spécifique pour les refaire jusqu'à réussite.

**Études** (à la manière de Lichess).

- Études privées, ~~partageables~~ (abandonné, voir section 4), avec commentaires sur les coups, introduction, chapitres et annotations.
- Étude verrouillable et déverrouillable pour « jouer » contre l'ordinateur, qui joue les coups de l'étude en prenant parfois les variantes et pas uniquement la ligne principale. En cas de bifurcation par rapport aux lignes de l'étude, le coup est annulé pour reprendre la ligne.
- Import de PGN au format Lichess, pour l'étude entière ou pour un seul chapitre.

## 2. Comparatif avec le projet actuel

| Besoin                                                         | État | Détail                                                                                                                                                                                                                                                         |
| -------------------------------------------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Importer une partie (PGN)                                      | ✅   | Collé, fichier ou exemples.                                                                                                                                                                                                                                    |
| Import par pseudo Lichess / chess.com                          | ✅   | Filtre de cadence, parties plus anciennes à la demande, appels directs du navigateur. Limites de débit des API acceptées (sujet clos).                                                                                                                         |
| Analyser toutes ses parties                                    | ✅   | Analyse en lot de 5 à 100 parties en tâche de fond, avec reprise. Historique plafonné à 500 parties (50 complètes, les autres allégées) : plafond retenu, sujet clos.                                                                                          |
| Mise à jour de l'étude avec les dernières parties              | 🟡   | Manuelle, à la demande (la mise à jour automatique est abandonnée). Réimport et nouvelle analyse en lot possibles ; pas vu de bouton « n'analyser que les nouvelles ».                                                                                         |
| Profil : faiblesses                                            | ✅   | « Mon profil » : phase, type d'erreur, zeitnot, couleur, force de l'adversaire, cadence, évolution.                                                                                                                                                            |
| Profil : points forts                                          | ✅   | Section « Vos points forts » dans « Mon profil » : phase solide, précision tenue sous pression ou à vitesse, score contre plus forts, type d'erreur rare.                                                                                                      |
| Ouvertures jouées et % de victoire                             | ✅   | Onglet « Mes ouvertures » : par couleur, familles et variantes, résultats, sorties de la théorie et leur coût. Pas de précision par ouverture.                                                                                                                 |
| Analyse détaillée d'une partie                                 | ✅   | Gaffes, bons coups, « brillant », « excellent coup », graphique d'évaluation, précision.                                                                                                                                                                       |
| Ouverture / milieu / finale bien exécutés                      | ✅   | Précision par phase, phases calculées d'après le matériel.                                                                                                                                                                                                     |
| Thèmes tactiques manqués                                       | 🟡   | Fourchette, clouage, enfilade, pièce en prise, plus mat manqué et avantage gâché. Lichess a une soixantaine de thèmes.                                                                                                                                         |
| Erreurs évitables avec explication tactique                    | ✅   | Coach IA (Gemini) sur les moments clés, repli local sans clé. Pas d'extension du coach aux puzzles et aux études (sujet clos).                                                                                                                                 |
| Programme d'entraînement sur ses faiblesses                    | ✅   | « Mon plan » : trois objectifs au plus (erreurs qui reviennent, sortie d'ouverture coûteuse, habitude, phase fragile), avec progression sur 7 jours et le bouton qui lance chacun, plus les puzzles du thème correspondant (mat, pièce en prise, fourchette…). |
| Woodpecker                                                     | ✅   | Onglet « Woodpecker » de la fenêtre « Puzzles » : lot figé (20 à 500 puzzles, tranche d'Elo au choix), cycles chronométrés avec pause, ratés repris en fin de cycle, temps comparé au cycle précédent. Pas encore d'historique détaillé par thème.             |
| Puzzles : thèmes, Elo, timer                                   | ✅   | Menu « Puzzles » : 200 000 puzzles Lichess, tranche d'Elo, 73 thèmes en français (un ou tous), timer de 3 à 15 minutes ou sans limite, sans pénalité. Pas encore d'historique des scores.                                                                      |
| Puzzles ratés à refaire                                        | ✅   | Répétition espacée : un puzzle raté revient demain, puis après 1, 3 et 7 jours ; « Revoir mes puzzles ratés » et « Réviser en avance ». Dans la sauvegarde JSON (format 4) et la synchronisation Drive.                                                        |
| Explorateur d'ouvertures                                       | ✅   | Bouton « Ouvertures » : arbre coup par coup (~3 800 lignes lichess, noms français), échiquier, résultats de ses parties, coups hors du livre. Pas de stats mondiales.                                                                                          |
| Études : création, chapitres, intro, commentaires, annotations | ✅   | Menu « Études » : études privées dans le navigateur (IndexedDB), chapitres, introduction, variantes, commentaires, glyphes (!, ?, ±…). Flèches et cercles dessinés (clic droit) et gardés avec la position.                                                    |
| Étude verrouillable, jeu contre l'ordinateur avec variantes    | ✅   | « Jouer ce chapitre (verrouiller) » : l'ordinateur joue les coups de l'étude, parfois une variante (40 %) ; un coup hors étude est annulé. Indice, choix du côté, « Déverrouiller ».                                                                           |
| Import PGN d'étude ou de chapitre                              | ✅   | Analyseur maison (`chess.js` écarte bien les variantes) : une étude Lichess entière (une partie par chapitre) ou une seule partie, collée ou en fichier. Export PGN d'une étude ou d'un chapitre.                                                              |
| Partage d'études                                               | ⛔   | Abandonné : il exigerait un serveur ou un hébergeur tiers.                                                                                                                                                                                                     |
| Mise à jour automatique du profil                              | ⛔   | Abandonnée : la synchronisation se fera manuellement.                                                                                                                                                                                                          |

Le projet couvre bien l'analyse et le profil, et dépasse le besoin sur le confort : PWA hors ligne, sauvegarde et synchronisation Google Drive, mobile, accessibilité. Les blocs **Woodpecker, puzzles et études** étaient absents au départ ; ils sont faits (le lien avec « Mon plan » et l'historique des puzzles restent à venir).

## 3. Faisabilité de ce qui reste

**Explorateur d'ouvertures : facile.** Les données sont déjà dans le projet. Il faut construire un arbre à partir des lignes et afficher échiquier, coups suivants et nom de l'ouverture. On peut y ajouter ses propres stats par ouverture, ce qui rejoint la ligne « ouvertures et % de victoire ». Des stats mondiales par coup passeraient par l'API Explorer de Lichess ; je crois qu'elle demande désormais un jeton, **à vérifier** avant de s'y engager. Sans cela, on se limite à ses propres stats.

**Puzzles, tactique, Woodpecker : données faites.** La base de puzzles Lichess est libre de droits (CC0) mais très lourde : 307 Mo compressés, environ 6,2 millions de puzzles. Elle ne tient pas entière dans un site statique, d'où un sous-ensemble embarqué (décidé, section 4).

Mesures faites à l'établissement du sous-ensemble : environ 42 octets compressés par puzzle ; **200 000 puzzles = 28 Mo en JSON, 9 Mo compressés**, en 13 fichiers (un par tranche de 200 Elo, de 400 à 2 800, le plus gros à 1 Mo compressé), plus un index de 11 Ko. Chargés à la demande, jamais au démarrage.

Une fois les puzzles disponibles, le reste était modeste : timer, cycle Woodpecker avec temps total, catégorie « ratés à refaire » (mécaniques existantes). Fait.

**Études privées : faisable, c'est le plus gros chantier.** Sans partage, l'ampleur diminue : tout reste dans le navigateur. Il faut :

- un vrai analyseur PGN avec variantes, commentaires et annotations ;
- un modèle de données en arbre, stocké dans IndexedDB comme les parties ;
- un éditeur de chapitres ;
- le mode verrouillé : l'ordinateur joue les coups de l'étude, choisit parfois une variante, et annule un coup hors ligne.

## 4. Décisions prises

**Abandonné** (exigerait un serveur) :

- le partage d'études, sous toutes ses formes (lien, fichier comme moyen de partage, Google Drive, Lichess comme hébergeur) ;
- l'étude collaborative, les classements et comparaisons entre joueurs ;
- la clé Gemini secrète côté navigateur : `server.ts` reste tel quel, le coach IA garde son repli local ;
- la mise à jour automatique du profil : la synchronisation sera manuelle.

**Sujets clos** (rien de plus à faire) :

- analyse de beaucoup de parties : le plafond de 500 est retenu ;
- conservation des données dans le navigateur ;
- limites de débit de l'import chess.com / Lichess ;
- extension des explications du coach IA aux puzzles et aux études.

**Gardés** :

- puzzles (avec Woodpecker, timer et puzzles ratés), cadrés ci-dessous ;
- explorateur d'ouvertures (fait).

**Puzzles : décisions prises ensemble (2026-10-02).**

- **Données : 200 000 puzzles embarqués**, filtrés sur la qualité (écart-type de l'Elo ≤ 100, au moins 100 joueurs, popularité ≥ 80) puis choisis par quotas : chaque case (tranche d'Elo × thème) donne à tour de rôle son puzzle le plus aimé, si bien qu'un thème rare est pris en entier et un thème courant coupé. Le haut débit rend le poids (9 Mo compressés) sans conséquence, car tout est chargé à la demande ; ce qui reste, c'est le poids du dépôt (à commiter une fois) et le cache hors ligne (pas de préchargement par défaut, les fichiers déjà utilisés sont gardés).
- **Puzzles ratés : répétition espacée**, pas « jusqu'à une réussite » : mieux pour ancrer les schémas, et la mécanique existe (`spacedRepetition`). Le puzzle complet est stocké avec sa carte, pour qu'une nouvelle sélection ne le fasse pas disparaître.
- **Timer de la Tactique : sans pénalité.** Un puzzle raté passe au suivant et rejoint les ratés ; le but est d'enchaîner (« farmer »).
- **Woodpecker :** lot **figé** (tiré une fois avec une graine, mémorisé, identique à chaque cycle) ; tranche d'Elo et nombre de puzzles par cycle au choix ; chronomètre global avec bouton pause ; les reprises des puzzles ratés comptent dans le cycle et dans le temps total ; à la fin, temps total comparé au cycle précédent.
- **Elo :** les Elo de puzzles Lichess ne sont ni ceux des parties ni ceux de chess.com. Tranche libre (minimum et maximum), avec un Elo de départ suggéré d'après le profil, sans conversion.
- **Historique des puzzles : second temps, à ne pas oublier.** Garder localement les scores des tempêtes, la précision par thème et les temps de cycle, pour alimenter le profil (points forts et faiblesses aux puzzles) et « Mon plan » (« 20 puzzles de fourchette à ton niveau »). Le lien se fait par les thèmes : fourchette → `fork`, clouage → `pin`, enfilade → `skewer`, pièce en prise → `hangingPiece`, mat manqué → `mateIn1`/`mateIn2`.

**Conséquence.** Tout ce qui reste est faisable sans serveur permanent. Le point dur d'origine, le partage des études, disparaît : les études deviennent un chantier uniquement local.

## 5. Ordre recommandé

1. ~~**Ouvertures**~~ : fait. Explorateur en arbre (résultats de ses parties par coup) et onglet « Mes ouvertures » (% de victoire, coup de sortie qui coûte cher).
2. ~~**Points forts et programme d'entraînement**~~ : fait. « Vos points forts » dans le profil, « Mon plan » (menu).
3. **Mise à jour manuelle du profil** : bouton « n'analyser que les nouvelles parties », puisque la mise à jour automatique est abandonnée.
4. **Puzzles, thèmes, Elo, timer, puzzles ratés**, puis **Woodpecker** juste après. Cadrés (section 4). Avancement :
   1. ~~Données, chargeur et logique d'un puzzle, avec tests~~ : fait.
   2. ~~Écran Puzzles (filtres, timer sans pénalité, puzzles ratés en répétition espacée, sauvegarde)~~ : fait.
   3. ~~Woodpecker (lot figé, cycles chronométrés avec pause, temps comparé, sauvegarde)~~ : fait.
   4. ~~Lien avec « Mon plan »~~ : fait. Reste le lien depuis le profil, puis l'historique des puzzles (second temps).
5. ~~**Études privées**~~ : fait (commencées avant les puzzles, à la demande). Éditeur de chapitres, import et export PGN, chapitre verrouillé contre l'ordinateur.
6. En parallèle, plus petit : **élargir la détection des thèmes tactiques** au-delà des quatre actuels. Correction : cela ne sert pas au filtrage des puzzles (leurs thèmes viennent de la base Lichess), seulement à relier les erreurs de ses propres parties à ces thèmes.

## 6. Questions ouvertes

- [x] **Puzzles** : sous-ensemble embarqué de 200 000 puzzles, découpé par tranche d'Elo de 200 (pas par thème : le filtrage par thème se fait côté navigateur sur la tranche chargée). L'API Lichess est écartée (hors ligne impossible, tranche d'Elo non choisissable).
- [ ] **Historique des puzzles** (second temps) : scores, précision par thème, temps de cycle, branchés sur le profil et « Mon plan ».
- [x] **Puzzles : nouvelle sélection de données.** Les puzzles ratés gardent leur copie complète (FEN, coups, thèmes) : une nouvelle sélection ne les fait pas disparaître.
- [ ] **Puzzles : sans répétition.** Un puzzle déjà joué peut revenir dans une séance d'entraînement (tirage au hasard dans la tranche) ; un historique des puzzles vus (second temps) permettrait de l'éviter.
- [ ] **Stats mondiales d'ouverture** : l'API Explorer de Lichess exige-t-elle un jeton ? Si oui, s'en passe-t-on et garde-t-on seulement ses propres stats ?
- [ ] **Mise à jour manuelle du profil** : bouton « n'analyser que les nouvelles parties » ? Sous quelle forme ?
- [x] **Parser PGN** : analyseur maison (`utils/studyPgn.ts`), `chess.js` ne servant qu'à jouer les coups. Variantes imbriquées, commentaires, glyphes, `[%cal]` et `[%csl]`.
- [x] **Programme d'entraînement** : plan de trois objectifs au plus, dans une fenêtre du menu, recalculé à chaque ouverture. Pas d'objectif unique à l'ouverture de l'appli (l'écran de départ reste sobre).
- [x] **Export PGN d'une étude** : fait (étude entière ou chapitre), au format Lichess. Les études sont aussi dans la sauvegarde JSON (format 3) et la synchronisation Drive (voir `IMPROVEMENTS.md`, « Études »).

## 7. Fichiers du projet utiles pour la suite

- `ROADMAP.md`, `IMPROVEMENTS.md` : état et historique.
- `src/utils/weaknessProfile.ts`, `src/components/Profile/` : profil de faiblesses.
- `src/utils/faultKinds.ts`, `src/utils/tacticalThreats.ts` : types d'erreur et thèmes tactiques détectés.
- `src/services/trainingStore.ts`, `src/utils/spacedRepetition.ts`, `src/components/Training/` : entraînement et répétition espacée.
- `src/services/openingBook.ts`, `src/data/openings/*.tsv`, `public/openings.json` : livre d'ouvertures.
- `src/utils/pgnParser.ts` : import PGN d'une partie (ligne principale seulement) ; `src/utils/studyPgn.ts` : PGN d'étude avec variantes.
- `src/utils/studyTree.ts`, `src/utils/studyPlay.ts`, `src/services/studyStore.ts`, `src/components/Studies/` : études (arbre, jeu verrouillé, stockage, écrans).
- `src/components/Puzzles/` (écran, réglages, séance, bilan), `src/utils/puzzleThemes.ts` (noms français), `src/utils/puzzleReview.ts` et `src/services/puzzleStore.ts` (puzzles ratés et leur répétition espacée), `src/utils/puzzleRun.ts` (tranche d'Elo, durée, ordre), `src/hooks/usePuzzleReview.ts`, `src/hooks/usePlayerElo.ts`.
- `scripts/build-puzzles.ts`, `scripts/puzzlesDataset.ts`, `public/puzzles/` : génération du sous-ensemble de puzzles (`bun run build:puzzles`) et son résultat ; `src/utils/puzzleData.ts` (format, tranches), `src/utils/puzzle.ts` (jouer un puzzle), `src/services/puzzleBook.ts` (chargement à la demande).
- `src/hooks/useSandbox.ts` : exploration libre (point de départ possible pour l'éditeur d'étude).
- `src/services/gameStore.ts` : stockage IndexedDB (modèle pour stocker les études).
- `src/hooks/useBatchAnalysis.ts`, `src/services/batchAnalysis.ts` : analyse en lot (base du bouton de mise à jour manuelle).
- `server.ts` : serveur limité à Gemini et à l'import Lichess, laissé tel quel.
