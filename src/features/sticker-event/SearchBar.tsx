import React, { useEffect, useId, useRef, useState } from 'react';
import { AppIcon } from '../../components/shared/ui/icon/AppIcon';
import { Product } from './types';
import { Button } from '../../components/shared/ui/Button';
import { Input } from '../../components/shared/ui/Input';

interface SearchBarProps {
  searchQuery: string;
  onSearchChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onIconClick: () => void;
  disabled: boolean;
  suggestions: Product[];
  onSuggestionClick: (product: Product) => void;
  /**
   * Bấm Enter trong ô tìm kiếm, kèm sản phẩm đang được tô trong danh sách gợi ý. Không truyền thì thêm sản phẩm đang tô.
   * Truyền vào để tự xử lý trường hợp gợi ý chưa kịp hiện, vd máy quét mã gõ xong bấm Enter ngay.
   */
  onSubmit?: (highlighted: Product | null) => void;
  showNoResults: boolean;
  isMobile?: boolean;
  hideTitle?: boolean;
  compact?: boolean;
}

const SearchBar: React.FC<SearchBarProps> = ({ 
  searchQuery, 
  onSearchChange, 
  onIconClick, 
  disabled, 
  suggestions, 
  onSuggestionClick,
  onSubmit,
  showNoResults,
  isMobile,
  hideTitle = false,
  compact = false,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  // Gợi ý đang được tô: mặc định là dòng đầu để gõ xong bấm Enter là thêm được ngay
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    setActiveIndex(suggestions.length > 0 ? 0 : -1);
  }, [suggestions]);

  useEffect(() => {
    if (activeIndex < 0) return;
    const item = listRef.current?.querySelector<HTMLElement>(`[data-suggestion-index="${activeIndex}"]`);
    item?.scrollIntoView?.({ block: 'nearest' });
  }, [activeIndex]);

  /** Sau khi thêm sản phẩm, con trỏ về lại ô tìm kiếm để tìm tiếp. */
  const focusInput = () => {
    window.requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
  };

  const handleClear = () => {
    // Kích hoạt sự kiện change với chuỗi rỗng
    const dummyEvent = {
      target: { value: '' }
    } as React.ChangeEvent<HTMLInputElement>;
    onSearchChange(dummyEvent);
    focusInput();
  };

  const choose = (product: Product) => {
    onSuggestionClick(product);
    focusInput();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Đang gõ dấu bằng bộ gõ (Telex, VNI): Enter và mũi tên thuộc về bộ gõ
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    const count = suggestions.length;

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (count === 0) return;
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex((current) => (current < 0 ? (step > 0 ? 0 : count - 1) : (current + step + count) % count));
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      const highlighted = activeIndex >= 0 ? suggestions[activeIndex] ?? null : null;
      if (onSubmit) {
        onSubmit(highlighted);
        focusInput();
      } else if (highlighted) {
        choose(highlighted);
      }
      return;
    }

    if (e.key === 'Escape' && searchQuery) {
      e.preventDefault();
      handleClear();
    }
  };

  const isListOpen = suggestions.length > 0 || showNoResults;
  const activeId = activeIndex >= 0 && suggestions[activeIndex] ? `${listId}-${activeIndex}` : undefined;

  return (
    <div className="w-full">
      {!isMobile && !hideTitle && (
        <div className="flex justify-between items-center mb-1.5">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Tìm kiếm sản phẩm</h2>
        </div>
      )}

      <div className="relative w-full">
        {/* Input container */}
        <div className={`relative flex items-center bg-white dark:bg-slate-800 rounded-popup sm:rounded-control border transition-all ${
          compact
            ? 'border-slate-200 dark:border-slate-700 h-8 sm:h-8.5 focus-within:border-sky-500 focus-within:ring-1 focus-within:ring-sky-500'
            : isMobile 
              ? 'border-slate-200 shadow-xs focus-within:border-sky-500 focus-within:ring-2 focus-within:ring-sky-100' 
              : 'border-slate-300 focus-within:border-sky-500 focus-within:ring-2 focus-within:ring-sky-500'
        } ${disabled ? 'bg-slate-50 dark:bg-slate-900 opacity-60' : ''}`}>
          {/* Icon Search */}
          <div className="pl-2.5 pr-1 text-slate-400 flex items-center pointer-events-none">
            <AppIcon name="search" size={compact ? 'sm' : 'md'} className="text-slate-400" />
          </div>

          {/* Input text */}
          {/* Khung bên ngoài lo viền + vòng sáng khi gõ (focus-within) → ô bên trong trong suốt, không viền, không ép 44px (nút quét
              cạnh bên đã cao 44px trên máy cảm ứng) */}
          <Input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={isListOpen}
            aria-controls={isListOpen ? listId : undefined}
            aria-activedescendant={activeId}
            onKeyDown={handleKeyDown}
            aria-label="Tìm sản phẩm"
            placeholder={isMobile ? "Nhập tên hoặc mã sản phẩm..." : "Nhập mã hoặc tên sản phẩm..."}
            value={searchQuery}
            onChange={onSearchChange}
            disabled={disabled}
            autoComplete="off"
            className={`h-auto max-sm:min-h-0 pointer-coarse:min-h-0 ${compact ? 'py-1 text-xs' : 'py-2.5 text-sm sm:text-base'} pl-1 pr-2 rounded-none border-0 bg-transparent text-slate-800 focus-visible:ring-0 disabled:bg-transparent disabled:opacity-100`}
          />

          {/* Nút Clear X (khi có text) */}
          {searchQuery && !disabled && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleClear}
              icon="close"
              title="Xóa tìm kiếm"
              aria-label="Xóa tìm kiếm"
              className="h-7 w-7 text-slate-400 hover:text-slate-600 rounded-full mr-1"
            />
          )}

          {/* Nút Quét mã Scan / QR */}
          <div className="pr-1.5 flex items-center">
            <Button
              type="button"
              variant="tinted"
              size="sm"
              onClick={onIconClick}
              disabled={disabled}
              icon="scan"
              title="Quét mã vạch / QR"
              aria-label="Quét mã vạch / QR"
              className={isMobile ? 'px-2' : ''}
            >
              {isMobile && <span className="text-[11px] font-semibold hidden xs:inline">Quét</span>}
            </Button>
          </div>
        </div>

        {/* Dropdown Gợi ý kết quả */}
        {isListOpen && (
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label="Gợi ý sản phẩm"
            className={`absolute z-50 w-full min-w-[280px] sm:min-w-[340px] left-0 mt-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-popup shadow-xl max-h-64 sm:max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700 animate-in fade-in slide-in-from-top-1 duration-150`}>
            {suggestions.map((suggestion, index) => (
              <li
                key={suggestion.msp}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                data-suggestion-index={index}
                // Giữ con trỏ trong ô tìm kiếm khi bấm chuột vào gợi ý
                onMouseDown={(e) => e.preventDefault()}
                onMouseMove={() => { if (index !== activeIndex) setActiveIndex(index); }}
                onClick={() => choose(suggestion)}
                className={`px-3 py-2 cursor-pointer active:bg-sky-100 transition-colors flex items-center justify-between gap-2 ${
                  index === activeIndex
                    ? 'bg-sky-50 dark:bg-slate-700/60 shadow-[inset_3px_0_0_0_var(--color-sky-500)]'
                    : 'hover:bg-sky-50/80 dark:hover:bg-slate-700/60'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-mono text-[11px] font-bold text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/60 px-1.5 py-0.5 rounded border border-sky-200/50 dark:border-sky-800/50">
                      {suggestion.msp}
                    </span>
                    {suggestion.giaGiam && (
                      <span className="text-xs font-bold text-rose-600 dark:text-rose-400 tabular-nums">
                        {suggestion.giaGiam}
                      </span>
                    )}
                  </div>
                  <p className="font-semibold text-xs text-slate-800 dark:text-slate-200 truncate mt-0.5" title={suggestion.sanPham}>
                    {suggestion.sanPham}
                  </p>
                </div>
                {index === activeIndex && !isMobile ? (
                  <kbd className="shrink-0 font-sans text-[10px] font-semibold text-sky-700 bg-white border border-sky-200 rounded px-1.5 py-0.5" aria-hidden="true">Enter</kbd>
                ) : (
                  <AppIcon name="chevronRight" size="sm" className="text-slate-400" />
                )}
              </li>
            ))}
            {showNoResults && (
              <li role="presentation" className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 text-center">
                Không tìm thấy sản phẩm phù hợp.
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
};

export default SearchBar;