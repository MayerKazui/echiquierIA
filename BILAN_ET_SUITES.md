# Bilan du projet et suites possibles

Seul fichier de suivi du projet (avec `README.md`). Il remplace `ROADMAP.md`, `IMPROVEMENTS.md` et `COMPARATIF_PATCHCHESS.md`, supprimés le 2026-10-03 : leur contenu détaillé reste dans l'historique git (`git log -- IMPROVEMENTS.md`).

Objectif du projet : un outil pour **s'améliorer** et **corriger ses faiblesses**, pas seulement relire une partie.

## 1. Ce qui est fait

### Analyse d'une partie

- Import d'un PGN (collé, fichier, exemples) et reconnaissance de l'ouverture (base lichess, ~3 800 lignes, noms en français).
- Stockfish 19 dans des Web Workers, profondeur 8 à 18, résultats affichés au fil de l'eau, analyse annulable.
- Classement des coups (gaffe, erreur, brillant, excellent coup…), courbe d'évaluation, précision par joueur, phases de jeu, gestion du temps.
- Précision calée sur chess.com : écart moyen de 3,85 points sur 132 parties (`bun run calibrate`), avec un test de régression.
- Coach IA (Gemini, côté serveur) sur les moments clés, avec un repli local sans clé.
- Échiquier interactif : exploration libre, glisser-déposer, animations, flèches, contrôle de l'espace, menaces, lecture automatique, raccourcis clavier.

### Récupération des parties

