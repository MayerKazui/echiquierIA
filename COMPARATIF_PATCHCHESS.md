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

| Besoin                                                         | État | Détail                                                                                                                                                                             |
| -------------------------------------------------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Importer une partie (PGN)                                      | ✅   | Collé, fichier ou exemples.                                                                                                                                                        |
| Import par pseudo Lichess / chess.com                          | ✅   | Filtre de cadence, parties plus anciennes à la demande, appels directs du navigateur. Limites de débit des API acceptées (sujet clos).                                             |
| Analyser toutes ses parties                                    | ✅   | Analyse en lot de 5 à 100 parties en tâche de fond, avec reprise. Historique plafonné à 500 parties (50 complètes, les autres allégées) : plafond retenu, sujet clos.              |
| Mise à jour de l'étude avec les dernières parties              | 🟡   | Manuelle, à la demande (la mise à jour automatique est abandonnée). Réimport et nouvelle analyse en lot possibles ; pas vu de bouton « n'analyser que les nouvelles ».             |
| Profil : faiblesses                                            | ✅   | « Mon profil » : phase, type d'erreur, zeitnot, couleur, force de l'adversaire, cadence, évolution.                                                                                |
| Profil : points forts                                          | ✅   | Section « Vos points forts » dans « Mon profil » : phase solide, précision tenue sous pression ou à vitesse, score contre plus forts, type d'erreur rare.                          |
| Ouvertures jouées et % de victoire                             | ✅   | Onglet « Mes ouvertures » : par couleur, familles et variantes, résultats, sorties de la théorie et leur coût. Pas de précision par ouverture.                                     |
| Analyse détaillée d'une partie                                 | ✅   | Gaffes, bons coups, « brillant », « excellent coup », graphique d'évaluation, précision.                                                                                           |
| Ouverture / milieu / finale bien exécutés                      | ✅   | Précision par phase, phases calculées d'après le matériel.                                                                                                                         |
| Thèmes tactiques manqués                                       | 🟡   | Fourchette, clouage, enfilade, pièce en prise, plus mat manqué et avantage gâché. Lichess a une soixantaine de thèmes.                                                             |
| Erreurs évitables avec explication tactique                    | ✅   | Coach IA (Gemini) sur les moments clés, repli local sans clé. Pas d'extension du coach aux puzzles et aux études (sujet clos).                                                     |
| Programme d'entraînement sur ses faiblesses                    | ✅   | « Mon plan » : trois objectifs au plus (erreurs qui reviennent, sortie d'ouverture coûteuse, habitude, phase fragile), avec progression sur 7 jours et le bouton qui lance chacun. |
| Woodpecker                                                     | ❌   | Pas de base de puzzles dans le projet. À réfléchir ensemble avec les puzzles.                                                                                                      |
| Puzzles : thèmes, Elo, timer                                   | ❌   | Idem. Sujet gardé, à réfléchir ensemble.                                                                                                                                           |
| Puzzles ratés à refaire                                        | 🟡   | Mécanique prête pour les erreurs de ses parties (`trainingStore`, `spacedRepetition`), à étendre aux puzzles.                                                                      |
| Explorateur d'ouvertures                                       | ✅   | Bouton « Ouvertures » : arbre coup par coup (~3 800 lignes lichess, noms français), échiquier, résultats de ses parties, coups hors du livre. Pas de stats mondiales.              |
| Études : création, chapitres, intro, commentaires, annotations | ❌   | Seul le bac à sable « Et si j'avais joué… ? » existe, sans sauvegarde. Études privées, stockées dans le navigateur.                                                                |
| Étude verrouillable, jeu contre l'ordinateur avec variantes    | ❌   | Rien d'équivalent.                                                                                                                                                                 |
| Import PGN d'étude ou de chapitre                              | ❌   | L'import actuel (`chess.js`) ne gère qu'une ligne principale. À confirmer : je pense que `chess.js` écarte les variantes.                                                          |
| Partage d'études                                               | ⛔   | Abandonné : il exigerait un serveur ou un hébergeur tiers.                                                                                                                         |
| Mise à jour automatique du profil                              | ⛔   | Abandonnée : la synchronisation se fera manuellement.                                                                                                                              |

Le projet couvre bien l'analyse et le profil, et dépasse le besoin sur le confort : PWA hors ligne, sauvegarde et synchronisation Google Drive, mobile, accessibilité. Les blocs **Woodpecker, puzzles et études** n'existent pas du tout.

## 3. Faisabilité de ce qui reste

