# Comparatif : besoin « Patchchess » et projet actuel (Échiquier IA)

Document de réflexion, rédigé le 2026-10-02. Aucun code n'a été modifié pour l'établir : il s'appuie sur la lecture de `README.md`, `ROADMAP.md`, `IMPROVEMENTS.md` et du code de `src/`. L'application n'a pas été lancée, donc certains « partiel » sont déduits du code et de la doc.

Légende : ✅ fait · 🟡 partiel · ❌ à faire

## 1. Le besoin d'origine (Patchchess)

Application qui permet soit d'importer une partie pour l'analyser, soit de renseigner son pseudo Lichess ou chess.com pour analyser toutes ses parties.

**L'analyse.** Une fois l'analyse terminée, une étude complète du profil du joueur : points forts, points faibles, ouvertures utilisées et pourcentage de victoire. On doit pouvoir revenir sur une partie pour voir l'analyse poussée : gaffes, bons coups, qualité de l'ouverture, du milieu de jeu et de la finale, thèmes tactiques manqués, erreurs évitables avec explication tactique. L'étude est stockée, et peut être mise à jour à la demande avec les dernières parties. Un programme d'entraînement sur ses faiblesses doit être proposé.

**Woodpecker.** Choix d'une tranche d'Elo, du nombre de puzzles par cycle, et temps total affiché à la fin du cycle.

**Ouvertures.** Explorer les ouvertures en s'appuyant sur https://github.com/lichess-org/chess-openings.

**Tactique.** Puzzles avec choix des thèmes, d'une tranche d'Elo, et d'un timer (par exemple un maximum de puzzles en 10 minutes). Les puzzles ratés (comme pour Woodpecker) vont dans une catégorie spécifique pour les refaire jusqu'à réussite.

**Études** (à la manière de Lichess).

- Études privées, partageables, avec commentaires sur les coups, introduction, chapitres et annotations.
- Étude verrouillable et déverrouillable pour « jouer » contre l'ordinateur, qui joue les coups de l'étude en prenant parfois les variantes et pas uniquement la ligne principale. En cas de bifurcation par rapport aux lignes de l'étude, le coup est annulé pour reprendre la ligne.
- Import de PGN au format Lichess, pour l'étude entière ou pour un seul chapitre.

## 2. Comparatif avec le projet actuel

