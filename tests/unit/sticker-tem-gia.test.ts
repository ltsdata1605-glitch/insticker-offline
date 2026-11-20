import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/components/shared/ui/toast', () => ({ toast: { info: vi.fn(), error: vi.fn() } }));

import { ghostTagPreview, stickerPageToTagProduct } from '../../src/features/sticker-event/stickerprinter/tagProducts';
import { DEFAULT_PRINT_SETTINGS, cutLinesHtml, generatePriceTagHTML, restorePrintSettings } from '../../src/features/sticker-event/services/printService';
import type { StickerPage } from '../../src/features/sticker-event/stickerprinter/types';
import { canvasTagCss } from '../../src/features/sticker-event/services/canvasTagStyles';

/** Tab Sticker soạn sticker như Giá Sốc nhưng in tem giá của tab Event: kiểm tra phần đổi sticker sang tem. */
const page = (fields: Partial<StickerPage>): StickerPage => ({
  id: 'p1', html: '', label: 'Quạt điều hoà Daikiosan DMI03', oldPrice: '5.490.000', newPrice: '3.490', percent: '-36%',
  timestamp: 0, footer: 'Khuyến mãi áp dụng đến hết ngày 3/5/2026', ...fields,
});
const money = (value: string) => value.replace(/\s/g, ' ');

describe('Sticker Giá Sốc sang tem giá', () => {
  it('giá mới ghi theo nghìn đồng được đổi ra đủ số, chân sticker thành dòng khuyến mãi', () => {
    const product = stickerPageToTagProduct(page({}), 'sale');
    expect(product.sanPham).toBe('Quạt điều hoà Daikiosan DMI03');
    expect(money(product.giaGoc)).toBe('5.490.000 ₫');
    expect(money(product.giaGiam)).toBe('3.490.000 ₫');
    expect(product.khuyenMai).toBe('Khuyến mãi áp dụng đến hết ngày 3/5/2026');
    expect(product.msp).toBe('');
    expect(product.quantity).toBe(1);
    expect(product.tongThuong).toBe(0);
  });

  it('giá mới gõ đủ số thì giữ nguyên', () => {
    expect(money(stickerPageToTagProduct(page({ newPrice: '3490000' }), 'sale').giaGiam)).toBe('3.490.000 ₫');
  });

  it('không có giá cũ thì giá mới vẫn tính theo nghìn đồng và không có giá gốc', () => {
    const product = stickerPageToTagProduct(page({ oldPrice: '', newPrice: '990' }), 'sale');
    expect(money(product.giaGiam)).toBe('990.000 ₫');
    expect(product.giaGoc).toBe('');
  });

  it('không có giá cũ mà giá mới gõ đủ số thì giữ nguyên', () => {
    expect(money(stickerPageToTagProduct(page({ oldPrice: '', newPrice: '3490000' }), 'sale').giaGiam)).toBe('3.490.000 ₫');
  });

  it('không có giá mới thì in giá cũ làm giá bán', () => {
    const product = stickerPageToTagProduct(page({ newPrice: '' }), 'sale');
    expect(money(product.giaGiam)).toBe('5.490.000 ₫');
  });

  it('theo nguồn giá đang chọn: giá dịch vụ hoặc giá bán', () => {
    const erp = page({ newPrice: '3.490', salePrice: '3.290', servicePrice: '3.190' });
    expect(money(stickerPageToTagProduct(erp, 'sale').giaGiam)).toBe('3.290.000 ₫');
    expect(money(stickerPageToTagProduct(erp, 'service').giaGiam)).toBe('3.190.000 ₫');
  });

  it('số bản in của sticker thành số tem in; không có hoặc sai thì 1 bản', () => {
    expect(stickerPageToTagProduct(page({ quantity: 4 }), 'sale').quantity).toBe(4);
    expect(stickerPageToTagProduct(page({}), 'sale').quantity).toBe(1);
    expect(stickerPageToTagProduct(page({ quantity: 0 }), 'sale').quantity).toBe(1);
  });

  it('mã vạch của sticker thành mã QR của tem', () => {
    expect(stickerPageToTagProduct(page({ code: ' 123456 ' }), 'sale').msp).toBe('123456');
  });
});

