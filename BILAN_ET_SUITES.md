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

- **Mon profil** : faiblesses par phase, type d'erreur (dix types, dont le thème tactique manqué parmi dix-neuf : fourchette, clouage, déviation, pièce piégée…), zeitnot, couleur, force de l'adversaire, cadence, évolution ; points forts.
- **S'entraîner** : rejouer ses propres erreurs avec correction par le moteur, en répétition espacée (1, 3 puis 7 jours), filtres par type d'erreur et par phase ; une même position ratée dans plusieurs parties n'est proposée qu'une fois ; « Voir dans la partie » ouvre la partie au coup de l'erreur.
- **Résumé de la partie** : trois lignes en tête du bilan (moment décisif avec son type de faute, précision comparée à sa moyenne sur les autres parties, fautes et phase la plus fragile).
- **Mon plan** : trois objectifs au plus, avec progression sur 7 jours et le bouton qui lance chacun, plus les puzzles du thème correspondant.
- **Ouvertures** : explorateur en arbre avec ses résultats par coup ; « Mes ouvertures » (répertoire réel, score, précision de ses 10 coups qui suivent la sortie du livre comparée à sa moyenne calculée de la même façon, ouverture la plus solide et la plus fragile, coup de sortie qui coûte cher) ; « S'entraîner » : les positions où l'on a quitté la théorie en perdant au moins 8 points de chances de gain, et les lignes qui marchent (la position la plus profonde que 2 parties au moins partagent dans la théorie), rejouées en répétition espacée (1, 3 puis 7 jours, comme dans « S'entraîner » sur ses erreurs) ; est juste tout coup que la base d'ouvertures connaît à cet endroit (ou qui mène à une de ses positions) ; filtres par type de position et par couleur, « Voir dans l'explorateur » après chaque réponse ; « Mon plan » renvoie vers cet entraînement depuis l'objectif sur la sortie de théorie.
- **Finales** : onze positions théoriques (mat avec la dame et avec la tour, quatre finales de roi et pion, deux Lucena, trois Philidor), vérifiées avec Stockfish 19 complet, jouées contre le moteur. Il juge chaque coup avec la même mesure que « S'entraîner » (chances de gain perdues, plafonnées à +6 pions pour qu'un mat vu ou non vu ne compte pas pour une faute ; un mat qui s'éloigne de plus de 2 coups est dit « retardé » ; le coup du moteur n'est jamais refusé), répond par son meilleur coup, et l'exercice se termine sur un mat, un pion promu dans une position qui reste gagnée (au moins 70 % de chances de gain), ou la nulle tenue (règles ou 12 coups) ; 40 coups sans conclure sur une position à gagner, c'est « trop long ». Le premier essai compte (un coup raté ou la solution demandée font échouer la position, que l'on peut ensuite reprendre ou recommencer pour s'entraîner), avec la répétition espacée de « S'entraîner » (cartes `finale:…` dans le même magasin, donc dans la sauvegarde et la synchronisation Drive).
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
- **Abandonné** après mesure, Stockfish multi-thread (idée 5) : sur 4 cœurs, 8 positions à la profondeur 14 prennent 0,7 s avec 4 workers mono-thread (le fonctionnement actuel) et 4,1 s avec un seul moteur à 4 threads, donc l'analyse en lot n'y gagne rien ; une position isolée à la profondeur 18 passe de 1,3 s à 0,86 s seulement. Les résultats varient d'une exécution à l'autre (cela fragiliserait le calage `bun run calibrate`), et il faudrait les en-têtes COOP/COEP, que GitHub Pages n'envoie pas (un service worker pourrait les ajouter, au risque de casser la connexion Google Drive ; Safari n'est pas couvert). À revoir seulement pour « Jouer contre Stockfish » (idée 2), où une seule recherche à la fois pourrait profiter des threads.
- **Sujets clos** : plafond de 500 parties, données conservées dans le navigateur, limites de débit des API d'import, extension du coach IA aux puzzles et aux études.

## 2. Ce qu'il reste à faire (déjà identifié dans le dépôt)

### Puzzles

- [ ] Historique : courbe de progression dans le temps.

### Vérifications manuelles

Faites sur de vrais appareils (2026-10-03), sans défaut constaté : lecteur d'écran réel, vrai téléphone dont iOS Safari (zone de sécurité, balayage).

- [ ] Ouvrir « S'entraîner » dans le navigateur après le passage aux grands plateaux (il faut des parties analysées).

### Types d'erreur et thèmes tactiques

