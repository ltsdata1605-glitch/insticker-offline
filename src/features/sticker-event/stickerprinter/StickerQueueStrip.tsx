import React, { useMemo } from 'react';
import type { StickerPage } from './types';
import { generatePageHtml, resolveQueuePage } from './pageHtmlUtils';
import type { QueuePageContext } from './pageHtmlUtils';
import { resolveEffectiveBgImage } from './stickerBackgroundHelpers';

/** Mỗi ảnh là một tem đầy đủ. Danh sách dài hơn thì xem ở tab D.Sách để không làm nặng màn hình. */
const MAX_THUMBNAILS = 200;

interface StickerQueueStripProps extends QueuePageContext {
  pages: StickerPage[];
  activeId: string | null;
  bgImage: string;
  priceSource: 'sale' | 'service';
  discountDisplayMode: 'percent' | 'amount';
  onSelect: (page: StickerPage) => void;
}

interface ThumbnailProps extends Omit<StickerQueueStripProps, 'pages' | 'activeId' | 'onSelect'> {
  page: StickerPage;
  index: number;
  active: boolean;
  onSelect: (page: StickerPage) => void;
}

// Nội dung lấy qua đúng hàm dựng trang in, trong đó mọi trường đều đã escape, nên thấy sao in ra vậy.
const Thumbnail: React.FC<ThumbnailProps> = React.memo(({
  page, index, active, onSelect, bgImage, priceSource, discountDisplayMode, ...context
}) => {
  const { stickerType, headerTextContent, subHeaderTextContent, footerTextContent, showBarcode } = context;
  const html = useMemo(() => generatePageHtml(
    resolveQueuePage(page, { stickerType, headerTextContent, subHeaderTextContent, footerTextContent, showBarcode }),
    priceSource,
    stickerType,
    resolveEffectiveBgImage(stickerType, bgImage),
    discountDisplayMode,
  ), [page, stickerType, headerTextContent, subHeaderTextContent, footerTextContent, showBarcode, priceSource, bgImage, discountDisplayMode]);

  return (
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
      className={`relative shrink-0 cursor-pointer bg-white rounded-sm overflow-hidden outline-none ring-2 transition-shadow focus-visible:ring-sky-400 ${
        active ? 'ring-sky-600' : 'ring-slate-200 hover:ring-sky-300'
      } ${page.selected === false ? 'opacity-50' : ''}`}
    >
      <div className="pointer-events-none select-none" dangerouslySetInnerHTML={{ __html: html }} />
      <span className="absolute left-1 top-1 min-w-4 h-4 px-1 rounded-full bg-sky-600 text-white text-[10px] font-bold leading-4 text-center">
        {index + 1}
      </span>
    </div>
  );
});

/** Dải ảnh thu nhỏ bên trái bản xem trước: thấy đủ mọi sticker trong danh sách, bấm vào ảnh để mở và sửa. */
export const StickerQueueStrip: React.FC<StickerQueueStripProps> = ({ pages, activeId, onSelect, ...rest }) => {
  if (pages.length === 0) return null;
  return (
    <div
      data-testid="sticker-strip"
      aria-label="Các sticker trong danh sách"
      className="no-print hidden lg:flex flex-col gap-2.5 shrink-0 w-[112px] lg:h-[max(556px,82%)] overflow-y-auto p-1 scrollbar-thin"
    >
      {pages.slice(0, MAX_THUMBNAILS).map((page, index) => (
        <Thumbnail
          key={page.id}
          page={page}
          index={index}
          active={page.id === activeId}
          onSelect={onSelect}
          {...rest}
        />
      ))}
      {pages.length > MAX_THUMBNAILS && (
        <p className="text-[11px] text-slate-500 text-center">Còn {pages.length - MAX_THUMBNAILS} sticker, xem ở tab D.Sách</p>
      )}
    </div>
  );
};
