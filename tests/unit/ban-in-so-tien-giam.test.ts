import { describe, expect, it } from 'vitest';
import { generatePageHtml } from '../../src/features/sticker-event/stickerprinter/pageHtmlUtils';
import type { StickerPage } from '../../src/features/sticker-event/stickerprinter/types';

const trang = (oldPrice: string, newPrice: string, percent = ''): StickerPage => ({
  id: 't1', html: '', label: 'Quạt điều hoà', oldPrice, newPrice, percent, timestamp: 0, header: 'TIÊU ĐỀ', footer: 'KM',
});

const inTem = (page: StickerPage, mode: 'percent' | 'amount') =>
  generatePageHtml(page, 'sale', 'gia_soc', '/frame/X24_NEW.png', mode);

describe('Ô giảm giá trên bản in khớp khung xem trước', () => {
  it('giảm từ 1 triệu trở lên in theo đơn vị triệu, không còn kiểu -2.000K', () => {
    const html = inTem(trang('5.490.000', '3.490'), 'amount');
    expect(html).toContain('<span class="discount-num">2</span>');
    expect(html).toContain('<span class="discount-unit unit-trieu">triệu</span>');
    expect(html).not.toContain('2.000K');
  });

  it('giảm dưới 1 triệu in theo đơn vị K', () => {
    const html = inTem(trang('1.290.000', '990'), 'amount');
    expect(html).toContain('<span class="discount-num">300</span>');
    expect(html).toContain('<span class="discount-unit unit-k">K</span>');
  });

  it('không giảm thì giữ nguyên chữ phần trăm đang có', () => {
    const html = inTem(trang('1.000.000', '1.000', '0%'), 'amount');
    expect(html).toContain('<div class="extra1">0%</div>');
  });

  it('chế độ phần trăm không đổi', () => {
    const html = inTem(trang('5.490.000', '3.490', '-36%'), 'percent');
    expect(html).toContain('<div class="extra1">-36%</div>');
  });
});
