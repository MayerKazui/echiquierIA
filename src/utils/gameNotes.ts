/**
 * What the player writes about a game of their history: a few tags ("à revoir", "tournoi", "finale de tours") and a
 * free note. It is kept apart from the game (see `gameNoteStore`): editing it does not make the game look newer to a
 * synced history, and a game that is analysed again finds its note.
 */

export interface GameNote {
  /** The id of the game (`gameId` of its PGN). */
  id: string;
  /** Free text, empty when there is none. */
  note: string;
  /** Short labels, lower case, without duplicates. */
  tags: string[];
  /** Milliseconds since the epoch: the last change (the most recent copy wins when two are merged). */
  updatedAt: number;
}

export const MAX_NOTE_LENGTH = 2000;
export const MAX_TAGS = 8;
export const MAX_TAG_LENGTH = 24;

/** A tag as it is kept: no leading #, spaces collapsed, lower case, short. Empty when nothing is left. */
export function normalizeTag(raw: string): string {
  return raw.trim().replace(/^#+/, '').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, MAX_TAG_LENGTH).trim();
}

/** The tags of a text typed with commas or line breaks ("à revoir, tournoi"), normalised, without duplicates or empties. */
export function parseTags(text: string): string[] {
  return normalizeTags(text.split(/[,;\n]/));
}

/** The tags normalised, without duplicates or empties, at most `MAX_TAGS` of them. */
export function normalizeTags(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  for (const raw of tags) {
    const tag = normalizeTag(raw);
    if (tag !== '') seen.add(tag);
  }
  return [...seen].slice(0, MAX_TAGS);
}

/** Whether there is anything in the note: an emptied one is only kept as the trace of the change. */
export const hasContent = (note: Pick<GameNote, 'note' | 'tags'> | undefined): boolean =>
  note !== undefined && (note.note.trim() !== '' || note.tags.length > 0);

/** The note as it is kept: the text trimmed and cut, the tags normalised. */
export function makeNote(id: string, text: string, tags: readonly string[], now: number): GameNote {
  return { id, note: text.trim().slice(0, MAX_NOTE_LENGTH), tags: normalizeTags(tags), updatedAt: now };
}

/** Cheap structural check: the data can come from another version of the app or be damaged. */
export function isGameNote(value: unknown): value is GameNote {
  if (typeof value !== 'object' || value === null) return false;
  const note = value as Record<string, unknown>;
  return (
    typeof note.id === 'string' &&
    note.id !== '' &&
    typeof note.note === 'string' &&
    note.note.length <= MAX_NOTE_LENGTH &&
    Array.isArray(note.tags) &&
    note.tags.length <= MAX_TAGS &&
    note.tags.every((tag) => typeof tag === 'string' && tag.length <= MAX_TAG_LENGTH) &&
    typeof note.updatedAt === 'number' &&
    Number.isFinite(note.updatedAt)
  );
}

/** Every tag used, the most used first (then alphabetical), with how many notes carry it. */
export function tagCounts(notes: Iterable<GameNote>): Array<{ tag: string; count: number }> {
  const counts = new Map<string, number>();
  for (const note of notes) for (const tag of note.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'fr'));
}
