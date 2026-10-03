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
- Analyse en lot des 5 à 100 dernières parties, en tâche de fond, avec reprise.
- Historique de 500 parties dans le navigateur (IndexedDB) : les 50 plus récentes complètes, les autres allégées.

### Outils d'entraînement

- **Mon profil** : faiblesses par phase, type d'erreur, zeitnot, couleur, force de l'adversaire, cadence, évolution ; points forts.
- **S'entraîner** : rejouer ses propres erreurs avec correction par le moteur, en répétition espacée (1, 3 puis 7 jours), filtres par type d'erreur et par phase.
- **Mon plan** : trois objectifs au plus, avec progression sur 7 jours et le bouton qui lance chacun, plus les puzzles du thème correspondant.
- **Ouvertures** : explorateur en arbre avec ses résultats par coup, et « Mes ouvertures » (répertoire réel, score, coup de sortie qui coûte cher).
- **Puzzles** : 200 000 puzzles Lichess embarqués (73 thèmes en français, tranche d'Elo, chronomètre sans pénalité), puzzles ratés en répétition espacée, statistiques sur 7 jours, 30 jours ou tout.
- **Woodpecker** : lot figé de 20 à 500 puzzles, cycles chronométrés avec pause, temps comparé au cycle précédent, reprise d'un ancien lot.
- **Études** (privées, à la manière de Lichess) : chapitres, variantes, commentaires, glyphes, flèches et cercles, import et export PGN, chapitre verrouillable contre l'ordinateur, réordonnancement.

### Confort et technique

- Application installable et utilisable hors ligne (PWA).
- Sauvegarde JSON de tout (format 7) et synchronisation avec Google Drive, manuelle ou automatique, suppressions comprises.
- Mobile (navigation en bas, balayage) et accessibilité (clavier, lecteurs d'écran, contrastes, mouvement réduit).
- Sécurité du serveur, limites de débit, CI (lint, typecheck, format, tests, build).

### Décisions prises : abandonné ou clos

- **Abandonné**, car il faudrait un serveur : partage d'études, étude collaborative, classements entre joueurs, clé Gemini côté navigateur, mise à jour automatique du profil.
- **Sujets clos** : plafond de 500 parties, données conservées dans le navigateur, limites de débit des API d'import, extension du coach IA aux puzzles et aux études.

## 2. Ce qu'il reste à faire (déjà identifié dans le dépôt)

### Retour sur une partie (point 5 de la feuille de route, le dernier non terminé)

- [ ] Résumé de 3 lignes en tête du bilan : « Moment décisif : coup 23, +2,8 puis tour laissée en prise ». Le calcul existait et se récupère facilement.
- [ ] Comparaison avec soi-même : « précision de 71 %, 6 points sous ta moyenne ».

### S'entraîner et import

- [ ] Ouvrir la partie à l'endroit de l'erreur depuis « S'entraîner ».
- [ ] Ne proposer qu'une position par situation identique (même position dans deux parties).
- [ ] Import : filtre par mois.
- [ ] Import : afficher la précision publiée par chess.com (`accuracies`) à côté de la nôtre.
- [ ] Bouton « n'analyser que les nouvelles parties » (mise à jour manuelle du profil). La forme n'est pas décidée.

### Études

- [ ] Copier un chapitre.
- [ ] Mode verrouillé : mémoriser les erreurs par ligne et les rejouer en répétition espacée.
- [ ] Fusion fine des études. Aujourd'hui une étude est prise en entier (la version modifiée en dernier gagne) : deux appareils qui modifient des chapitres différents en même temps perdent l'une des modifications.
- [ ] Dessiner des flèches sur téléphone (pas de clic droit).

### Puzzles

- [ ] Historique : courbe de progression dans le temps.

### Vérifications manuelles jamais faites

- [ ] Lecteur d'écran réel (NVDA, VoiceOver) : seuls axe-core et des tests DOM ont servi.
- [ ] Vrai téléphone, surtout iOS Safari (zone de sécurité, balayage) : le mobile n'a été vérifié que sur Chrome émulé.
- [ ] Ouvrir « S'entraîner » dans le navigateur après le passage aux grands plateaux (il faut des parties analysées).

### Coach IA

- [ ] Passer à Gemini la variante du moteur et la menace détectée, pour qu'il nomme la pièce touchée au lieu de paraphraser l'évaluation.

### Question ouverte

- [ ] Stats mondiales d'ouverture : l'API Explorer de Lichess exige-t-elle un jeton ? Si oui, on garde seulement ses propres stats.

## 3. Idées d'évolution et d'amélioration

Ce sont des suggestions, pas des décisions.

| #   | Idée                                      | Intérêt                                                                                                                                                                                                             |
| --- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Élargir la détection des thèmes tactiques | Il n'y en a que quatre (fourchette, clouage, enfilade, pièce en prise) contre une soixantaine chez Lichess. Rend les liens avec les puzzles et le plan plus précis (rayons X, attaque à la découverte, déviation…). |
| 2   | Affiner le type d'erreur                  | « Autre » reste le plus gros groupe du profil, ce qui limite le diagnostic.                                                                                                                                         |
| 3   | Précision par ouverture                   | Non calculée dans « Mes ouvertures ».                                                                                                                                                                               |
| 4   | Préparer ses adversaires                  | Analyser le répertoire d'un pseudo avec les briques de l'import et de l'explorateur.                                                                                                                                |
| 5   | Jouer contre Stockfish                    | Niveau réglable, depuis une position d'étude, d'ouverture ou d'une position critique de ses parties.                                                                                                                |
| 6   | Entraînement aux finales                  | Positions théoriques (Lucena, Philidor…) avec correction par le moteur.                                                                                                                                             |
| 7   | Entraînement au répertoire d'ouvertures   | Rejouer ses lignes en répétition espacée, sur le modèle de « S'entraîner ».                                                                                                                                         |
| 8   | Puzzles : mode « tempête »                | Score à battre, et puzzles tirés de ses propres erreurs avec les statistiques des puzzles.                                                                                                                          |
| 9   | Stockfish multi-thread                    | Analyse en lot plus rapide ; demande les en-têtes COOP/COEP.                                                                                                                                                        |
| 10  | Version anglaise                          | Tout est en français (interface, ouvertures, thèmes) ; élargirait le public.                                                                                                                                        |
| 11  | Tests de bout en bout                     | Playwright est disponible ; couvrir import, analyse, sauvegarde et synchronisation Drive. Il n'y a aujourd'hui que des tests unitaires et de composants.                                                            |
| 12  | Ménage du dépôt                           | `server.ts` et `server.js` compilé, et `dist/`, sont présents : vérifier ce qui est versionné par erreur.                                                                                                           |

## 4. Ordre conseillé

1. Terminer le point 5 : résumé de 3 lignes et comparaison avec sa moyenne. Rapide, visible, sans risque.
2. Élargir les thèmes tactiques et réduire « autre » : améliore la qualité de tout le profil et du plan.
3. Petits ajouts d'entraînement : ouvrir la partie depuis « S'entraîner », dédoublonnage, bouton « nouvelles parties ».
4. Vérifications sur de vrais appareils et un vrai lecteur d'écran.
5. Ensuite seulement les grosses évolutions (adversaires, jeu contre Stockfish, finales, version anglaise).
