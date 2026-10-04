import React, { useId, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { MAX_NOTE_LENGTH, MAX_TAGS, MAX_TAG_LENGTH, normalizeTag, parseTags } from '../../utils/gameNotes';

interface GameNoteEditorProps {
  /** What the game says of itself ("Anna – Carl"): names the fields for assistive technology. */
  title: string;
  note: string;
  tags: readonly string[];
  /** The tags used elsewhere, the most used first: offered to be added in one click. */
  knownTags: readonly string[];
  onSave: (note: string, tags: string[]) => void;
  onCancel: () => void;
}

const SUGGESTIONS = 8;

const FIELD =
  'w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400';
const SMALL_BUTTON =
  'px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300';

/** The note and the tags of a game: written here, kept when the player saves. */
export const GameNoteEditor: React.FC<GameNoteEditorProps> = ({
  title,
  note: initialNote,
  tags: initialTags,
  knownTags,
  onSave,
  onCancel,
}) => {
  const [note, setNote] = useState(initialNote);
  const [tags, setTags] = useState<string[]>([...initialTags]);
  const [draft, setDraft] = useState('');
  const tagInput = useRef<HTMLInputElement>(null);
  const noteId = useId();
  const tagId = useId();

  const addTags = (text: string) => {
    const added = parseTags(text);
    if (added.length > 0) setTags((current) => [...new Set([...current, ...added])].slice(0, MAX_TAGS));
    setDraft('');
  };
  const removeTag = (tag: string) => {
    setTags((current) => current.filter((t) => t !== tag));
    tagInput.current?.focus();
  };
  const isFull = tags.length >= MAX_TAGS;
  const suggestions = knownTags.filter((tag) => !tags.includes(tag)).slice(0, SUGGESTIONS);

  const save = () => {
    // A tag typed and not yet added counts
    const pending = parseTags(draft);
    onSave(note, [...new Set([...tags, ...pending])].slice(0, MAX_TAGS));
  };

  return (
    <form
      aria-label={`Note et étiquettes de la partie ${title}`}
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
      className="flex flex-col gap-3 border-t border-slate-800 px-3.5 py-3"
    >
      <div className="flex flex-col gap-1">
        <label htmlFor={noteId} className="text-xs font-semibold text-slate-300">
          Note personnelle
        </label>
        <textarea
          id={noteId}
          value={note}
          onChange={(event) => setNote(event.target.value.slice(0, MAX_NOTE_LENGTH))}
          rows={3}
          placeholder="Ce que je retiens de cette partie, ce que je dois revoir…"
          className={`${FIELD} resize-y min-h-16`}
        />
        <span className="text-[11px] text-slate-400 self-end" aria-hidden="true">
          {note.length} / {MAX_NOTE_LENGTH}
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={tagId} className="text-xs font-semibold text-slate-300">
          Étiquettes
        </label>
        {tags.length > 0 && (
          <ul aria-label="Étiquettes de la partie" className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <li
                key={tag}
                className="flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-xs text-indigo-200"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  aria-label={`Retirer l'étiquette ${tag}`}
                  className="p-0.5 rounded-full hover:bg-indigo-500/30 cursor-pointer"
                >
                  <X className="w-3 h-3" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <input
            id={tagId}
            ref={tagInput}
            type="text"
            value={draft}
            maxLength={MAX_TAG_LENGTH * 4}
            disabled={isFull}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ',') {
                event.preventDefault();
                addTags(draft);
              } else if (event.key === 'Backspace' && draft === '' && tags.length > 0) {
                setTags((current) => current.slice(0, -1));
              }
            }}
            placeholder={isFull ? `${MAX_TAGS} étiquettes au plus` : 'à revoir, tournoi, finale de tours…'}
            className={FIELD}
          />
          <button
            type="button"
            onClick={() => addTags(draft)}
            disabled={isFull || normalizeTag(draft) === ''}
            className={`${SMALL_BUTTON} flex items-center gap-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            Ajouter
          </button>
        </div>
        {suggestions.length > 0 && !isFull && (
          <div role="group" aria-label="Étiquettes déjà utilisées" className="flex flex-wrap gap-1.5">
            {suggestions.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => addTags(tag)}
                className="px-2 py-0.5 rounded-full border border-slate-700 text-xs text-slate-300 hover:bg-slate-800 cursor-pointer"
              >
                + {tag}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-2">
        <button type="button" onClick={onCancel} className={`${SMALL_BUTTON} text-slate-300 hover:bg-slate-800`}>
          Annuler
        </button>
        <button type="submit" className={`${SMALL_BUTTON} bg-indigo-600 hover:bg-indigo-500 text-white`}>
          Enregistrer
        </button>
      </div>
    </form>
  );
};
