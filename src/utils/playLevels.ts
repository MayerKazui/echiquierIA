/**
 * The strength levels of "Jouer contre Stockfish". Stockfish weakens itself in two ways: `UCI_Elo` (1320 to 3190,
 * with `UCI_LimitStrength`) and `Skill Level` (0 to 20). The Elo scale is the engine's own, measured against
 * other engines at a short time control: against a person it is only a rough guide, and the screen says so.
 */
export interface PlayLevel {
  id: string;
  label: string;
  /** What the player can expect, in a few words. */
  detail: string;
  /** The `UCI_Elo` value; null when the strength is set with `skill` alone (or not limited). */
  elo: number | null;
  /** The `Skill Level` value (0 to 20). */
  skill: number;
  /** Thinking time for each move. */
  moveTimeMs: number;
}

export const PLAY_LEVELS: readonly PlayLevel[] = [
  { id: 'debutant', label: 'Débutant', detail: 'Joue vite et se trompe souvent', elo: null, skill: 0, moveTimeMs: 150 },
  { id: 'facile', label: 'Facile', detail: 'Environ 1 300', elo: 1320, skill: 20, moveTimeMs: 300 },
  { id: 'club', label: 'Club', detail: 'Environ 1 600', elo: 1600, skill: 20, moveTimeMs: 500 },
  { id: 'confirme', label: 'Confirmé', detail: 'Environ 1 900', elo: 1900, skill: 20, moveTimeMs: 700 },
  { id: 'expert', label: 'Expert', detail: 'Environ 2 200', elo: 2200, skill: 20, moveTimeMs: 1000 },
  { id: 'maitre', label: 'Maître', detail: 'Environ 2 600', elo: 2600, skill: 20, moveTimeMs: 1200 },
  { id: 'maximum', label: 'Maximum', detail: 'Toute la force du moteur', elo: null, skill: 20, moveTimeMs: 1500 },
];

export const DEFAULT_LEVEL_ID = 'club';

export function levelById(id: string | undefined): PlayLevel {
  return PLAY_LEVELS.find((level) => level.id === id) ?? PLAY_LEVELS.find((level) => level.id === DEFAULT_LEVEL_ID)!;
}

/**
 * The UCI commands that set a level. `UCI_LimitStrength` takes over `Skill Level` when it is on, so each level
 * sets all of the options and none depends on what the previous game left behind.
 */
export function levelCommands(level: PlayLevel): string[] {
  const commands = [`setoption name Skill Level value ${level.skill}`];
  if (level.elo !== null) {
    commands.push('setoption name UCI_LimitStrength value true', `setoption name UCI_Elo value ${level.elo}`);
  } else {
    commands.push('setoption name UCI_LimitStrength value false');
  }
  return commands;
}
