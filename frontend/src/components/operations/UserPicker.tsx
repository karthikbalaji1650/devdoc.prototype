import React, { useEffect, useId, useRef, useState } from 'react';
import { describePerson, searchUsers, type PersonOption } from '../../services/usersApiService';

interface UserPickerProps {
  /** People already chosen (or otherwise not to be offered again). */
  excludeIds: string[];
  onPick: (person: PersonOption) => void;
  disabled?: boolean;
  placeholder?: string;
  label?: string;
}

/**
 * Type to find a person by name, title or department, then pick them.
 * Searches the server as you type (people are never all loaded at once).
 */
export const UserPicker: React.FC<UserPickerProps> = ({ excludeIds, onPick, disabled, placeholder = 'Type a name…', label = 'Search people' }) => {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<PersonOption[] | null>(null);
  const [error, setError] = useState('');
  const [active, setActive] = useState(0);
  const latest = useRef(0);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const ticket = ++latest.current;
    const timer = setTimeout(() => {
      searchUsers(query)
        .then((found) => { if (ticket === latest.current) { setResults(found); setError(''); setActive(0); } })
        .catch((err: Error) => { if (ticket === latest.current) { setResults([]); setError(err.message); } });
    }, query ? 200 : 0);
    return () => clearTimeout(timer);
  }, [query, open]);

  const options = (results ?? []).filter((p) => !excludeIds.includes(p.id));

  const pick = (person: PersonOption) => {
    onPick(person);
    setQuery('');
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((i) => Math.min(i + 1, Math.max(options.length - 1, 0))); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && open && options[active]) { e.preventDefault(); pick(options[active]); }
    else if (e.key === 'Escape') { setOpen(false); }
  };

  return (
    <div className="relative">
      <input
        type="text"
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && options[active] ? `${listId}-${options[active].id}` : undefined}
        autoComplete="off"
        disabled={disabled}
        placeholder={placeholder}
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKeyDown}
        className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 outline-none focus:border-blue-500 disabled:bg-slate-100"
      />
      {open && !disabled && (
        <ul id={listId} role="listbox" aria-label="People" className="absolute z-20 mt-1 w-full max-h-56 overflow-auto bg-white border border-slate-200 rounded-lg shadow-lg text-xs">
          {results === null && <li className="px-3 py-2 text-slate-500">Searching…</li>}
          {results !== null && error && <li role="alert" className="px-3 py-2 text-rose-600">{error}</li>}
          {results !== null && !error && options.length === 0 && <li className="px-3 py-2 text-slate-500">No one found.</li>}
          {options.map((p, i) => (
            <li
              key={p.id}
              id={`${listId}-${p.id}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => { e.preventDefault(); pick(p); }}
              onMouseEnter={() => setActive(i)}
              className={`px-3 py-2 cursor-pointer ${i === active ? 'bg-blue-50' : ''}`}
            >
              <div className="font-semibold text-slate-900">{p.name}</div>
              {describePerson(p) && <div className="text-[11px] text-slate-500">{describePerson(p)}</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
