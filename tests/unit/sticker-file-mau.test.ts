import { describe, expect, it } from 'vitest';
import {
  TEMPLATE_HEADERS,
  mergeTemplateImport,
  parseLayout,
  parseStickerTemplate,
  templateSheets,
} from '../../src/features/sticker-event/services/stickerTemplate';
import { groupByLayout } from '../../src/features/sticker-event/services/tagLayouts';
import { scopedKey } from '../../src/features/sticker-event/services/scope';
import { APP_DATA_KEYS, SETTING_KEYS } from '../../src/platform/backupFormat';
import type { Product } from '../../src/features/sticker-event/types';

const header = [...TEMPLATE_HEADERS];
const money = (value: string) => value.replace(/\s/g, ' ');

describe('File mẫu tab Sticker', () => {
  it('đọc đủ cột, giá định dạng như bảng giá, số lượng và bố cục theo từng dòng', () => {
    const { products, errors, fatal } = parseStickerTemplate([
      header,
      ['2714133000100', 'Nồi cơm Toshiba', 2500000, 2045000, 'Trả chậm 0%', 2, 4],
      [4844099000052, 'Nồi chiên Sunhouse', '2.900.000', '2.390.000', '', '', ''],
      ['A1', 'Bình giữ nhiệt', '', 290000, '', 3, '24/trang'],
    ]);
    expect(fatal).toBeUndefined();
    expect(errors).toEqual([]);
    expect(products.map((p) => [p.msp, p.sanPham, p.quantity, p.layout])).toEqual([
      ['2714133000100', 'Nồi cơm Toshiba', 2, 4],
      ['4844099000052', 'Nồi chiên Sunhouse', 1, 4],
      ['A1', 'Bình giữ nhiệt', 3, 24],
    ]);
    expect(money(products[0].giaGiam)).toBe('2.045.000 ₫');
    expect(money(products[1].giaGoc)).toBe('2.900.000 ₫');
    expect(products[0].khuyenMai).toBe('Trả chậm 0%');
    // Không có giá gốc thì tem không có giá gạch; tab Sticker không có thưởng
    expect(products[2].giaGoc).toBe('');
    expect(products.every((p) => p.tongThuong === 0 && p.thuongERP === 0 && p.thuongNong === 0)).toBe(true);
  });

  it('bỏ qua dòng lỗi, báo đúng số dòng Excel và lý do; dòng trống không tính', () => {
    const { products, errors } = parseStickerTemplate([
      ['Danh sách in tuần này'],
      header,
      ['', 'Thiếu mã', 100000, 90000, '', 1, 4],
      [],
      ['B2', '', 100000, 0, '', 'hai', 3],
      ['B3', 'Đúng', 100000, 90000, '', 1, 8],
    ]);
    expect(products.map((p) => p.msp)).toEqual(['B3']);
    expect(errors).toEqual([
      'Dòng 3: thiếu mã sản phẩm',
      'Dòng 5: thiếu tên sản phẩm, thiếu giá bán, số lượng tem "hai" không hợp lệ, bố cục "3" không hợp lệ, chỉ dùng 1, 2, 4, 8, 16, 24',
    ]);
  });

  it('nhận tiêu đề viết khác (không dấu, chữ hoa) và báo lỗi khi không có dòng tiêu đề', () => {
    const { products } = parseStickerTemplate([
      ['MA SP', 'TEN SAN PHAM', 'GIA BAN', 'BO CUC'],
      ['C1', 'Quạt', 990000, 2],
    ]);
    expect(products.map((p) => [p.msp, p.layout, p.giaGoc])).toEqual([['C1', 2, '']]);
    expect(parseStickerTemplate([['x', 'y'], [1, 2]]).fatal).toMatch(/Tải file mẫu/);
  });

  it('trùng mã trong cùng file thì dòng sau thay dòng trước', () => {
    const { products } = parseStickerTemplate([header, ['D1', 'Cũ', 0, 100000, '', 1, 4], ['D1', 'Mới', 0, 200000, '', 5, 16]]);
    expect(products).toHaveLength(1);
    expect([products[0].sanPham, products[0].quantity, products[0].layout]).toEqual(['Mới', 5, 16]);
  });

  it('đọc bố cục: số, chữ có số, trống là 4, số lạ là lỗi', () => {
    expect(parseLayout(1)).toBe(1);
    expect(parseLayout('16 sticker/trang')).toBe(16);
    expect(parseLayout('')).toBe(4);
    expect(parseLayout(80)).toBeNull();
    expect(parseLayout('ba')).toBeNull();
  });

  it('file tải về đọc lại được đúng các dòng ví dụ', () => {
    const { products, errors } = parseStickerTemplate(templateSheets().products);
    expect(errors).toEqual([]);
    expect(products.map((p) => p.layout)).toEqual([4, 4, 1, 24]);
  });
});

const product = (msp: string, extra: Partial<Product> = {}): Product => ({
  msp, sanPham: `SP ${msp}`, giaGoc: '', giaGiam: '100.000 ₫', khuyenMai: '', thuongERP: 0, thuongNong: 0, tongThuong: 0,
  ngayIn: '', selected: false, quantity: 1, layout: 4, ...extra,
});

describe('Nhập thêm file mẫu', () => {
  it('mã trùng lấy theo file mới, giữ dấu chọn; mã mới thêm cuối; nhập lại không tăng số tem', () => {
    const catalog = [product('A'), product('B')];
    const displayed = [product('A', { selected: true, quantity: 2 })];
    const imported = [product('A', { sanPham: 'A mới', quantity: 5, layout: 1 }), product('C')];
    const first = mergeTemplateImport(catalog, displayed, imported);
    expect(first.catalog.map((p) => p.msp)).toEqual(['B', 'A', 'C']);
    expect(first.displayed.map((p) => [p.msp, p.sanPham, p.quantity, p.layout, p.selected])).toEqual([
      ['A', 'A mới', 5, 1, true],
      ['C', 'SP C', 1, 4, false],
    ]);
    expect([first.added, first.updated]).toEqual([1, 1]);

    const again = mergeTemplateImport(first.catalog, first.displayed, imported);
    expect(again.displayed.map((p) => [p.msp, p.quantity])).toEqual([['A', 5], ['C', 1]]);
    expect([again.added, again.updated]).toEqual([0, 2]);
  });
});

describe('Chia lượt in theo bố cục', () => {
  it('bố cục ít sticker/trang trước, giữ thứ tự trong nhóm, không có bố cục thì là 4', () => {
    const groups = groupByLayout([
      product('A', { layout: 24 }), product('B', { layout: undefined }), product('C', { layout: 1 }), product('D', { layout: 24 }), product('E', { layout: 4 }),
    ]);
    expect(groups.map((g) => [g.layout, g.items.map((p) => p.msp)])).toEqual([
      [1, ['C']],
      [4, ['B', 'E']],
      [24, ['A', 'D']],
    ]);
  });
});

describe('Dữ liệu tab Sticker lưu riêng', () => {
  it('tab Event giữ khoá cũ, tab Sticker có khoá riêng và đều được sao lưu', () => {
    expect(scopedKey('event', 'displayedProducts')).toBe('displayedProducts');
    expect(scopedKey('sticker', 'displayedProducts')).toBe('sticker.displayedProducts');
    for (const key of ['products', 'fileInfo', 'displayedProducts', 'manualProducts']) {
      expect(APP_DATA_KEYS).toContain(scopedKey('sticker', key));
    }
    expect(SETTING_KEYS).toContain('stickerTagSavedLists');
  });
});
