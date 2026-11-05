/** Các ô chỉnh được cỡ chữ trên bản xem trước. */
export type StickerFieldName =
  | 'header' | 'subHeader' | 'percent' | 'oldPrice' | 'name' | 'newPrice' | 'footer'
  | 'drawTitle' | 'drawContentTopLeft' | 'drawContentTopRight' | 'drawContentBottomLeft'
  | 'drawContentBottomRight' | 'drawContentBottomRightSub' | 'drawCode' | 'drawFooter';

/** Cỡ chữ mặc định của cả ô, đơn vị cqw. */
export const DEFAULT_FIELD_SIZES: Record<StickerFieldName, number> = {
  header: 8,
  subHeader: 13,
  percent: 36.9,
  oldPrice: 14.2,
  name: 3.6,
  newPrice: 26.5,
  footer: 3.2,
  drawTitle: 4.3,
  drawContentTopLeft: 4.5,
  drawContentTopRight: 8,
  drawContentBottomLeft: 2.9,
  drawContentBottomRight: 7.6,
  drawContentBottomRightSub: 3,
  drawCode: 3.8,
  drawFooter: 3.8,
};

export const TEM_FIELDS: StickerFieldName[] = ['header', 'subHeader', 'percent', 'oldPrice', 'name', 'newPrice', 'footer'];
export const DRAW_FIELDS: StickerFieldName[] = [
  'drawTitle', 'drawContentTopLeft', 'drawContentTopRight', 'drawContentBottomLeft',
  'drawContentBottomRight', 'drawContentBottomRightSub', 'drawCode', 'drawFooter',
];

const FIELD_BY_CLASS: Record<string, StickerFieldName> = {
  'header-text': 'header',
  'sub-header': 'subHeader',
  extra1: 'percent',
  old: 'oldPrice',
  name: 'name',
  extra2: 'newPrice',
  'footer-text': 'footer',
  'input-title-single': 'drawTitle',
  'input-content-top-left': 'drawContentTopLeft',
  'input-content-top-right': 'drawContentTopRight',
  'input-content-bottom-left': 'drawContentBottomLeft',
  'input-content-bottom-right': 'drawContentBottomRight',
  'input-content-bottom-right-sub': 'drawContentBottomRightSub',
  'input-code-left': 'drawCode',
  'input-footer-left': 'drawFooter',
};

export const detectFieldName = (el: Element | null): StickerFieldName | undefined => {
  if (!el) return undefined;
  for (const className of el.classList) {
    const field = FIELD_BY_CLASS[className];
    if (field) return field;
  }
  return undefined;
};

/** Thanh định dạng báo đổi cỡ chữ của cả ô để lưu vào trạng thái, nhờ vậy bản in và lần mở sau cũng nhận. */
export const FIELD_SIZE_EVENT = 'sticker-field-size-change';
export interface FieldSizeChange {
  field: StickerFieldName;
  size: number;
}

export const isDrawField = (field: StickerFieldName | undefined): boolean => Boolean(field?.startsWith('draw'));

/**
 * Mẫu phiếu đặt cỡ chữ và khoảng dòng riêng cho từng dòng ngay trong nội dung ô, phải khớp DEFAULT_DRAW_TICKET_TEMPLATE.
 * Ô có nhiều dòng hơn thì các dòng sau lấy theo dòng cuối của bảng.
 */
const DRAW_LINE_DEFAULTS: Partial<Record<StickerFieldName, { fontSize: string; lineHeight: string }[]>> = {
  drawContentTopLeft: [{ fontSize: '4.5cqw', lineHeight: '1.1' }, { fontSize: '3.5cqw', lineHeight: '1.1' }],
  drawContentTopRight: [{ fontSize: '8cqw', lineHeight: '1.5' }],
  drawContentBottomLeft: [{ fontSize: '2.9cqw', lineHeight: '1.4' }],
  drawContentBottomRight: [{ fontSize: '7.6cqw', lineHeight: '1.2' }],
  drawContentBottomRightSub: [{ fontSize: '3cqw', lineHeight: '1.4' }],
};

/** Bỏ mọi cỡ chữ và khoảng dòng đã chỉnh trong ô, giữ nguyên chữ, đậm nghiêng và phông. */
export const resetFieldFormatting = (root: HTMLElement, field: StickerFieldName | undefined): void => {
  root.style.removeProperty('line-height');
  root.querySelectorAll<HTMLElement>('[style]').forEach((el) => {
    el.style.removeProperty('font-size');
    el.style.removeProperty('line-height');
    if (el.style.fontFamily === 'inherit') el.style.removeProperty('font-family');
    if (!el.getAttribute('style')) el.removeAttribute('style');
  });
  // Thẻ span không còn định dạng gì thì gỡ bỏ, chữ bên trong giữ nguyên
  root.querySelectorAll('span:not([style]):not([class])').forEach((span) => span.replaceWith(...span.childNodes));
  root.normalize();

  const lines = field ? DRAW_LINE_DEFAULTS[field] : undefined;
  if (!lines) return;
  [...root.children].filter((child): child is HTMLElement => child.tagName === 'DIV').forEach((div, index) => {
    const line = lines[Math.min(index, lines.length - 1)];
    div.style.fontSize = line.fontSize;
    div.style.lineHeight = line.lineHeight;
  });
};

/** Như resetFieldFormatting nhưng làm trên nội dung lưu trong trạng thái, dùng khi ô đó không nằm trên trang đang xem. */
export const resetFieldHtml = (html: string, field: StickerFieldName): string => {
  const holder = document.createElement('div');
  holder.innerHTML = html;
  resetFieldFormatting(holder, field);
  return holder.innerHTML;
};
