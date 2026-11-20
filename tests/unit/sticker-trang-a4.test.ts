import { describe, expect, it } from 'vitest';
import { buildStickerSheets, normalizeStickersPerPage, STICKER_SHEET_LAYOUTS, stickerSizeMm } from '../../src/features/sticker-event/stickerprinter/stickerSheets';

/** Giá Sốc, Giờ Vàng: xếp nhiều sticker trên một tờ A4. */
const sticker = (n: number) => `<div class="sticker-container" data-type="gia_soc">${n}</div>`;
const stickers = Array.from({ length: 5 }, (_, i) => sticker(i + 1));

describe('Số sticker trên 1 trang A4', () => {
  it('1 sticker mỗi trang giữ nguyên bản in cũ: không gói theo tờ, không thêm CSS, A4 dọc', () => {
    expect(buildStickerSheets(stickers, 1)).toEqual({ html: stickers.join(''), css: '', landscape: false });
  });

  it('gói đủ số sticker mỗi tờ, tờ cuối có phần còn lại', () => {
    const { html, landscape } = buildStickerSheets(stickers, 4);
    const sheets = html.split('<div class="sticker-sheet">').slice(1);
    expect(sheets).toHaveLength(2);
    expect(sheets[0].match(/sticker-container/g)).toHaveLength(4);
    expect(sheets[1].match(/sticker-container/g)).toHaveLength(1);
    expect(landscape).toBe(false);
  });

  it('2 và 8 sticker đặt tờ ngang, 4 và 16 đặt tờ dọc', () => {
    expect(buildStickerSheets(stickers, 2).landscape).toBe(true);
    expect(buildStickerSheets(stickers, 8).landscape).toBe(true);
    expect(buildStickerSheets(stickers, 16).landscape).toBe(false);
    expect(buildStickerSheets(stickers, 2).css).toContain('size: A4 landscape');
    expect(buildStickerSheets(stickers, 2).css).toContain('width: 297mm');
  });

  it('sticker giữ đúng tỉ lệ và vừa trong tờ A4 trừ lề', () => {
    for (const layout of STICKER_SHEET_LAYOUTS.filter(l => l.perPage > 1)) {
      const { width, height } = stickerSizeMm(layout);
      const [pageWidth, pageHeight] = layout.landscape ? [297, 210] : [210, 297];
      expect(width / height, `${layout.perPage}`).toBeCloseTo(197 / 285, 2);
      expect(width * layout.cols, `${layout.perPage}`).toBeLessThanOrEqual(pageWidth - 10);
      expect(height * layout.rows, `${layout.perPage}`).toBeLessThanOrEqual(pageHeight - 10);
    }
    expect(stickerSizeMm(STICKER_SHEET_LAYOUTS[2])).toEqual({ width: 97.81, height: 141.5 });
  });

  it('giá trị đã lưu không hợp lệ thì về 1 sticker mỗi trang', () => {
    expect(normalizeStickersPerPage(8)).toBe(8);
    expect(normalizeStickersPerPage(24)).toBe(1);
    expect(normalizeStickersPerPage(undefined)).toBe(1);
    expect(normalizeStickersPerPage('4')).toBe(1);
  });
});