- [ ] « Autres erreurs » représente encore 9 % des erreurs des parties de référence (`bun run faultstats`, 42 % auparavant, 12 % avant le type « Pièces passives » et les pions poussés devant le roi). Ce sont des coups tranquilles du milieu de jeu (dame mal placée, coup de pion qui perd le fil) : il faudrait détecter le centre, ou comparer des évaluations de position. Une détection des pions doublés ou isolés créés par un coup a été essayée : elle ne trouve rien sur ces parties, elle n'a pas été gardée.
- [ ] Les nouveaux thèmes (pièce piégée, coup intermédiaire, déviation, attraction, interférence, rayon X) sont rares : 1 à 4 fois sur les 994 erreurs de référence, et la surcharge jamais (Lichess n'a pas de puzzles à ce nom : le plan ne propose rien pour ce thème). À revérifier sur d'autres parties avant de s'y fier. Pas encore détectés : dégagement, coup calme, zugzwang, sous-promotion.

### Ouvertures

- [ ] La précision par ouverture compte les 10 coups du joueur qui suivent la sortie du livre (`ACCURACY_PLIES`, 20 demi-coups) : valeur choisie sans calage sur de vraies parties, à revoir si elle paraît trop courte ou trop longue.
- [ ] Une ligne qui marche n'est rejouée qu'à son point le plus profond partagé par 2 parties : les coups d'avant ne sont pas interrogés. Une partie dont la sortie coûteuse est déjà rejouée ne donne pas de ligne (celle qui y mène est rejouée avec la sortie).
- [ ] L'objectif « Préparez votre sortie de théorie » de « Mon plan » ouvre l'entraînement mais n'a pas de barre de progression de la semaine, comme les objectifs sur les erreurs : il faudrait charger la base d'ouvertures dans le plan.

### Finales

- [ ] Onze positions seulement. Écartées après essai avec le moteur : le fou de la mauvaise couleur avec un pion de tour (le moteur le voit à −0,88 au lieu de 0 : la nulle théorique n'est pas sûre) et les mats avec deux fous et avec fou et cavalier (le moteur y reste à +2 sans voir le mat : la progression ne se juge pas). Pas encore retenues : Vancura (les positions essayées donnaient +6 ou +7 aux blancs, ce n'étaient pas des nulles), la dame contre la tour (le moteur complet ne tranche pas en un temps raisonnable : +2,4 sur une position, mat en 12 sur une autre), la dame contre un pion en septième (les nulles du pion de tour ou de fou ne se vérifient pas : le moteur les juge mal, comme la mauvaise couleur ; seules les victoires contre un pion b ou d seraient vérifiables), la triangulation (les positions essayées sont nulles) et la règle du carré (nulle de roi seul contre pion, à poser avec soin). Chaque position doit passer la même vérification avec le moteur complet, et elle bute sur sa lenteur sur les finales de tour : à lancer avec une limite de temps par position.
- [ ] Les seuils (70 % de chances de gain pour une promotion, 12 coups pour tenir une nulle, 40 coups pour une position gagnée, 2 coups de mat de marge) sont posés sans calage sur de vraies parties de joueurs : ils sont assez larges pour que le moteur qui joue les deux camps réussisse chaque position (vérifié). Contrôle ajouté avec un joueur qui prend, parmi huit coups légaux au hasard, le plus lent encore accepté : il finit « gagné » en 10 à 37 coups sur le pion devant (de justesse sous les 40), mais n'arrive pas au mat avec la dame ni avec la tour en 40 coups, car la marge de 2 coups de mat lui laisse errer. Un joueur qui vise le mat ne s'y expose pas (le mat à la dame se fait en 7 coups avec le moteur), mais les 40 coups sont une limite serrée pour un débutant sur le mat à la tour : à ajuster si des joueurs échouent là.
- [ ] « Mon plan » renvoie vers les finales (bouton « Finales théoriques ») quand la finale est la phase la plus fragile, mais rien dans les parties ne dit encore quelle finale précise revoir.

### Question ouverte

- [ ] Stats mondiales d'ouverture : l'API Explorer de Lichess exige-t-elle un jeton ? Si oui, on garde seulement ses propres stats.

## 3. Idées d'évolution et d'amélioration

Ce sont des suggestions, pas des décisions. « Précision par ouverture » et « Entraînement au répertoire d'ouvertures » ont été faites, avec leurs limites (précision limitée aux coups qui suivent la sortie du livre, lignes qui marchent, lien depuis « Mon plan ») : elles sont décrites dans « Ce qui est fait » (Ouvertures), et ce qui reste dans « Ouvertures » de la section 2.

| #   | Idée                         | Intérêt                                                                                                                                                  |
| --- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Préparer ses adversaires     | Analyser le répertoire d'un pseudo avec les briques de l'import et de l'explorateur.                                                                     |
| 2   | Jouer contre Stockfish       | Niveau réglable, depuis une position d'étude, d'ouverture ou d'une position critique de ses parties.                                                     |
| 3   | ~~Entraînement aux finales~~ | Fait : voir « Finales » dans « Ce qui est fait ».                                                                                                        |
| 4   | Puzzles : mode « tempête »   | Score à battre, et puzzles tirés de ses propres erreurs avec les statistiques des puzzles.                                                               |
| 5   | ~~Stockfish multi-thread~~   | Abandonné (2026-10-03) : voir « Décisions prises ».                                                                                                      |
| 6   | Version anglaise             | Tout est en français (interface, ouvertures, thèmes) ; élargirait le public.                                                                             |
| 7   | Tests de bout en bout        | Playwright est disponible ; couvrir import, analyse, sauvegarde et synchronisation Drive. Il n'y a aujourd'hui que des tests unitaires et de composants. |
| 8   | Ménage du dépôt              | `server.ts` et `server.js` compilé, et `dist/` sont présents : vérifier ce qui est versionné par erreur.                                                 |

## 4. Ordre conseillé

1. ~~Terminer le point 5 : résumé de 3 lignes et comparaison avec sa moyenne.~~ Fait.
2. ~~Élargir les thèmes tactiques et réduire « autre ».~~ Fait : sept thèmes de plus, « autre » de 42 % à 9 % (voir « Types d'erreur et thèmes tactiques » pour le reste).
3. ~~Petits ajouts d'entraînement : ouvrir la partie depuis « S'entraîner », dédoublonnage, bouton « nouvelles parties ».~~ Fait.
4. ~~Vérifications sur de vrais appareils et un vrai lecteur d'écran.~~ Fait, tout est bon.
5. ~~Couvrir les ouvertures : précision par ouverture et entraînement au répertoire.~~ Fait.
6. Ensuite seulement les grosses évolutions (adversaires, jeu contre Stockfish, version anglaise). Les finales sont faites.