| Besoin                                                         | État | Détail                                                                                                                                               |
| -------------------------------------------------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Importer une partie (PGN)                                      | ✅   | Collé, fichier ou exemples.                                                                                                                          |
| Import par pseudo Lichess / chess.com                          | ✅   | Filtre de cadence, parties plus anciennes à la demande, appels directs du navigateur.                                                                |
| Analyser toutes ses parties                                    | 🟡   | Analyse en lot de 5 à 100 parties en tâche de fond, avec reprise. Historique de 500 parties (50 complètes, les autres allégées).                     |
| Mise à jour de l'étude avec les dernières parties              | 🟡   | Réimport et nouvelle analyse en lot possibles. Pas vu de bouton « n'analyser que les nouvelles ».                                                    |
| Profil : faiblesses                                            | ✅   | « Mon profil » : phase, type d'erreur, zeitnot, couleur, force de l'adversaire, cadence, évolution.                                                  |
| Profil : points forts                                          | 🟡   | Les chiffres existent, aucun écran ne dit « voici ce que tu fais bien ».                                                                             |
| Ouvertures jouées et % de victoire                             | ❌   | Score par couleur et par adversaire, pas par ouverture. Point 3 de `ROADMAP.md`.                                                                     |
| Analyse détaillée d'une partie                                 | ✅   | Gaffes, bons coups, « brillant », « excellent coup », graphique d'évaluation, précision.                                                             |
| Ouverture / milieu / finale bien exécutés                      | ✅   | Précision par phase, phases calculées d'après le matériel.                                                                                           |
| Thèmes tactiques manqués                                       | 🟡   | Fourchette, clouage, enfilade, pièce en prise, plus mat manqué et avantage gâché. Lichess a une soixantaine de thèmes.                               |
| Erreurs évitables avec explication tactique                    | ✅   | Coach IA (Gemini) sur les moments clés, repli local sans clé.                                                                                        |
| Programme d'entraînement sur ses faiblesses                    | 🟡   | « S'entraîner » rejoue ses erreurs, répétition espacée (1, 3, 7 jours), filtres par type d'erreur et phase. Pas de plan structuré.                   |
| Woodpecker                                                     | ❌   | Pas de base de puzzles dans le projet.                                                                                                               |
| Puzzles : thèmes, Elo, timer                                   | ❌   | Idem.                                                                                                                                                |
| Puzzles ratés à refaire                                        | 🟡   | Mécanique prête pour les erreurs de ses parties (`trainingStore`, `spacedRepetition`), à étendre aux puzzles.                                        |
| Explorateur d'ouvertures                                       | 🟡   | `public/openings.json` contient déjà ~3 800 lignes lichess avec noms français (`src/data/openings/*.tsv`). Il manque l'écran de navigation en arbre. |
| Études : création, chapitres, intro, commentaires, annotations | ❌   | Seul le bac à sable « Et si j'avais joué… ? » existe, sans sauvegarde.                                                                               |
| Étude verrouillable, jeu contre l'ordinateur avec variantes    | ❌   | Rien d'équivalent.                                                                                                                                   |
| Import PGN d'étude ou de chapitre                              | ❌   | L'import actuel (`chess.js`) ne gère qu'une ligne principale. À confirmer : je pense que `chess.js` écarte les variantes.                            |
| Partage d'études                                               | ❌   | Pas de serveur de comptes (voir section 3).                                                                                                          |

Le projet couvre bien l'analyse et le profil, et dépasse le besoin sur le confort : PWA hors ligne, sauvegarde et synchronisation Google Drive, mobile, accessibilité. Les blocs **Woodpecker, puzzles et études** n'existent pas du tout.

## 3. Faisabilité

**Explorateur d'ouvertures : facile.** Les données sont déjà dans le projet. Il faut construire un arbre à partir des lignes et afficher échiquier, coups suivants et nom de l'ouverture. On peut y ajouter ses propres stats par ouverture, ce qui rejoint la ligne « ouvertures et % de victoire ». Des stats mondiales par coup passeraient par l'API Explorer de Lichess ; je crois qu'elle demande désormais un jeton, **à vérifier** avant de s'y engager.

**Puzzles, tactique, Woodpecker : faisable, avec une décision de données.** La base de puzzles Lichess est libre de droits mais très lourde (plusieurs millions de lignes).

- _Option recommandée :_ embarquer un sous-ensemble (quelques dizaines de milliers de puzzles), découpé par tranche d'Elo et par thème, chargé à la demande. Compatible avec le hors ligne.
- _Alternative :_ appeler l'API Lichess. La tranche d'Elo n'y est pas librement choisissable, et ce serait moins fiable.

Une fois les puzzles disponibles, le reste est modeste : timer, cycle Woodpecker avec temps total, catégorie « ratés à refaire » (mécaniques existantes).

**Études : faisable, c'est le plus gros chantier.** Il faut :

- un vrai analyseur PGN avec variantes, commentaires et annotations ;
- un modèle de données en arbre, stocké dans IndexedDB comme les parties ;
- un éditeur de chapitres ;
- le mode verrouillé : l'ordinateur joue les coups de l'étude, choisit parfois une variante, et annule un coup hors ligne.

**Le partage d'études est le point dur.** Le serveur actuel ne fait que Gemini et l'import Lichess, sans comptes ni base de données. Trois options :

1. partage par fichier PGN exporté ;
2. partage par lien contenant l'étude encodée (limité en taille) ;
3. vrai backend, ce qui change la nature du projet.

