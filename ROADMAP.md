# Feuille de route

Objectif : un outil pour **s'améliorer** et **corriger ses faiblesses**, pas seulement relire une partie. Ce qui compte, c'est ce qui se répète sur beaucoup de parties.

Ce fichier suit ce qui reste à faire. `IMPROVEMENTS.md` garde l'historique de ce qui est fait.

Légende : `[ ]` à faire · `[~]` en cours · `[x]` fait

Ordre conseillé : **4 → 1 → 2**, puis 3, 5 et 6. L'import et l'analyse en lot (4) alimentent le profil (1), qui alimente l'entraînement (2).

## A. Outil d'entraînement (priorité)

### 1. Profil de faiblesses sur toutes les parties

Une vue « Mon profil » qui agrège les parties enregistrées : « qu'est-ce que je rate le plus souvent ? »

- [ ] **Par phase** : précision en ouverture, milieu de jeu et finale (le calcul existe : `utils/phaseStats.ts`, à agréger).
- [ ] **Par type d'erreur** : pièce laissée en prise, fourchette ou clouage manqué, mat en 1 ou 2 raté, position gagnée gâchée. Les menaces sont déjà détectées (`threatInfo.ts`) mais pas rattachées aux erreurs.
- [ ] **Par situation** : zeitnot et coups rapides (les horloges sont lues), Blancs ou Noirs, adversaire plus fort ou plus faible.
- [ ] **Tendance** : précision et nombre de gaffes par partie dans le temps.
- [ ] Prérequis : lever le plafond de 20 parties (`gameStore`) en gardant seulement les statistiques par coup pour les anciennes parties et l'analyse complète pour les récentes.

### 2. S'entraîner sur ses propres erreurs

- [ ] **« Rejouer mes erreurs »** : retrouver la position avant chaque erreur ou gaffe, chercher le coup, puis corriger avec le coup du moteur et l'explication. Les données existent déjà (`fenBefore`, `bestMoveSan`, `pv`, classification).
- [ ] **Répétition espacée** : une position ratée revient après 1, 3, 7 jours (date et niveau par position dans IndexedDB).
- [ ] **Filtre par thème** : « seulement mes erreurs de finale », « seulement mes pièces en prise ».

### 3. Suivi d'ouvertures

- [ ] **Répertoire réel** : ouvertures jouées avec score, précision et coup où l'on sort de la théorie (livre de ~3 800 lignes déjà intégré).
- [ ] **Coup de sortie qui coûte cher**, partie après partie : « 4 fois sur 6, tu dévies à 8.h3 et tu perds 0,5 point ».

## B. Confort et récupération des parties

### 4. Récupérer ses parties sans copier-coller

- [ ] **Import chess.com** par pseudo (API publique `/pub/player/{pseudo}/games/{année}/{mois}`, déjà utilisée pour le calage), en plus de Lichess ; filtres mois et cadence.
- [ ] **« Analyser mes N dernières parties »** en tâche de fond, avec reprise si l'onglet est fermé. Sans cela le profil (1) reste théorique.

### 5. Retour plus actionnable pour chaque partie

- [ ] **Résumé de 3 lignes en tête du bilan** : « Moment décisif : coup 23, +2,8 puis tour laissée en prise ». Le calcul existait (retiré de l'interface) et se récupère facilement.
- [ ] **Un seul objectif à retenir**, tiré du profil, affiché à l'ouverture de l'appli.
- [ ] **Comparaison avec soi** : « précision de 71 %, 6 points sous ta moyenne ».

### 6. Confort au quotidien

- [ ] **Export et import des données** (JSON) : tout est dans le navigateur, un vidage de cache efface l'historique.
- [ ] **PWA installable et utilisable hors ligne** (service worker ; le moteur tourne déjà dans le navigateur).
- [ ] **Noms d'ouverture en français** (aujourd'hui en anglais, ~3 800 noms).

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
