import { useEffect, useRef, useState } from 'react';
import { pickerItems } from '../model/composer-providers';
import type { SkillOption } from '../model/skill-source';
export type PickerAnchor = {
  left: number;
  bottom: number;
};
export type SkillPickerProps = {
  options: SkillOption[];
  loading: boolean;
  anchor: PickerAnchor;
  onPick(option: SkillOption): void;
  onClose(): void;
  onEsc(): void;
};
export function SkillPicker({
  options,
  loading,
  anchor,
  onPick,
  onClose,
  onEsc,
}: SkillPickerProps) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const items = pickerItems(query, options);
  const safeActive = active < items.length ? active : 0;
  const latest = useRef({ items, safeActive, query, onPick, onClose, onEsc });
  latest.current = { items, safeActive, query, onPick, onClose, onEsc };
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.isComposing || event.defaultPrevented) {
        return;
      }
      const state = latest.current;
      if (event.key === 'Escape') {
        consume(event);
        state.onEsc();
        return;
      }
      if (event.key === 'ArrowDown' && state.items.length > 0) {
        consume(event);
        setActive((index) => (index + 1) % state.items.length);
        return;
      }
      if (event.key === 'ArrowUp' && state.items.length > 0) {
        consume(event);
        setActive((index) => (index - 1 + state.items.length) % state.items.length);
        return;
      }
      if (event.key === 'Enter' && !event.shiftKey) {
        consume(event);
        const picked = state.items[state.safeActive] ?? state.items[0];
        if (picked) {
          state.onPick(picked);
        }
        return;
      }
      if (event.key === 'Backspace') {
        consume(event);
        if (state.query.length > 0) {
          setQuery((value) => value.slice(0, -1));
          setActive(0);
        } else {
          state.onClose();
        }
        return;
      }
      if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        consume(event);
        setQuery((value) => value + event.key);
        setActive(0);
      }
    }
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);
  const emptyLine = emptyStateLine(options.length, loading, query);
  return (
    <div
      className="z-50 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-md"
      data-testid="skill-picker"
      role="dialog"
      aria-label="Attach a skill"
      style={{ position: 'fixed', left: anchor.left, bottom: anchor.bottom }}
      onMouseDown={(event) => event.preventDefault()}
    >
      <ul className="max-h-56 overflow-y-auto py-1">
        {items.map((option, index) => {
          const isActive = index === safeActive;
          return (
            <li key={option.name}>
              <button
                type="button"
                className={`flex w-full items-start gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors ${isActive ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/60'}`}
                onMouseEnter={() => setActive(index)}
                onClick={() => onPick(option)}
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-medium font-mono text-xs">{option.name}</span>
                  <span className="text-muted-foreground text-xs">{option.description}</span>
                </div>
              </button>
            </li>
          );
        })}
        {items.length === 0 ? (
          <li className="px-3 py-2 text-muted-foreground text-xs">{emptyLine}</li>
        ) : null}
      </ul>
    </div>
  );
}
function consume(event: KeyboardEvent): void {
  event.preventDefault();
  event.stopPropagation();
}
function emptyStateLine(optionCount: number, loading: boolean, query: string): string {
  if (optionCount > 0) {
    return `No skills match "${query}"`;
  }
  if (loading) {
    return 'Loading skills…';
  }
  return 'The agent has no available skills';
}
