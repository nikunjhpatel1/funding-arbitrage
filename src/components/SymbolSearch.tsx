'use client';

import React, { useState, useEffect, useCallback } from 'react';

interface SymbolSearchProps {
  /** Currently selected symbol (e.g. "BTC/USDT") */
  value: string;
  /** Called when the user picks or types a new symbol */
  onChange: (symbol: string) => void;
  /** Optional placeholder text */
  placeholder?: string;
  /** Optional inline style overrides for the container <div> */
  style?: React.CSSProperties;
  /** Optional inline style overrides for the <input> */
  inputStyle?: React.CSSProperties;
}

/**
 * Reusable symbol search / autocomplete component.
 * Fetches the live symbol list from /api/funding-rates and shows a
 * filtered dropdown as the user types. Supports keyboard navigation
 * (ArrowUp / ArrowDown / Enter / Escape).
 */
export default function SymbolSearch({
  value,
  onChange,
  placeholder = 'Search symbol…',
  style,
  inputStyle,
}: SymbolSearchProps) {
  const [allSymbols, setAllSymbols] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);

  // Sync searchQuery when parent changes value externally (e.g. URL param)
  useEffect(() => {
    setSearchQuery(value);
  }, [value]);

  // Fetch symbol list once on mount
  useEffect(() => {
    fetch('/api/funding-rates')
      .then(r => r.json())
      .then(json => {
        if (json.data) {
          setAllSymbols(json.data.map((d: any) => d.symbol as string));
        }
      })
      .catch(console.error);
  }, []);

  const filter = useCallback(
    (q: string) =>
      allSymbols
        .filter(
          s =>
            s.toLowerCase().includes(q.toLowerCase()) ||
            s.split('/')[0].toLowerCase().includes(q.toLowerCase()),
        )
        .slice(0, 10),
    [allSymbols],
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setSearchQuery(v);
    onChange(v);
    setSuggestions(filter(v));
    setShowSuggestions(true);
    setActiveSuggestionIndex(0);
  };

  const select = (s: string) => {
    setSearchQuery(s);
    onChange(s);
    setShowSuggestions(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' && activeSuggestionIndex < suggestions.length - 1) {
      setActiveSuggestionIndex(i => i + 1);
    } else if (e.key === 'ArrowUp' && activeSuggestionIndex > 0) {
      setActiveSuggestionIndex(i => i - 1);
    } else if (e.key === 'Enter' && showSuggestions && suggestions.length > 0) {
      e.preventDefault();
      select(suggestions[activeSuggestionIndex]);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  const handleFocus = () => {
    if (searchQuery && allSymbols.length > 0) {
      setSuggestions(filter(searchQuery));
      setShowSuggestions(true);
    }
  };

  const handleBlur = () => {
    // Small delay so onClick on a suggestion fires before blur hides the list
    setTimeout(() => setShowSuggestions(false), 200);
  };

  const baseInput: React.CSSProperties = {
    width: '100%',
    background: 'var(--bg-dark)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    color: '#fff',
    padding: '10px 12px',
    outline: 'none',
    fontSize: '0.9rem',
    boxSizing: 'border-box',
  };

  return (
    <div style={{ position: 'relative', ...style }}>
      <input
        type="text"
        value={searchQuery}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder}
        autoComplete="off"
        required
        style={{ ...baseInput, ...inputStyle }}
      />

      {showSuggestions && suggestions.length > 0 && (
        <ul
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 100,
            background: 'var(--bg-card, #1e293b)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            marginTop: 4,
            padding: 0,
            listStyle: 'none',
            maxHeight: 220,
            overflowY: 'auto',
            boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
          }}
        >
          {suggestions.map((s, idx) => (
            <li
              key={s}
              onMouseDown={() => select(s)} // mouseDown fires before blur
              onMouseEnter={() => setActiveSuggestionIndex(idx)}
              style={{
                padding: '10px 14px',
                cursor: 'pointer',
                fontSize: '0.9rem',
                fontFamily: 'monospace',
                background:
                  idx === activeSuggestionIndex
                    ? 'rgba(59,130,246,0.12)'
                    : 'transparent',
                color:
                  idx === activeSuggestionIndex
                    ? 'var(--accent-blue, #3b82f6)'
                    : 'var(--text-primary, #f1f5f9)',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
              }}
            >
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
