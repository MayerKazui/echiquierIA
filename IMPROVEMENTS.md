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

### 4. Qualité et outillage
- [ ] Ajouter des tests (Vitest) sur la logique pure : classification des coups, calcul de précision, `pgnParser`, `openingBook`, `clockUtils`.
- [ ] Ajouter ESLint et Prettier (`lint` ne fait aujourd'hui que `tsc --noEmit`).
- [ ] Ajouter une CI (lint + typecheck + tests + build).
- [ ] Réduire les `any` (29 dans `src/`, 8 dans `server.ts`), surtout les corps de requête du serveur.

### 5. Dépôt et dépendances
- [ ] `public/` pèse 8 Mo avec des moteurs en double (Stockfish 19 wasm + asm.js, ancien `stockfish.js` v10 + wasm). Choisir une source unique (copie depuis `node_modules` au build) et supprimer l'ancien repli si possible.
- [ ] Retirer les dépendances inutilisées ou redondantes (`stockfish`, `stockfish.js`) selon le choix ci-dessus.
- [ ] Renommer le paquet (`react-example` dans `package.json`).
- [ ] Mettre `tsx` dans `dependencies` : `start` en production en dépend.
- [ ] Choisir un seul gestionnaire de paquets (`bun.lock` présent, scripts npm/tsx) et le documenter.
- [ ] Ajouter un README ; adapter `.env.example` (actuellement orienté AI Studio) ; lire le port depuis `process.env.PORT` (codé en dur à 3000).

### 6. Moteur Stockfish (`src/services/stockfishEngine.ts`)
- [ ] Adapter le nombre de workers (fixé à 2) à `navigator.hardwareConcurrency`.
- [ ] Rendre la profondeur (12 par défaut) ou le temps d'analyse réglable.
- [ ] Borner la table de transposition (croissance illimitée).
- [ ] Envisager les en-têtes COOP/COEP si la version multithread est visée (aucun en-tête de ce type trouvé).

## Priorité basse

### 7. Accessibilité et UX
- [ ] Navigation clavier sur l'échiquier et la liste de coups, labels ARIA, annonce des coups (état actuel non vérifié).

### 8. Performance front
- [ ] Lazy-loading de `public/openings.json` (1,1 Mo) et des graphiques ; découpage du bundle.

### 9. Persistance
- [ ] Sauvegarder les parties analysées (IndexedDB) pour éviter de relancer Stockfish après un rechargement.

## Ordre suggéré
1 (sécurité serveur) → 2 (Gemini) → 4 (tests sur la logique pure) → 3 (découpage de `App.tsx`), puis le reste.
