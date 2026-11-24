import React, { useMemo } from 'react';
import { AppIcon } from '../../../components/shared/ui/icon/AppIcon';
import type { StickerPage } from './types';
import { generatePageHtml, resolveQueuePage, tagQueueContext } from './pageHtmlUtils';
import type { QueuePageContext } from './pageHtmlUtils';
import { resolveEffectiveBgImage } from './stickerBackgroundHelpers';
import { stickerPageToTagProduct } from './tagProducts';
import { TagRender } from './TagRender';
import { QuantityStepper } from './QuantityStepper';
import { matchesSticker } from './listSearch';
import type { PrintSettings } from '../services/printService';

/** Mỗi ảnh là một tem đầy đủ. Danh sách dài hơn thì xem ở tab D.Sách để không làm nặng màn hình. */
const MAX_THUMBNAILS = 200;

interface StickerQueueStripProps extends QueuePageContext {
  pages: StickerPage[];
  activeId: string | null;
  bgImage: string;
  priceSource: 'sale' | 'service';
  discountDisplayMode: 'percent' | 'amount';
  onSelect: (page: StickerPage) => void;
  onRemove: (id: string) => void;
  /** Đổi số bản in của một sticker. */
  onQuantity: (id: string, quantity: number) => void;
  /** Tab Sticker: ảnh là tem giá theo kiểu đang chọn thay cho sticker Giá Sốc. */
  tagView?: { settings: PrintSettings; employeeName: string };
  /** Ô tìm sticker: chỉ hiện sticker khớp tên hoặc mã, số thứ tự vẫn theo danh sách. */
  query?: string;
}

interface ThumbnailProps extends Omit<StickerQueueStripProps, 'pages' | 'activeId' | 'onSelect' | 'onRemove' | 'onQuantity' | 'query'> {
  page: StickerPage;
  index: number;
  active: boolean;
  onSelect: (page: StickerPage) => void;
  onRemove: (id: string) => void;
  onQuantity: (id: string, quantity: number) => void;
}

// Nội dung lấy qua đúng hàm dựng trang in, trong đó mọi trường đều đã escape, nên thấy sao in ra vậy.
const Thumbnail: React.FC<ThumbnailProps> = React.memo(({
  page, index, active, onSelect, onRemove, onQuantity, bgImage, priceSource, discountDisplayMode, tagView, ...context
}) => {
  const { stickerType, headerTextContent, subHeaderTextContent, footerTextContent } = context;
  const tagProducts = useMemo(() => (tagView
    ? [stickerPageToTagProduct(resolveQueuePage(page, tagQueueContext({ stickerType, headerTextContent, subHeaderTextContent, footerTextContent })), priceSource)]
    : null), [tagView, page, stickerType, headerTextContent, subHeaderTextContent, footerTextContent, priceSource]);
  const html = useMemo(() => tagView ? '' : generatePageHtml(
    resolveQueuePage(page, { stickerType, headerTextContent, subHeaderTextContent, footerTextContent }),
    priceSource,
    stickerType,
    resolveEffectiveBgImage(stickerType, bgImage),
    discountDisplayMode,
  ), [tagView, page, stickerType, headerTextContent, subHeaderTextContent, footerTextContent, priceSource, bgImage, discountDisplayMode]);

  // Nút xoá nằm cạnh ảnh chứ không nằm trong ảnh, vì ảnh đã là một nút bấm. Ô số bản in nằm ngay dưới ảnh để không che giá.
  return (
    <div className="relative shrink-0 flex flex-col items-end gap-1">
      <div
        role="button"
        tabIndex={0}
        aria-label={`Mở sticker ${index + 1}: ${page.label}`}
        aria-pressed={active}
        title={page.label}
        data-testid="sticker-thumbnail"
        onClick={() => onSelect(page)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect(page);
          }
        }}
        className={`relative w-full cursor-pointer bg-white rounded-sm overflow-hidden outline-none ring-2 transition-shadow focus-visible:ring-sky-400 ${
          active ? 'ring-sky-600' : 'ring-slate-200 hover:ring-sky-300'
        } ${page.selected === false ? 'opacity-50' : ''}`}
      >
        {tagView && tagProducts ? (
          <TagRender products={tagProducts} settings={tagView.settings} employeeName={tagView.employeeName} width={104} className="pointer-events-none select-none" />
        ) : (
          <div className="pointer-events-none select-none" dangerouslySetInnerHTML={{ __html: html }} />
        )}
        <span className="absolute left-1 top-1 min-w-4 h-4 px-1 rounded-full bg-sky-600 text-white text-[10px] font-bold leading-4 text-center">
          {index + 1}
        </span>
      </div>
      <button
        type="button"
        onClick={() => onRemove(page.id)}
        aria-label={`Xoá sticker ${index + 1}: ${page.label}`}
        title="Xoá sticker này khỏi danh sách"
        data-testid="sticker-thumbnail-remove"
        className="ycx-hit absolute right-1 top-1 w-5 h-5 rounded-full flex items-center justify-center bg-white/95 text-slate-500 ring-1 ring-slate-300 shadow-sm hover:bg-rose-500 hover:text-white hover:ring-rose-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 transition-colors"
      >
        <AppIcon name="close" size="xs" />
      </button>
      {/* Số bản in ngay dưới góc phải ảnh */}
      <QuantityStepper
        value={page.quantity ?? 1}
        onChange={(quantity) => onQuantity(page.id, quantity)}
        label={`Số bản in của sticker ${index + 1}: ${page.label}`}
      />
    </div>
  );
});

/** Dải ảnh thu nhỏ bên trái bản xem trước: thấy đủ mọi sticker trong danh sách, bấm vào ảnh để mở và sửa, bấm x để xoá. */
export const StickerQueueStrip: React.FC<StickerQueueStripProps> = ({ pages, activeId, onSelect, onRemove, onQuantity, query = '', ...rest }) => {
  const shown = useMemo(() => {
    const indexed = pages.map((page, index) => ({ page, index }));
    return query.trim() ? indexed.filter(({ page }) => matchesSticker(page, query)) : indexed;
  }, [pages, query]);
  if (pages.length === 0) return null;
  return (
    <div
      data-testid="sticker-strip"
      aria-label="Các sticker trong danh sách"
      className="no-print hidden lg:flex flex-col gap-2.5 shrink-0 w-[112px] lg:h-[max(556px,82%)] overflow-y-auto p-1 scrollbar-thin"
    >
      {shown.length === 0 && (
        <p className="pt-2 text-[11px] leading-snug text-slate-500 text-center">Không có sticker nào khớp ô tìm</p>
      )}
      {shown.slice(0, MAX_THUMBNAILS).map(({ page, index }) => (
        <Thumbnail
          key={page.id}
          page={page}
          index={index}
          active={page.id === activeId}
          onSelect={onSelect}
          onRemove={onRemove}
          onQuantity={onQuantity}
          {...rest}
        />
      ))}
      {shown.length > MAX_THUMBNAILS && (
        <p className="text-[11px] text-slate-500 text-center">Còn {shown.length - MAX_THUMBNAILS} sticker, gõ tên hoặc mã ở ô tìm, hoặc xem ở tab D.Sách</p>
      )}
    </div>
  );
};
