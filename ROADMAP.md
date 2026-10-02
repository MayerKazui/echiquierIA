# Feuille de route

Objectif : un outil pour **s'améliorer** et **corriger ses faiblesses**, pas seulement relire une partie. Ce qui compte, c'est ce qui se répète sur beaucoup de parties.

Ce fichier suit ce qui reste à faire. `IMPROVEMENTS.md` garde l'historique de ce qui est fait.

Légende : `[ ]` à faire · `[~]` en cours · `[x]` fait

Ordre conseillé : le point 5 (les points 1, 2, 3, 4 et 6 et la partie C sont faits). L'import et l'analyse en lot (4) alimentent le profil (1), qui alimente l'entraînement (2).

## A. Outil d'entraînement (priorité)

### 1. Profil de faiblesses sur toutes les parties

Une vue « Mon profil » qui agrège les parties enregistrées : « qu'est-ce que je rate le plus souvent ? »

- [x] **Par phase** : précision en ouverture, milieu de jeu et finale.
- [x] **Par type d'erreur** : mat, pièce en prise, tactique manquée, avantage gâché, autre (`utils/faultKinds.ts`). À affiner : « autre » reste le plus gros groupe.
- [x] **Par situation** : zeitnot et coups rapides, Blancs ou Noirs, adversaire plus fort ou plus faible, cadence.
- [x] **Tendance** : précision de chaque partie dans le temps, dernières parties contre les précédentes.
- [x] Prérequis : plafond levé (500 parties, les 50 plus récentes complètes, les autres allégées avec évaluations et classements par coup).

### 2. S'entraîner sur ses propres erreurs

- [x] **« Rejouer mes erreurs »** : la position avant chaque erreur ou gaffe, on cherche le coup, puis on corrige avec le coup du moteur, sa suite et l'explication : voir `IMPROVEMENTS.md`. Un autre coup que celui du moteur est accepté si le moteur le juge aussi bon.
- [x] **Répétition espacée** : une position réussie revient après 1, 3 puis 7 jours, une position ratée revient le lendemain (une fiche par position, dans IndexedDB).
- [x] **Filtre par thème** : type d'erreur (mat, pièce en prise, tactique manquée, avantage gâché, autre) et phase (ouverture, milieu de jeu, finale).
- [ ] À affiner : ouvrir la partie à l'endroit de l'erreur depuis l'entraînement ; ne proposer qu'une position par situation identique (même position dans deux parties).

### 3. Suivi d'ouvertures

- [x] **Explorateur d'ouvertures** : arbre coup par coup de la base lichess, avec ses propres résultats (parties, victoires, nulles, défaites) par coup, et les coups hors du livre : voir `IMPROVEMENTS.md`.
- [x] **Répertoire réel** : ouvertures jouées (par couleur, avec leurs variantes) avec score et coup où l'on sort de la théorie : onglet « Mes ouvertures », voir `IMPROVEMENTS.md`. La précision par ouverture n'est pas calculée.
- [x] **Coup de sortie qui coûte cher**, partie après partie : sorties récurrentes avec leur coût moyen, et lien vers la position dans l'explorateur.

## B. Confort et récupération des parties

### 4. Récupérer ses parties sans copier-coller

- [x] **Import chess.com et Lichess** par pseudo (appels directs du navigateur), filtre de cadence, parties plus anciennes à la demande : voir `IMPROVEMENTS.md`.
- [x] Import : repère « Analysée » dans la liste : voir `IMPROVEMENTS.md`.
- [ ] Import : filtre par mois, et la précision que chess.com publie pour ses parties relues (`accuracies`), à comparer à la nôtre.
- [x] **« Analyser mes N dernières parties »** (5 à 100) en tâche de fond, avec reprise si l'onglet est fermé : voir `IMPROVEMENTS.md`. L'historique garde maintenant 500 parties (50 complètes, les autres allégées).

### 5. Retour plus actionnable pour chaque partie

