'use client';

import { useId, useMemo, useState, type KeyboardEvent } from 'react';
import { optionText, searchOptions, type PickerOption } from '@/lib/pickerSearch';
import { EMPTY_PICK, type PickValue } from '@/lib/education';

const NOT_LISTED = '__not_listed__';

// A text box that filters a list as you type (ARIA combobox pattern). The last row is
// always "not listed", which reveals a text box for the athlete's own answer.
export function SearchPicker({
  label,
  options,
  value,
  onChange,
  notListedLabel,
  otherLabel,
  error,
}: {
  label: string;
  options: PickerOption[];
  value: PickValue;
  onChange: (value: PickValue) => void;
  notListedLabel: string;
  otherLabel: string;
  error?: string;
}) {
  const baseId = useId();
  const inputId = `${baseId}-input`;
  const listId = `${baseId}-list`;

  // null while the athlete isn't typing, so the box shows the current pick.
  const [query, setQuery] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const selected = value.id === null ? undefined : options.find((o) => o.id === value.id);
  const shownText = selected ? optionText(selected) : value.other !== null ? notListedLabel : '';

  const rows = useMemo(
    () => [
      ...searchOptions(options, query ?? '').map((o) => ({ id: o.id, text: optionText(o) })),
      { id: NOT_LISTED, text: notListedLabel },
    ],
    [options, query, notListedLabel]
  );

  function choose(id: string) {
    onChange(id === NOT_LISTED ? { id: null, other: value.other ?? '' } : { id, other: null });
    setQuery(null);
    setOpen(false);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) {
        setOpen(true);
      } else {
        setActive((i) => Math.min(i + 1, rows.length - 1));
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && open) {
      e.preventDefault();
      choose(rows[active].id);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setQuery(null);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={inputId}>{label}</label>
      <div className="relative">
        <input
          id={inputId}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open ? `${baseId}-option-${active}` : undefined}
          autoComplete="off"
          placeholder="Start typing to search"
          value={query ?? shownText}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActive(0);
            // Editing the box clears the earlier pick.
            if (value.id !== null || value.other !== null) onChange(EMPTY_PICK);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            setOpen(false);
            setQuery(null);
          }}
          onKeyDown={handleKeyDown}
          className="w-full rounded border px-3 py-2"
        />
        {open && (
          <ul
            id={listId}
            role="listbox"
            className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded border bg-white shadow"
          >
            {rows.map((row, i) => (
              <li
                key={row.id}
                id={`${baseId}-option-${i}`}
                role="option"
                aria-selected={i === active}
                // mousedown, not click, so the input's blur doesn't close the list first.
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(row.id);
                }}
                onMouseEnter={() => setActive(i)}
                className={`cursor-pointer px-3 py-2 text-sm ${i === active ? 'bg-blue-50' : ''} ${
                  row.id === NOT_LISTED ? 'border-t text-gray-600' : ''
                }`}
              >
                {row.text}
              </li>
            ))}
          </ul>
        )}
      </div>
      {value.other !== null && (
        <input
          aria-label={otherLabel}
          placeholder={otherLabel}
          value={value.other}
          onChange={(e) => onChange({ id: null, other: e.target.value })}
          className="rounded border px-3 py-2"
        />
      )}
      {error && <span className="text-sm text-red-600">{error}</span>}
    </div>
  );
}
