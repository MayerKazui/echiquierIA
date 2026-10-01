# Feuille de route

Objectif : un outil pour **s'améliorer** et **corriger ses faiblesses**, pas seulement relire une partie. Ce qui compte, c'est ce qui se répète sur beaucoup de parties.

Ce fichier suit ce qui reste à faire. `IMPROVEMENTS.md` garde l'historique de ce qui est fait.

Légende : `[ ]` à faire · `[~]` en cours · `[x]` fait

Ordre conseillé : le point 3, puis 5 (les points 1, 2, 4 et 6 sont faits). L'import et l'analyse en lot (4) alimentent le profil (1), qui alimente l'entraînement (2).

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

- [ ] **Répertoire réel** : ouvertures jouées avec score, précision et coup où l'on sort de la théorie (livre de ~3 800 lignes déjà intégré).
- [ ] **Coup de sortie qui coûte cher**, partie après partie : « 4 fois sur 6, tu dévies à 8.h3 et tu perds 0,5 point ».

## B. Confort et récupération des parties

### 4. Récupérer ses parties sans copier-coller

- [x] **Import chess.com et Lichess** par pseudo (appels directs du navigateur), filtre de cadence, parties plus anciennes à la demande : voir `IMPROVEMENTS.md`.
- [x] Import : repère « Analysée » dans la liste : voir `IMPROVEMENTS.md`.
- [ ] Import : filtre par mois, et la précision que chess.com publie pour ses parties relues (`accuracies`), à comparer à la nôtre.
- [x] **« Analyser mes N dernières parties »** (5 à 100) en tâche de fond, avec reprise si l'onglet est fermé : voir `IMPROVEMENTS.md`. L'historique garde maintenant 500 parties (50 complètes, les autres allégées).

### 5. Retour plus actionnable pour chaque partie

- [ ] **Résumé de 3 lignes en tête du bilan** : « Moment décisif : coup 23, +2,8 puis tour laissée en prise ». Le calcul existait (retiré de l'interface) et se récupère facilement.
- [ ] **Un seul objectif à retenir**, tiré du profil, affiché à l'ouverture de l'appli.
- [ ] **Comparaison avec soi** : « précision de 71 %, 6 points sous ta moyenne ».

### 6. Confort au quotidien

- [x] **Export et import des données** (JSON) : voir `IMPROVEMENTS.md`.
- [x] **PWA installable et utilisable hors ligne** : voir `IMPROVEMENTS.md`.
- [x] **Noms d'ouverture en français** (~3 800 noms, à l'affichage).

## C. Fiabilité de l'analyse

À traiter en parallèle, surtout le premier point (il protège le calage).

- [ ] **Calage reproductible** : `scripts/calibrate.ts`, un fichier de parties de référence (PGN et précision chess.com) et un test de régression (écart moyen < 5 points). Aucun script de calage n'est dans le dépôt : sans lui, on ne peut pas vérifier que les 4,4 points d'écart tiennent après un changement.
- [ ] **« Brillant » trop généreux** : le critère (`stockfishEngine.ts`, `isSacrifice`) ne vérifie pas que la pièce est en prise. Exiger un vrai sacrifice (échange net perdant, test SEE avec `chess.js`) et exclure les positions déjà largement gagnées (> +5).
- [ ] **« Excellent coup » (`great`) jamais attribué** : le type existe mais `classifyMove` ne le renvoie jamais. Demande MultiPV 2 (~1,3 à 1,5 fois plus de temps), ce qui servirait aussi à « Brillant ».
- [ ] **Mats aplatis** : un mat plafonné à ±1000 cp vaut 90 % de victoire ; abandonner un mat forcé pour +5 pions ne coûte que 12 points. Ajouter un cas « mat forcé abandonné ».
- [ ] **Phases par matériel** plutôt que par numéro de coup (< 20, < 50 aujourd'hui).
- [ ] **Débutants à ~6 points d'écart** (< 700 Elo) : pistes (positions instables, coups forcés) à n'essayer qu'une fois le calage reproductible.

## D. Vérifications manuelles restantes

- [ ] Lecteur d'écran réel (NVDA, VoiceOver) : l'accessibilité n'est vérifiée qu'avec axe-core, des tests DOM et le navigateur.
- [ ] Vrai téléphone (iOS Safari surtout : zone de sécurité, balayage) : le mobile n'est vérifié que sur Chrome émulé.
- [ ] Coach IA : passer à Gemini la variante du moteur et la menace détectée pour qu'il nomme la pièce touchée au lieu de paraphraser l'évaluation.
