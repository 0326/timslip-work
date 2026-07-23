import { useState, useRef, useEffect, type FormEvent } from "react";

interface BookOption {
  value: string;
  label: string;
}

interface SearchBarProps {
  initialQuery: string;
  initialBook: string;
  books: BookOption[];
  onSearch: (query: string, book: string) => void;
}

export function SearchBar({ initialQuery, initialBook, books, onSearch }: SearchBarProps) {
  const [query, setQuery] = useState(initialQuery);
  const [book, setBook] = useState(initialBook);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedBook = books.find((b) => b.value === book) || books[0];

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSearch(query, book);
  };

  // 点击外部关闭下拉
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    if (dropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [dropdownOpen]);

  return (
    <form className="search-bar" onSubmit={handleSubmit}>
      <div className="search-bar-input-wrap">
        <input
          type="text"
          className="search-bar-input"
          placeholder="检索原文、人物、事件…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
      </div>
      <div className="search-bar-dropdown" ref={dropdownRef}>
        <button
          type="button"
          className={`search-bar-select${dropdownOpen ? " open" : ""}`}
          onClick={() => setDropdownOpen(!dropdownOpen)}
        >
          <span className="search-bar-select-label">{selectedBook.label}</span>
          <svg
            className={`search-bar-select-arrow${dropdownOpen ? " up" : ""}`}
            width="10"
            height="6"
            viewBox="0 0 10 6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M1 1l4 4 4-4" />
          </svg>
        </button>
        {dropdownOpen && (
          <ul className="search-bar-options" role="listbox">
            {books.map((opt) => (
              <li
                key={opt.value}
                className={`search-bar-option${opt.value === book ? " selected" : ""}`}
                onClick={() => {
                  setBook(opt.value);
                  setDropdownOpen(false);
                }}
                role="option"
                aria-selected={opt.value === book}
              >
                {opt.label}
              </li>
            ))}
          </ul>
        )}
      </div>
      <button type="submit" className="search-bar-submit">
        检索
      </button>
    </form>
  );
}