describe('Tem không có mã', () => {
  const product = stickerPageToTagProduct(page({}), 'sale');
  for (const stickerStyle of ['default', 'modern'] as const) {
    it(`${stickerStyle}: không in ô ảnh QR rỗng`, () => {
      const html = generatePriceTagHTML(product, '', { ...DEFAULT_PRINT_SETTINGS, stickerStyle, showBonus: false }, '');
      expect(html).not.toMatch(/<img[^>]*(qr-code|alt="QR")/);
      expect(html).toContain('Quạt điều hoà Daikiosan DMI03');
    });
    it(`${stickerStyle}: có mã thì vẫn in QR`, () => {
      const html = generatePriceTagHTML(product, '', { ...DEFAULT_PRINT_SETTINGS, stickerStyle }, 'data:image/png;base64,AAAA');
      expect(html).toContain('data:image/png;base64,AAAA');
    });
  }
});

describe('Cài đặt tem đã lưu', () => {
  it('giữ kiểu tem, phông và rút gọn giá; bản trả về không dùng chung với bản mặc định', () => {
    const restored = restorePrintSettings({ stickerStyle: 'modern', shortenPrice: false, customFontName: 'Oswald', showQrCode: false });
    expect(restored.stickerStyle).toBe('modern');
    expect(restored.shortenPrice).toBe(false);
    expect(restored.customFontName).toBe('Oswald');
    expect(restored.showQrCode).toBe(true);
    const empty = restorePrintSettings(null);
    empty.stickerStyle = 'modern';
    expect(DEFAULT_PRINT_SETTINGS.stickerStyle).toBe('default');
  });
});

describe('Khung xương mờ của sticker đang soạn', () => {
  const blank = page({ label: '', oldPrice: '', newPrice: '', footer: '', code: '' });

  it('đủ mọi ô thì không có khung xương', () => {
    expect(ghostTagPreview(page({ code: 'A1' }), 'sale')).toBeNull();
  });

  it('ô trống lấy nội dung mẫu, hai bản mẫu khác nhau ở mọi ô', () => {
    const ghost = ghostTagPreview(blank, 'sale')!;
    expect(ghost.product.sanPham).toBe('Tên sản phẩm');
    expect(money(ghost.product.giaGoc)).toBe('5.490.000 ₫');
    expect(money(ghost.product.giaGiam)).toBe('3.490.000 ₫');
    for (const key of ['sanPham', 'giaGoc', 'giaGiam', 'khuyenMai', 'msp'] as const) {
      expect(ghost.product[key], key).not.toBe(ghost.alternative[key]);
    }
  });

  it('ô đã nhập giữ nguyên ở cả hai bản', () => {
    const ghost = ghostTagPreview(page({ label: 'Nồi cơm', newPrice: '', code: '' }), 'sale')!;
    expect(ghost.product.sanPham).toBe('Nồi cơm');
    expect(ghost.alternative.sanPham).toBe('Nồi cơm');
    expect(money(ghost.product.giaGoc)).toBe('5.490.000 ₫');
    expect(ghost.alternative.giaGoc).toBe(ghost.product.giaGoc);
  });
});