- [ ] **Résumé de 3 lignes en tête du bilan** : « Moment décisif : coup 23, +2,8 puis tour laissée en prise ». Le calcul existait (retiré de l'interface) et se récupère facilement.
- [~] **Objectifs à retenir**, tirés du profil : fait sous la forme de « Mon plan » (trois objectifs au plus, dans le menu). Pas affiché à l'ouverture de l'appli, pour ne pas charger l'écran de départ.
- [ ] **Comparaison avec soi** : « précision de 71 %, 6 points sous ta moyenne ».

### 6. Confort au quotidien

- [x] **Export et import des données** (JSON) : voir `IMPROVEMENTS.md`.
- [x] **PWA installable et utilisable hors ligne** : voir `IMPROVEMENTS.md`.
- [x] **Synchronisation avec Google Drive** (sans serveur, bouton, fusion) : voir `IMPROVEMENTS.md`. Synchronisation automatique et suppressions propagées : fait aussi (`IMPROVEMENTS.md`).
- [x] **Noms d'ouverture en français** (~3 800 noms, à l'affichage).

## C. Fiabilité de l'analyse

Fait : voir `IMPROVEMENTS.md` (« Fiabilité de l'analyse : calage reproductible »).

- [x] **Calage reproductible** : `bun run calibrate` (rapport), `calibrate fetch` (parties de chess.com), `calibrate record` (évaluations Stockfish). 132 parties, 264 joueurs, écart moyen **3,85 points** à la profondeur 12 ; un test de régression échoue au-delà de 4,5 (6 par tranche d'Elo, biais 3).
- [x] **« Brillant »** : un vrai sacrifice (échange net perdant d'au moins 200 cp, calculé avec `chess.js`), joué dans une position pas déjà gagnée (≤ +5) et qui laisse l'avantage ; compté aussi quand c'est le coup du moteur.
- [x] **« Excellent coup » (`great`)** : MultiPV 2 ; attribué au coup unique (le deuxième choix du moteur perd au moins 12 points de victoire), hors reprise évidente. Environ un par joueur et par partie.
- [x] **Mats** : un mat forcé vaut 100 % / 0 % de victoire ; abandonner un mat forcé est au moins une erreur.
- [x] **Phases par matériel** : ouverture, milieu de jeu, finale d'après les pièces restantes et leur développement, mémorisées par coup.
- [x] **Débutants** : essayé (coups forcés, nouveau réglage de la décroissance) sans gain solide ; l'écart des moins de 700 Elo est de 4,2 points sur l'échantillon actuel.

## D. Vérifications manuelles restantes

- [ ] Lecteur d'écran réel (NVDA, VoiceOver) : l'accessibilité n'est vérifiée qu'avec axe-core, des tests DOM et le navigateur.
- [ ] Vrai téléphone (iOS Safari surtout : zone de sécurité, balayage) : le mobile n'est vérifié que sur Chrome émulé.
- [ ] Coach IA : passer à Gemini la variante du moteur et la menace détectée pour qu'il nomme la pièce touchée au lieu de paraphraser l'évaluation.

## E. Études (à la manière de Lichess)

Fait : voir `IMPROVEMENTS.md` (« Études »).

- [x] Études privées dans le navigateur : chapitres, introduction, variantes, commentaires, glyphes.
- [x] Import et export PGN au format Lichess (étude entière ou un chapitre).
- [x] Chapitre verrouillable : l'ordinateur joue les coups de l'étude, parfois une variante ; un coup hors étude est annulé.
- [ ] Dessiner les flèches et les cercles (`[%cal]`, `[%csl]`), déjà lus et conservés.
- [ ] Mettre les études dans la sauvegarde JSON et la synchronisation Drive (format de sauvegarde à faire évoluer, suppressions à propager).
- [ ] Réordonner les chapitres et les variantes (seule la promotion en ligne principale existe) ; copier un chapitre.
- [ ] Mode verrouillé : mémoriser les erreurs par ligne et les rejouer (répétition espacée, comme « S'entraîner »).