Recommandation : les options 1 et 2. Les études restent privées dans le navigateur, avec Drive pour la copie.

## 4. Ordre recommandé

1. **Ouvertures** : stats par ouverture (% de victoire, coup de sortie qui coûte cher), puis explorateur en arbre. Peu coûteux, très utile, déjà dans `ROADMAP.md`.
2. **Points forts et programme d'entraînement** : écran « forces » et plan hebdomadaire tiré du profil. Les données existent, c'est surtout de l'interface.
3. **Puzzles, thèmes, Elo, timer, puzzles ratés**, puis **Woodpecker** juste après. Il faut d'abord trancher le sous-ensemble de puzzles embarqué.
4. **Études** en dernier : le plus lourd, et il demande de décider du partage avant de commencer.
5. En parallèle, plus petit : **élargir la détection des thèmes tactiques** au-delà des quatre actuels, ce qui nourrit les explications et le filtrage des puzzles.

## 5. Questions ouvertes

- [ ] **Partage d'études** : fichier PGN, lien encodé, ou vrai backend ? Cela change l'ampleur du point 4.
- [ ] **Puzzles** : sous-ensemble embarqué (taille, découpage par Elo et thème) ou API Lichess ?
- [ ] **Stats mondiales d'ouverture** : l'API Explorer de Lichess exige-t-elle un jeton ? Si oui, s'en passe-t-on ?
- [ ] **Mise à jour du profil** : faut-il un bouton « n'analyser que les nouvelles parties » ?
- [ ] **Parser PGN** : confirmer que `chess.js` perd les variantes, puis choisir entre une bibliothèque et un analyseur maison.
- [ ] **Programme d'entraînement** : quel format (plan hebdomadaire, objectif unique à l'ouverture de l'appli) ?
- [ ] **Coach IA sans serveur** : le garder optionnel avec repli local, passer en « serverless », ou demander à chaque utilisateur sa propre clé Gemini ?
- [ ] **Lichess comme hébergeur de partage** : import d'une étude publique par lien, export vers Lichess avec le jeton de l'utilisateur. À vérifier : droits, limites, connexion sans serveur.
- [ ] **Partage via Google Drive** : le dossier caché utilisé par la synchronisation n'est pas partageable ; un partage demanderait des fichiers visibles et des droits plus larges (validation Google plus lourde, à vérifier).

## 6. Contrainte : éviter tout serveur permanent

Hypothèse de travail : on veut le moins possible de serveur qui tourne en arrière-plan. Les points marqués « à vérifier » dépendent de règles externes (Lichess, Google) non testées.

### Infaisable sans serveur

| Besoin                                                                                 | Pourquoi                                                                | Contournement                                                                                 |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Partage d'études « à la Lichess » (lien permanent, mise à jour par le destinataire)    | Il faut un endroit où stocker l'étude, accessible à d'autres personnes. | Fichier PGN, lien contenant l'étude compressée, ou Lichess comme hébergeur (à vérifier).      |
| Étude collaborative en direct, commentaires entre utilisateurs                         | Il faut synchroniser plusieurs personnes.                               | Aucun.                                                                                        |
| Classements, comparaison avec d'autres joueurs, stats globales propres à l'application | Il faudrait agréger les données de plusieurs utilisateurs.              | Aucun.                                                                                        |
| Clé Gemini secrète pour le coach IA                                                    | Une clé placée dans le navigateur est visible par tout le monde.        | Repli heuristique local (déjà en place), ou clé saisie par chaque utilisateur, à ses risques. |

### Possible mais limité

