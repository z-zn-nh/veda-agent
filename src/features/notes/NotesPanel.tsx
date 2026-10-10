import { FileText, FolderPlus, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Tooltip } from '../../ui/Tooltip';
import type { PaneViewProps } from '../../layout/registry';

/**
 * Notes pane.
 *
 * Placeholder storage: drafts live in localStorage under a neutral placeholder key.
 * A real workspace/note service replaces this in a later phase; the pane API
 * (pane + onStatus) stays the same.
 */
const KEY_PREFIX = 'veda-agent:notes:';

const NOTES = [
  { id: 'session', title: 'Session notes', body: '# Session notes\n\nCapture decisions and context while you work.' },
  { id: 'architecture', title: 'Architecture ideas', body: '# Architecture ideas\n\nA clean home for future decisions.' },
  { id: 'scratch', title: 'Scratchpad', body: '# Scratchpad\n\nSmall thoughts belong here.' },
];

export function NotesPanel({ onStatus }: PaneViewProps) {
  const [selected, setSelected] = useState(NOTES[0].id);
  const [content, setContent] = useState(NOTES[0].body);
  const [query, setQuery] = useState('');
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(KEY_PREFIX + selected);
    if (saved !== null) setContent(saved);
    else setContent(NOTES.find((note) => note.id === selected)?.body ?? '');
    setDirty(false);
  }, [selected]);

  useEffect(() => {
    onStatus(dirty ? 'dirty' : 'ready');
  }, [dirty, onStatus]);

  const save = () => {
    window.localStorage.setItem(KEY_PREFIX + selected, content);
    setDirty(false);
  };

  const visible = NOTES.filter((note) => note.title.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="notes-pane">
      <aside className="notes-rail">
        <div className="v-search-wrap">
          <Search size={14} strokeWidth={1.8} />
          <input
            className="v-input v-search"
            aria-label="Search notes"
            placeholder="Search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="notes-scroll">
          {visible.map((note) => (
            <button
              key={note.id}
              type="button"
              className={`note-item ${selected === note.id ? 'is-selected' : ''}`}
              onClick={() => setSelected(note.id)}
            >
              <FileText size={14} strokeWidth={1.7} />
              <span>{note.title}</span>
            </button>
          ))}
        </div>
        <Tooltip label="New note">
          <button type="button" className="v-icon notes-new" aria-label="New note">
            <FolderPlus size={15} strokeWidth={1.8} />
          </button>
        </Tooltip>
      </aside>
      <section className="note-body">
        <textarea
          aria-label="Note editor"
          className="note-input"
          value={content}
          onChange={(event) => {
            setContent(event.currentTarget.value);
            setDirty(true);
          }}
          onBlur={save}
        />
      </section>
    </div>
  );
}
