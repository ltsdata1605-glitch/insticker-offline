import { describe, expect, it } from 'vitest';
import { hashTabPassword, isStickerModuleVisible, normalizeHiddenTabs, resolveVisibleSub } from '../../src/features/sticker-event/tabAccess';

/** Bảng bật tắt tab: chuyển tab khi tab đang mở bị tắt, và mật khẩu chỉ lưu dạng băm. */
describe('Tab đang mở bị tắt', () => {
  it('tab còn bật thì giữ nguyên', () => {
    expect(resolveVisibleSub('sticker', ['gia-soc'])).toBe('sticker');
    expect(resolveVisibleSub('event', ['gia-soc', 'gio-vang', 'sticker', 'draw'])).toBe('event');
  });

  it('chuyển sang tab bật đầu tiên theo thứ tự trên thanh chọn', () => {
    expect(resolveVisibleSub('gia-soc', ['gia-soc'])).toBe('gio-vang');
    expect(resolveVisibleSub('draw', ['gia-soc', 'draw'])).toBe('gio-vang');
    expect(resolveVisibleSub('gio-vang', ['gia-soc', 'gio-vang'])).toBe('sticker');
  });

  it('tắt cả bốn tab thì về Event', () => {
    expect(resolveVisibleSub('sticker', ['gia-soc', 'gio-vang', 'sticker', 'draw'])).toBe('event');
  });
});

describe('Mật khẩu', () => {
  it('cùng mật khẩu và muối thì cùng kết quả; khác muối thì khác; không chứa mật khẩu gốc', async () => {
    const a = await hashTabPassword('12345', 'muoi-1');
    expect(a).toBe(await hashTabPassword('12345', 'muoi-1'));
    expect(a).not.toBe(await hashTabPassword('12345', 'muoi-2'));
    expect(a).not.toBe(await hashTabPassword('12346', 'muoi-1'));
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toContain('12345');
  });
});

describe('Danh sách tab tắt đã lưu', () => {
  it('chưa từng chỉnh thì tắt Event', () => {
    expect(normalizeHiddenTabs(undefined)).toEqual(['event']);
    expect(normalizeHiddenTabs('hỏng')).toEqual(['event']);
  });

  it('giữ đúng thứ tự, bỏ tên lạ', () => {
    expect(normalizeHiddenTabs(['draw', 'la', 'gia-soc'])).toEqual(['gia-soc', 'draw']);
    expect(normalizeHiddenTabs([])).toEqual([]);
  });

  it('không bao giờ tắt hết: còn lại Giá Sốc', () => {
    expect(normalizeHiddenTabs(['gia-soc', 'gio-vang', 'sticker', 'draw', 'event', 'kiem-hang']))
      .toEqual(['gio-vang', 'sticker', 'draw', 'event', 'kiem-hang']);
  });

  it('tắt hết các tab In sticker vẫn được khi còn Kiểm hàng', () => {
    const hidden = normalizeHiddenTabs(['gia-soc', 'gio-vang', 'sticker', 'draw', 'event']);
    expect(hidden).toEqual(['gia-soc', 'gio-vang', 'sticker', 'draw', 'event']);
    expect(isStickerModuleVisible(hidden)).toBe(false);
    expect(isStickerModuleVisible(['event'])).toBe(true);
  });
});
