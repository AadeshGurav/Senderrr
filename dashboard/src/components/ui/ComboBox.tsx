import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Search, Check } from 'lucide-react';

interface Option {
  value: string;
  label: string;
  sublabel?: string;
}

interface ComboBoxProps {
  label?: string;
  options: Option[];
  selected: Option[];
  onChange: (selected: Option[]) => void;
  placeholder?: string;
  emptyMessage?: string;
}

export function ComboBox({
  label,
  options,
  selected,
  onChange,
  placeholder = 'Search...',
  emptyMessage = 'No results found',
}: ComboBoxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [focusedIdx, setFocusedIdx] = useState(0);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputWrapRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedIds = useMemo(() => new Set(selected.map(s => s.value)), [selected]);

  const filtered = useMemo(() => {
    if (!query.trim()) return options.filter(o => !selectedIds.has(o.value));
    const q = query.toLowerCase();
    return options.filter(
      o =>
        !selectedIds.has(o.value) &&
        (o.label.toLowerCase().includes(q) || (o.sublabel || '').toLowerCase().includes(q)),
    );
  }, [options, selectedIds, query]);

  useEffect(() => {
    if (!open) setQuery('');
    setFocusedIdx(0);
  }, [open]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node) &&
          dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const updateDropdownPosition = useCallback(() => {
    if (open && inputWrapRef.current) {
      const rect = inputWrapRef.current.getBoundingClientRect();
      setDropdownStyle({
        position: 'fixed',
        left: rect.left,
        top: rect.bottom + 4,
        width: rect.width,
        maxHeight: '14rem',
        zIndex: 9999,
      });
    }
  }, [open]);

  useEffect(() => {
    updateDropdownPosition();
    window.addEventListener('scroll', updateDropdownPosition, true);
    window.addEventListener('resize', updateDropdownPosition);
    return () => {
      window.removeEventListener('scroll', updateDropdownPosition, true);
      window.removeEventListener('resize', updateDropdownPosition);
    };
  }, [updateDropdownPosition]);

  const selectOption = (opt: Option) => {
    onChange([...selected, opt]);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setOpen(true);
        e.preventDefault();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setFocusedIdx(i => Math.min(i + 1, filtered.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedIdx(i => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (filtered[focusedIdx]) {
          selectOption(filtered[focusedIdx]);
        }
        break;
      case 'Escape':
        setOpen(false);
        break;
    }
  };

  const openDropdown = () => {
    setOpen(true);
    // position will be recalculated by the effect
  };

  return (
    <div className="space-y-1.5" ref={containerRef}>
      {label && (
        <label className="block text-sm font-medium text-[var(--color-text-secondary)]">
          {label}
        </label>
      )}
      <div
        ref={inputWrapRef}
        className={`flex flex-wrap items-center gap-1.5 px-3 py-2 text-sm bg-[var(--color-bg-secondary)]
          border border-[var(--color-border)] rounded-xl transition-all duration-200 cursor-text
          focus-within:ring-2 focus-within:ring-[var(--color-primary)]/20 focus-within:border-[var(--color-primary)]
          ${open ? 'ring-2 ring-[var(--color-primary)]/20 border-[var(--color-primary)]' : ''}`}
        onClick={() => {
          inputRef.current?.focus();
          openDropdown();
        }}
      >
        <div className="relative flex-1 min-w-[120px]">
          <Search size={14} className="absolute left-1 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); openDropdown(); }}
            onFocus={openDropdown}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="w-full pl-6 pr-2 py-0.5 bg-transparent border-none text-gray-900 dark:text-white
              placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none text-sm"
          />
        </div>
      </div>

      {open && createPortal(
        <div
          ref={dropdownRef}
          style={dropdownStyle}
          className="overflow-auto bg-white dark:bg-black
            border border-gray-200 dark:border-gray-800 rounded-xl shadow-lg shadow-black/5 dark:shadow-black/20"
        >
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-400">{emptyMessage}</div>
          ) : (
            filtered.map((opt, i) => (
              <button
                key={opt.value}
                type="button"
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors
                  ${i === focusedIdx ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900'}`}
                onMouseEnter={() => setFocusedIdx(i)}
                onMouseDown={e => e.stopPropagation()}
                onClick={() => selectOption(opt)}
              >
                <Check
                  size={14}
                  className="shrink-0 opacity-0"
                />
                <div className="min-w-0">
                  <div className="truncate">{opt.label}</div>
                  {opt.sublabel && (
                    <div className="text-xs text-gray-400 truncate font-mono">
                      {opt.sublabel}
                    </div>
                  )}
                </div>
              </button>
            ))
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