| Besoin                            | Limite sans serveur                                                                                                                                                                                                 |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mise à jour automatique du profil | Rien ne tourne quand l'application est fermée : mise à jour à l'ouverture ou à la demande (ce qui correspond au besoin). Les synchronisations en arrière-plan des navigateurs sont peu fiables, surtout sur iPhone. |
| Analyse de beaucoup de parties    | Stockfish tourne dans le navigateur : onglet ouvert, batterie, lenteur sur téléphone. Un joueur avec plusieurs milliers de parties dépasse déjà le plafond de 500.                                                  |
| Puzzles                           | La base Lichess complète (plusieurs millions) ne tient pas dans un site statique. Sous-ensemble embarqué (quelques dizaines de milliers), figé à la publication : arbitrage taille / variété par thème et par Elo.  |
| Explorateur d'ouvertures          | Arbre local (~3 800 lignes) possible partout. Stats mondiales par coup : l'API Explorer de Lichess exige un jeton d'après mes informations (à vérifier). Sans cela, on se limite à ses propres stats par ouverture. |
| Partage par lien                  | Les données voyagent dans l'URL : taille limitée (une étude courte). Au-delà, un fichier.                                                                                                                           |
| Partage via Google Drive          | Le dossier caché de la synchronisation actuelle n'est pas partageable (voir questions ouvertes).                                                                                                                    |
| Conservation des données          | Tout vit dans le navigateur ; Safari peut vider les données d'un site peu utilisé. Parades : PWA installée, stockage persistant, copie Drive déjà en place.                                                         |
| Import des parties                | Appels directs aux API Lichess et chess.com, soumis à leurs limites de débit : un très gros historique s'importe lentement.                                                                                         |
| Explications du coach IA étendues | Les étendre aux puzzles et aux études ferait appeler Gemini plus souvent : même problème de clé.                                                                                                                    |

### Sans changement : aucun serveur nécessaire

- Import PGN et comptes Lichess / chess.com (déjà en place).
- Analyse Stockfish, profil, entraînement et répétition espacée.
- Explorateur d'ouvertures sur les données locales.
- Puzzles, timer, Woodpecker et puzzles ratés, une fois le sous-ensemble embarqué.
- Études privées : création, chapitres, commentaires, import PGN avec variantes, mode verrouillé contre l'ordinateur.
- Hors ligne, sauvegarde JSON et Drive.

### Le serveur actuel

`server.ts` ne sert qu'au coach IA (clé Gemini) et à un import Lichess. Avec l'objectif « zéro processus permanent », le coach IA est la seule vraie dépendance. Trois options :

1. le garder optionnel, avec repli heuristique (situation actuelle) ;
2. passer à une fonction « serverless » : rien ne tourne en continu, mais c'est encore de l'infrastructure à héberger ;
3. demander à chaque utilisateur sa propre clé.

### Conséquence sur l'ordre recommandé

Les points 1 à 3 de la section 4 (ouvertures, points forts et programme, puzzles et Woodpecker) restent entièrement faisables sans serveur. Les études aussi, **sauf le partage**, qui devient la décision à prendre : fichier, lien encodé ou passage par Lichess.

## 7. Fichiers du projet utiles pour la suite

- `ROADMAP.md`, `IMPROVEMENTS.md` : état et historique.
- `src/utils/weaknessProfile.ts`, `src/components/Profile/` : profil de faiblesses.
- `src/utils/faultKinds.ts`, `src/utils/tacticalThreats.ts` : types d'erreur et thèmes tactiques détectés.
- `src/services/trainingStore.ts`, `src/utils/spacedRepetition.ts`, `src/components/Training/` : entraînement et répétition espacée.
- `src/services/openingBook.ts`, `src/data/openings/*.tsv`, `public/openings.json` : livre d'ouvertures.
- `src/utils/pgnParser.ts` : import PGN actuel.
- `src/hooks/useSandbox.ts` : exploration libre (point de départ possible pour l'éditeur d'étude).
- `src/services/gameStore.ts` : stockage IndexedDB (modèle pour stocker les études).
- `server.ts` : serveur limité à Gemini et à l'import Lichess.