**Explorateur d'ouvertures : facile.** Les données sont déjà dans le projet. Il faut construire un arbre à partir des lignes et afficher échiquier, coups suivants et nom de l'ouverture. On peut y ajouter ses propres stats par ouverture, ce qui rejoint la ligne « ouvertures et % de victoire ». Des stats mondiales par coup passeraient par l'API Explorer de Lichess ; je crois qu'elle demande désormais un jeton, **à vérifier** avant de s'y engager. Sans cela, on se limite à ses propres stats.

**Puzzles, tactique, Woodpecker : faisable, avec une décision de données à prendre ensemble.** La base de puzzles Lichess est libre de droits mais très lourde (plusieurs millions de lignes), donc elle ne tient pas entière dans un site statique.

- _Option recommandée :_ embarquer un sous-ensemble (quelques dizaines de milliers de puzzles), figé à la publication, découpé par tranche d'Elo et par thème, chargé à la demande. Compatible avec le hors ligne. Arbitrage à faire : taille, variété par thème et par Elo.
- _Alternative :_ appeler l'API Lichess. La tranche d'Elo n'y est pas librement choisissable, et ce serait moins fiable.

Une fois les puzzles disponibles, le reste est modeste : timer, cycle Woodpecker avec temps total, catégorie « ratés à refaire » (mécaniques existantes).

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

- puzzles (avec Woodpecker, timer et puzzles ratés) : à réfléchir ensemble, notamment le sous-ensemble embarqué ;
- explorateur d'ouvertures.

**Conséquence.** Tout ce qui reste est faisable sans serveur permanent. Le point dur d'origine, le partage des études, disparaît : les études deviennent un chantier uniquement local.

## 5. Ordre recommandé

1. ~~**Ouvertures**~~ : fait. Explorateur en arbre (résultats de ses parties par coup) et onglet « Mes ouvertures » (% de victoire, coup de sortie qui coûte cher).
2. ~~**Points forts et programme d'entraînement**~~ : fait. « Vos points forts » dans le profil, « Mon plan » (menu).
3. **Mise à jour manuelle du profil** : bouton « n'analyser que les nouvelles parties », puisque la mise à jour automatique est abandonnée.
4. **Puzzles, thèmes, Elo, timer, puzzles ratés**, puis **Woodpecker** juste après. À cadrer ensemble d'abord (sous-ensemble embarqué).
5. **Études privées** en dernier : le plus lourd, mais plus simple sans partage.
6. En parallèle, plus petit : **élargir la détection des thèmes tactiques** au-delà des quatre actuels, ce qui nourrit le filtrage des puzzles.

## 6. Questions ouvertes

- [ ] **Puzzles** : sous-ensemble embarqué (taille, découpage par Elo et par thème) ou API Lichess ? À réfléchir ensemble.
- [ ] **Stats mondiales d'ouverture** : l'API Explorer de Lichess exige-t-elle un jeton ? Si oui, s'en passe-t-on et garde-t-on seulement ses propres stats ?
- [ ] **Mise à jour manuelle du profil** : bouton « n'analyser que les nouvelles parties » ? Sous quelle forme ?
- [ ] **Parser PGN** : confirmer que `chess.js` perd les variantes, puis choisir entre une bibliothèque et un analyseur maison.
- [x] **Programme d'entraînement** : plan de trois objectifs au plus, dans une fenêtre du menu, recalculé à chaque ouverture. Pas d'objectif unique à l'ouverture de l'appli (l'écran de départ reste sobre).
- [ ] **Export PGN d'une étude** : non demandé, utile seulement comme sauvegarde personnelle. À décider (la sauvegarde JSON existante couvre peut-être déjà le besoin).

## 7. Fichiers du projet utiles pour la suite

- `ROADMAP.md`, `IMPROVEMENTS.md` : état et historique.
- `src/utils/weaknessProfile.ts`, `src/components/Profile/` : profil de faiblesses.
- `src/utils/faultKinds.ts`, `src/utils/tacticalThreats.ts` : types d'erreur et thèmes tactiques détectés.
- `src/services/trainingStore.ts`, `src/utils/spacedRepetition.ts`, `src/components/Training/` : entraînement et répétition espacée.
- `src/services/openingBook.ts`, `src/data/openings/*.tsv`, `public/openings.json` : livre d'ouvertures.
- `src/utils/pgnParser.ts` : import PGN actuel.
- `src/hooks/useSandbox.ts` : exploration libre (point de départ possible pour l'éditeur d'étude).
- `src/services/gameStore.ts` : stockage IndexedDB (modèle pour stocker les études).
- `src/hooks/useBatchAnalysis.ts`, `src/services/batchAnalysis.ts` : analyse en lot (base du bouton de mise à jour manuelle).
- `server.ts` : serveur limité à Gemini et à l'import Lichess, laissé tel quel.
