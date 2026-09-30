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

### 1. Sécurité du serveur (`server.ts`)
- [ ] Restreindre le CORS (actuellement `*` sur toutes les routes) à l'origine de l'app.
- [ ] Ajouter un rate-limit sur `/api/coach/*` et `/api/lichess/import` (consomment le quota Gemini / relaient vers Lichess).
- [ ] Plafonner la taille du body (`express.json({ limit })`) et la taille du PGN importé.
- [ ] Valider les corps de requête (schéma, ex. zod) : `fen`, `pgn`, `sanHistory`, etc. sont injectés tels quels dans le prompt Gemini (injection de prompt) et `sanHistory.slice` plante si ce n'est pas un tableau.
- [ ] Ne plus renvoyer les erreurs brutes au client (`error.message`, texte de réponse Lichess).

### 2. Latence et coût de l'appel Gemini (`server.ts`)
- [ ] Remplacer le `Promise.race` par un `AbortController` (le timeout n'annule pas la requête en cours).
- [ ] Réduire le pire cas (3 modèles × 8 s = 24 s avant le fallback heuristique).
- [ ] Ajouter un cache sur `fen + coup joué` pour ne pas redemander la même explication.
- [ ] Vérifier que les noms de modèles (`gemini-3.8-flash`, `gemini-3.1-flash-lite`, `gemini-flash-latest`) existent.
- [ ] Envoyer `MoveClassification` tel quel au serveur au lieu de tester des sous-chaînes françaises (`includes('gaffe')`, `'manquée'`…).

### 3. Découpage des gros fichiers
- [ ] `src/App.tsx` (1766 lignes, 56 hooks après l'épuration de l'interface ; 2300 lignes / 77 hooks avant) : extraire `useLocalStorage` (5 usages dupliqués), `useGameAnalysis`, `usePlayback`, l'import Lichess, l'export, et des sous-composants.
- [ ] `ChessBoard.tsx` (999 lignes) et `Dashboard.tsx` (608 lignes) : découper de la même façon.

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