- Import par pseudo chess.com ou Lichess (appels directs du navigateur), filtre de cadence, parties plus anciennes à la demande.
- Analyse en lot des 5 à 100 dernières parties, ou seulement des nouvelles (celles de la liste pas encore dans l'historique), en tâche de fond, avec reprise.
- Historique de 500 parties dans le navigateur (IndexedDB) : les 50 plus récentes complètes, les autres allégées.

### Outils d'entraînement

- **Mon profil** : faiblesses par phase, type d'erreur (neuf types, dont le thème tactique manqué : fourchette, clouage, attaque à la découverte…), zeitnot, couleur, force de l'adversaire, cadence, évolution ; points forts.
- **S'entraîner** : rejouer ses propres erreurs avec correction par le moteur, en répétition espacée (1, 3 puis 7 jours), filtres par type d'erreur et par phase ; une même position ratée dans plusieurs parties n'est proposée qu'une fois ; « Voir dans la partie » ouvre la partie au coup de l'erreur.
- **Résumé de la partie** : trois lignes en tête du bilan (moment décisif avec son type de faute, précision comparée à sa moyenne sur les autres parties, fautes et phase la plus fragile).
- **Mon plan** : trois objectifs au plus, avec progression sur 7 jours et le bouton qui lance chacun, plus les puzzles du thème correspondant.
- **Ouvertures** : explorateur en arbre avec ses résultats par coup, et « Mes ouvertures » (répertoire réel, score, coup de sortie qui coûte cher).
- **Puzzles** : 200 000 puzzles Lichess embarqués (73 thèmes en français, tranche d'Elo, chronomètre sans pénalité), puzzles ratés en répétition espacée, statistiques sur 7 jours, 30 jours ou tout.
- **Woodpecker** : lot figé de 20 à 500 puzzles, cycles chronométrés avec pause, temps comparé au cycle précédent, reprise d'un ancien lot.
- **Études** (privées, à la manière de Lichess) : chapitres, variantes, commentaires, glyphes, flèches et cercles, import et export PGN, chapitre verrouillable contre l'ordinateur, réordonnancement.

### Confort et technique

- Application installable et utilisable hors ligne (PWA).
- Sauvegarde JSON de tout (format 7) et synchronisation avec Google Drive, manuelle ou automatique, suppressions comprises.
- Mobile (navigation en bas, balayage) et accessibilité (clavier, lecteurs d'écran, contrastes, mouvement réduit), vérifiés sur de vrais appareils et un vrai lecteur d'écran.
- Sécurité du serveur, limites de débit, CI (lint, typecheck, format, tests, build).

### Décisions prises : abandonné ou clos

- **Abandonné**, car il faudrait un serveur : partage d'études, étude collaborative, classements entre joueurs, clé Gemini côté navigateur, mise à jour automatique du profil.
- **Sujets clos** : plafond de 500 parties, données conservées dans le navigateur, limites de débit des API d'import, extension du coach IA aux puzzles et aux études.

## 2. Ce qu'il reste à faire (déjà identifié dans le dépôt)

### Puzzles

- [ ] Historique : courbe de progression dans le temps.

### Vérifications manuelles

Faites sur de vrais appareils (2026-10-03), sans défaut constaté : lecteur d'écran réel, vrai téléphone dont iOS Safari (zone de sécurité, balayage).

- [ ] Ouvrir « S'entraîner » dans le navigateur après le passage aux grands plateaux (il faut des parties analysées).

### Types d'erreur et thèmes tactiques

- [ ] « Autres erreurs » représente encore 12 % des erreurs des parties de référence (`bun run faultstats`, 42 % auparavant). Ce sont des coups tranquilles du milieu de jeu : il faudrait détecter la mobilité, la structure de pions, le centre.
- [ ] Thèmes tactiques pas encore détectés : rayons X, déviation, attraction, interférence, pièce piégée, surcharge, coup intermédiaire (douze thèmes le sont : fourchette, clouage, enfilade, attaque et échec à la découverte, double échec, capture du défenseur, mat du couloir, mat étouffé, pièce en prise, promotion, sacrifice).
- [ ] « Matériel laissé en prise » compte aussi un pion perdu quand le coup du moteur ne le perdait pas : à surveiller si le profil montre trop de « pièce laissée en prise ».

### Question ouverte

- [ ] Stats mondiales d'ouverture : l'API Explorer de Lichess exige-t-elle un jeton ? Si oui, on garde seulement ses propres stats.

## 3. Idées d'évolution et d'amélioration

Ce sont des suggestions, pas des décisions.

| #   | Idée                                    | Intérêt                                                                                                                                                  |
| --- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Précision par ouverture                 | Non calculée dans « Mes ouvertures ».                                                                                                                    |
| 2   | Préparer ses adversaires                | Analyser le répertoire d'un pseudo avec les briques de l'import et de l'explorateur.                                                                     |
| 3   | Jouer contre Stockfish                  | Niveau réglable, depuis une position d'étude, d'ouverture ou d'une position critique de ses parties.                                                     |
| 4   | Entraînement aux finales                | Positions théoriques (Lucena, Philidor…) avec correction par le moteur.                                                                                  |
| 5   | Entraînement au répertoire d'ouvertures | Rejouer ses lignes en répétition espacée, sur le modèle de « S'entraîner ».                                                                              |
| 6   | Puzzles : mode « tempête »              | Score à battre, et puzzles tirés de ses propres erreurs avec les statistiques des puzzles.                                                               |
| 7   | Stockfish multi-thread                  | Analyse en lot plus rapide ; demande les en-têtes COOP/COEP.                                                                                             |
| 8   | Version anglaise                        | Tout est en français (interface, ouvertures, thèmes) ; élargirait le public.                                                                             |
| 9   | Tests de bout en bout                   | Playwright est disponible ; couvrir import, analyse, sauvegarde et synchronisation Drive. Il n'y a aujourd'hui que des tests unitaires et de composants. |
| 10  | Ménage du dépôt                         | `server.ts` et `server.js` compilé, et `dist/`, sont présents : vérifier ce qui est versionné par erreur.                                                |

## 4. Ordre conseillé

1. ~~Terminer le point 5 : résumé de 3 lignes et comparaison avec sa moyenne.~~ Fait.
2. ~~Élargir les thèmes tactiques et réduire « autre ».~~ Fait (voir « Types d'erreur et thèmes tactiques » pour le reste).
3. ~~Petits ajouts d'entraînement : ouvrir la partie depuis « S'entraîner », dédoublonnage, bouton « nouvelles parties ».~~ Fait.
4. ~~Vérifications sur de vrais appareils et un vrai lecteur d'écran.~~ Fait, tout est bon.
5. Ensuite seulement les grosses évolutions (adversaires, jeu contre Stockfish, finales, version anglaise).