describe('Kiểu giá to và kiểu phiếu giảm giá', () => {
  const product = { ...stickerPageToTagProduct(page({ code: 'A1' }), 'sale'), msp: 'A1' };
  type CanvasStyle = 'big' | 'coupon';
  const settings = (stickerStyle: CanvasStyle, extra: Partial<typeof DEFAULT_PRINT_SETTINGS> = {}) =>
    ({ ...DEFAULT_PRINT_SETTINGS, stickerStyle, showBonus: false, ...extra });
  const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

  for (const style of ['big', 'coupon'] as const) {
    it(`${style}: in đủ giá gốc gạch ngang, giá mới, tiết kiệm, % giảm, tên, khuyến mãi`, () => {
      const html = generatePriceTagHTML(product, '', settings(style), 'data:image/png;base64,AAAA');
      const plain = text(html);
      expect(html).toContain(`style-${style}`);
      expect(plain).toContain('5.490.000đ');
      expect(plain).toContain('3.490');
      expect(plain).toContain('.000đ');
      expect(plain).toContain('36%');
      // In trắng đen: không có nền đen hay mảng tô
      expect(html).not.toMatch(/background(-color)?:\s*#000/);
      expect(plain).toContain('Quạt điều hoà Daikiosan DMI03');
      expect(plain).toContain('Khuyến mãi áp dụng đến hết ngày 3/5/2026');
      expect(html).toContain('data:image/png;base64,AAAA');
    });

    it(`${style}: không có giá gốc thì không in giá gạch và tiết kiệm; không có mã thì không có ô QR`, () => {
      const noOld = stickerPageToTagProduct(page({ oldPrice: '', newPrice: '590' }), 'sale');
      const html = generatePriceTagHTML(noOld, '', settings(style), '');
      expect(html).not.toContain('class="ct-old');
      expect(text(html)).not.toContain('TIẾT KIỆM');
      expect(html).not.toMatch(/<img[^>]*QR/);
      expect(text(html)).toContain('590');
    });

    it(`${style}: tắt khuyến mãi và giá gốc trong cài đặt thì không in`, () => {
      const html = generatePriceTagHTML(product, '', settings(style, { showPromotion: false, showOriginalPrice: false }), '');
      expect(text(html)).not.toContain('Khuyến mãi áp dụng');
      expect(text(html)).not.toContain('5.490.000đ');
    });

    it(`${style}: máy in bill thì tem cao đúng bằng khung đã thu nhỏ`, () => {
      const html = generatePriceTagHTML(product, '', settings(style, { tagsPerPage: 80 }), '');
      expect(html).toMatch(/class="price-tag canvas-tag style-[a-z]+" style="height:\d+px;min-height:0"/);
    });
  }

  it('không có nền đen ở CSS của các kiểu mới', () => {
    expect(canvasTagCss()).not.toMatch(/background(-color)?:\s*(#000|black)/);
  });

  it('kiểu đã lưu không còn hỗ trợ thì về kiểu có sẵn; các kiểu mới được giữ', () => {
    for (const style of ['big', 'coupon'] as const) expect(restorePrintSettings({ stickerStyle: style }).stickerStyle).toBe(style);
    // Các mẫu thử đã bỏ về kiểu có sẵn
    for (const removed of ['bold', 'compare', 'outline', 'burst', 'tiered', 'drop', 'ribbon', 'receipt']) {
      expect(restorePrintSettings({ stickerStyle: removed as never }).stickerStyle).toBe('default');
    }
    expect(restorePrintSettings({ stickerStyle: 'la' as never }).stickerStyle).toBe('default');
  });
});

describe('Đường cắt trên trang tem', () => {
  const lines = (html: string) => Array.from(html.matchAll(/class="cut-line cut-([vh])" style="([^"]+)"/g)).map((m) => ({ dir: m[1], style: m[2] }));
  const num = (style: string, prop: string) => Number(new RegExp(`${prop}:([\\d.]+)mm`).exec(style)?.[1]);

  it('8 tem mỗi trang, in 2 tem: ba đường dọc (hai mép và giữa hai tem), hai đường ngang', () => {
    const cut = lines(cutLinesHtml(2, { ...DEFAULT_PRINT_SETTINGS, tagsPerPage: 8 }));
    expect(cut.filter((l) => l.dir === 'v')).toHaveLength(3);
    expect(cut.filter((l) => l.dir === 'h')).toHaveLength(2);
    // Đường giữa nằm giữa khe 4 mm: lề 10 mm + một tem + 2 mm
    const middle = num(cut[1].style, 'left');
    expect(middle).toBeCloseTo(10 + (190 - 4) / 2 + 2, 1);
    expect(num(cut[0].style, 'left')).toBe(8);
  });

  it('hàng cuối thiếu tem: đường dưới và đường dọc thừa ngắn lại', () => {
    const cut = lines(cutLinesHtml(3, { ...DEFAULT_PRINT_SETTINGS, tagsPerPage: 8 }));
    const vertical = cut.filter((l) => l.dir === 'v');
    const horizontal = cut.filter((l) => l.dir === 'h');
    expect(vertical).toHaveLength(3);
    expect(horizontal).toHaveLength(3);
    expect(num(vertical[2].style, 'height')).toBeLessThan(num(vertical[0].style, 'height'));
    expect(num(horizontal[2].style, 'width')).toBeLessThan(num(horizontal[0].style, 'width'));
  });

  it('máy in bill không có đường cắt', () => {
    expect(cutLinesHtml(3, { ...DEFAULT_PRINT_SETTINGS, tagsPerPage: 80 })).toBe('');
  });
});
