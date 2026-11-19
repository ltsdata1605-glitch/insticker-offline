import React from 'react';
import { AppIcon } from '../../components/shared/ui/icon/AppIcon';
import { Product } from './types';
import SearchBar from './SearchBar';
import { Button } from '../../components/shared/ui/Button';
import { Select } from '../../components/shared/ui/Select';
import { useStickerScope } from './services/scope';

export type SortField = 'none' | 'giaGoc' | 'giaGiam' | 'tongThuong' | 'discount' | 'sanPham';
export type SortDirection = 'asc' | 'desc';

interface ProductToolbarProps {
  sortField?: SortField;
  sortDirection?: SortDirection;
  onSortChange?: (field: SortField, direction: SortDirection) => void;
  onExportImage?: () => void;

  // Tích hợp Tìm kiếm sản phẩm trực tiếp trên thanh lọc
  searchQuery?: string;
  onSearchChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onOpenScanner?: () => void;
  searchDisabled?: boolean;
  suggestions?: Product[];
  onSuggestionClick?: (product: Product) => void;
  onSearchSubmit?: (highlighted: Product | null) => void;
  showNoResults?: boolean;
}

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: 'none', label: 'Mặc định' },
  { value: 'giaGoc', label: 'Giá Gốc' },
  { value: 'giaGiam', label: 'Giá Đã Giảm' },
  { value: 'tongThuong', label: 'Thưởng' },
  { value: 'discount', label: '% Giảm giá' },
  { value: 'sanPham', label: 'Tên sản phẩm' },
];

const ProductToolbar: React.FC<ProductToolbarProps> = ({
  sortField = 'none',
  sortDirection = 'desc',
  onSortChange,
  onExportImage,
  searchQuery,
  onSearchChange,
  onOpenScanner,
  searchDisabled,
  suggestions,
  onSuggestionClick,
  onSearchSubmit,
  showNoResults,
}) => {
  const scope = useStickerScope();
  const handleSortFieldChange = (field: SortField) => {
    if (!onSortChange) return;
    if (field === sortField && field !== 'none') {
      onSortChange(field, sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      onSortChange(field, field === 'sanPham' ? 'asc' : 'desc');
    }
  };

  return (
    <div className="space-y-1.5">
      {/* Main row */}
      <div className="flex items-center gap-2 flex-wrap bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-popup px-2.5 py-1.5 shadow-2xs">
        {/* 1. Ô tìm kiếm sản phẩm (Được chuyển lên thanh lọc theo yêu cầu) */}
        {onSearchChange && (
          <div className="w-full sm:w-72 md:w-80 lg:w-84 xl:w-96 shrink-0">
            <SearchBar
              searchQuery={searchQuery || ''}
              onSearchChange={onSearchChange}
              onIconClick={onOpenScanner || (() => {})}
              disabled={!!searchDisabled}
              suggestions={suggestions || []}
              onSuggestionClick={onSuggestionClick || (() => {})}
              onSubmit={onSearchSubmit}
              showNoResults={!!showNoResults}
              hideTitle={true}
              compact={true}
            />
          </div>
        )}

        {onSearchChange && <div className="h-4 w-px bg-slate-300/60 dark:bg-slate-700 shrink-0" />}

        {/* Sắp xếp */}
        <div className="flex items-center gap-1 shrink-0">
          <AppIcon name="sort" size="sm" className="text-slate-400" />
          {/* GĐ10: ô chọn dùng chung — 32px trên laptop như nút "Bộ lọc" cạnh bên, 44px trên máy cảm ứng */}
          <Select
            fullWidth={false}
            aria-label="Sắp xếp theo"
            value={sortField}
            onChange={(e) => handleSortFieldChange(e.target.value as SortField)}
            className="h-8 pl-2 text-xs font-medium text-slate-700 border-slate-200"
            options={scope === 'sticker' ? SORT_OPTIONS.filter((option) => option.value !== 'tongThuong') : SORT_OPTIONS}
          />
          {sortField !== 'none' && (
            <Button
              variant="secondary"
              size="icon"
              onClick={() => onSortChange?.(sortField, sortDirection === 'asc' ? 'desc' : 'asc')}
              title={sortDirection === 'asc' ? 'Tăng dần' : 'Giảm dần'}
              aria-label={sortDirection === 'asc' ? 'Tăng dần' : 'Giảm dần'}
              className="text-xs font-bold"
            >
              {sortDirection === 'asc' ? '↑' : '↓'}
            </Button>
          )}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Bỏ sắp xếp */}
        {sortField !== 'none' && (
          <Button
            variant="inline-link"
            size="sm"
            onClick={() => onSortChange?.('none', 'desc')}
            className="text-xs text-rose-500 hover:text-rose-700 shrink-0 px-1 py-1"
          >
            Bỏ sắp xếp
          </Button>
        )}

        {/* 6. Export image button */}
        {onExportImage && (
          <Button
            variant="secondary"
            size="sm"
            onClick={onExportImage}
            icon="exportImage"
            title="Xuất danh sách thành ảnh PNG"
            className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200"
          >
            <span>Xuất ảnh</span>
          </Button>
        )}
      </div>

    </div>
  );
};

export default ProductToolbar;
