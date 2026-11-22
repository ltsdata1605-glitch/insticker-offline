import { describe, expect, it } from 'vitest';
import { autoListName } from '../../src/features/sticker-event/stickerprinter/pageHtmlUtils';

describe('Tên danh sách tự đặt khi in', () => {
  it('theo tên sản phẩm: một, hai, nhiều sản phẩm; bỏ trùng, bỏ thẻ HTML', () => {
    expect(autoListName(['Quạt đứng'], 'GIÁ SỐC')).toBe('Quạt đứng');
    expect(autoListName(['Quạt đứng', 'Nồi cơm'], '')).toBe('Quạt đứng, Nồi cơm');
    expect(autoListName(['Quạt đứng', 'Nồi cơm', 'Bếp từ', 'Lò vi sóng', 'Máy xay'], '')).toBe('Quạt đứng, Nồi cơm và 3 sản phẩm khác');
    expect(autoListName(['Quạt <b>đứng</b>', 'Quạt đứng', '  '], '')).toBe('Quạt đứng');
  });

  it('không có tên sản phẩm thì lấy tiêu đề sticker; tên quá dài thì cắt nhưng giữ số sản phẩm', () => {
    expect(autoListName([], 'GIỜ VÀNG')).toBe('GIỜ VÀNG');
    expect(autoListName([''], '')).toBe('Sticker');
    const long = autoListName(['Tủ lạnh Samsung Inverter 382 lít RT38CG6584B1SV ngăn đá trên', 'Máy giặt LG 10kg', 'Quạt'], '');
    expect(long.length).toBeLessThanOrEqual(80);
    expect(long.endsWith('và 2 sản phẩm khác')).toBe(true);
  });
});
