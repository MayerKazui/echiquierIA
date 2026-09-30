export interface SampleGame {
  id: string;
  name: string;
  description: string;
  white: string;
  black: string;
  category: 'tactics' | 'endgame' | 'master' | 'club';
  pgn: string;
}

export const SAMPLE_GAMES: SampleGame[] = [
  {
    id: 'opera-morphy',
    name: "La Partie de l'Opéra (Morphy 1858)",
    description: "Le chef-d'œuvre absolu de punition des erreurs de développement et gaffes tactiques.",
    white: 'Paul Morphy',
    black: 'Duc de Brunswick & Comte Isouard',
    category: 'master',
    pgn: `[Event "Paris Opera House"]
[Site "Paris FRA"]
[Date "1858.11.02"]
[White "Paul Morphy"]
[Black "Duke Karl / Count Isouard"]
[Result "1-0"]
[ECO "C41"]

1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8# 1-0`,
  },
  {
    id: 'club-blunder',
    name: 'Partie de Club : Gaffes en Milieu de Jeu',
    description:
      'Une partie disputée en cadence 10+2 avec horloges, plusieurs longues réflexions et gaffes réciproques.',
    white: 'Alexandre (1550)',
    black: 'Maxime (1520)',
    category: 'club',
    pgn: `[Event "Tournoi de Rapide"]
[Site "Paris"]
[Date "2026.04.12"]
[White "Alexandre (1550)"]
[Black "Maxime (1520)"]
[Result "1-0"]
[TimeControl "600+2"]

1. e4 { [%clk 0:09:58] } c5 { [%clk 0:09:57] } 2. Nf3 { [%clk 0:09:56] } d6 { [%clk 0:09:54] } 3. d4 { [%clk 0:09:52] } cxd4 { [%clk 0:09:50] } 4. Nxd4 { [%clk 0:09:48] } Nf6 { [%clk 0:09:44] } 5. Nc3 { [%clk 0:09:42] } a6 { [%clk 0:09:36] } 6. Bc4 { [%clk 0:09:35] } e6 { [%clk 0:09:28] } 7. Bb3 { [%clk 0:09:20] } b5 { [%clk 0:09:12] } 8. Bg5 { [%clk 0:09:05] } Be7 { [%clk 0:08:52] } 9. Qf3 { [%clk 0:08:44] } Qc7 { [%clk 0:08:30] } 10. O-O-O { [%clk 0:08:18] } Bb7 { [%clk 0:08:02] } 11. Rhe1 { [%clk 0:07:45] } Nbd7 { [%clk 0:07:25] } 12. Bxe6 { [%clk 0:05:35] } fxe6 { [%clk 0:06:55] } 13. Nxe6 { [%clk 0:05:28] } Qc4 { [%clk 0:04:45] } 14. Nxg7+ { [%clk 0:05:15] } Kf7 { [%clk 0:04:30] } 15. Nf5 { [%clk 0:04:45] } Ne5 { [%clk 0:04:12] } 16. Nxd6+ { [%clk 0:04:22] } Bxd6 { [%clk 0:04:02] } 17. Qxf6+ { [%clk 0:04:18] } Kg8 { [%clk 0:03:52] } 18. Rxd6 { [%clk 0:04:05] } Nf7 { [%clk 0:03:10] } 19. Rd7 { [%clk 0:03:45] } Bc6 { [%clk 0:02:40] } 20. Rc7 { [%clk 0:03:32] } 1-0`,
  },
  {
    id: 'rook-endgame',
    name: 'Revirement en Finale de Tours',
    description: 'Une finale théorique nulle qui bascule suite à un coup passif de tour.',
    white: 'Joueur Blancs',
    black: 'Joueur Noirs',
    category: 'endgame',
    pgn: `[Event "Championnat Régional"]
[Site "Lyon"]
[Date "2025.10.15"]
[White "Pierre V."]
[Black "Laurent M."]
[Result "0-1"]

1. d4 d5 2. c4 c6 3. Nf3 Nf6 4. Nc3 dxc4 5. a4 Bf5 6. e3 e6 7. Bxc4 Bb4 8. O-O O-O 9. Qe2 Bg6 10. Ne5 Nbd7 11. Nxg6 hxg6 12. Rd1 Qa5 13. Bd2 e5 14. dxe5 Nxe5 15. Bb3 Rad8 16. Be1 Ned7 17. Rac1 Nc5 18. Bc2 Rfe8 19. Rxd8 Rxd8 20. Rd1 Re8 21. Qc4 Ne6 22. h3 a6 23. Bb3 Re7 24. Ne4 Bxe1 25. Nxf6+ gxf6 26. Qh4 Kg7 27. Bxe6 Rxe6 28. Rd7 Qf5 29. Rxb7 Re4 30. Qg3 Rb4 31. Rxb4 Bxb4 32. Qc7 Qb1+ 33. Kh2 Qxb2 34. Qxc6 Qxf2 35. Qxa6 Qxe3 0-1`,
  },
  {
    id: 'fischer-byrne',
    name: 'La Partie du Siècle (Fischer vs Byrne 1956)',
    description: 'Bobby Fischer, à 13 ans, sacrifie sa Dame pour une attaque irrésistible.',
    white: 'Donald Byrne',
    black: 'Bobby Fischer',
    category: 'master',
    pgn: `[Event "Third Rosenwald Trophy"]
[Site "New York, NY USA"]
[Date "1956.10.17"]
[White "Donald Byrne"]
[Black "Robert James Fischer"]
[Result "0-1"]
[ECO "D92"]

1. Nf3 Nf6 2. c4 g6 3. Nc3 Bg7 4. d4 O-O 5. Bf4 d5 6. Qb3 dxc4 7. Qxc4 c6 8. e4 Nbd7 9. Rd1 Nb6 10. Qc5 Bg4 11. Bg5 Na4 12. Qa3 Nxc3 13. bxc3 Nxe4 14. Bxe7 Qb6 15. Bc4 Nxc3 16. Bc5 Rfe8+ 17. Kf1 Be6 18. Bxb6 Bxc4+ 19. Kg1 Ne2+ 20. Kf1 Nxd4+ 21. Kg1 Ne2+ 22. Kf1 Nc3+ 23. Kg1 axb6 24. Qb4 Ra4 25. Qxb6 Nxd1 26. h3 Rxa2 27. Kh2 Nxf2 28. Re1 Rxe1 29. Qd8+ Bf8 30. Nxe1 Bd5 31. Nf3 Ne4 32. Qb8 b5 33. h4 h5 34. Ne5 Kg7 35. Kg1 Bc5+ 36. Kf1 Ng3+ 37. Ke1 Bb4+ 38. Kd1 Bb3+ 39. Kc1 Ne2+ 40. Kb1 Nc3+ 41. Kc1 Rc2# 0-1`,
  },
];
