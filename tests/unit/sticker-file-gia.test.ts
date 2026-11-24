import { describe, expect, it } from 'vitest';
import { looksLikeErpPriceSheet, parseErpPriceRows } from '../../src/features/sticker-event/services/erpPriceRows';
import { erpStickerPrices, mergeErpProductsIntoPages } from '../../src/features/sticker-event/stickerprinter/erpStickerImport';
import { matchesSticker } from '../../src/features/sticker-event/stickerprinter/listSearch';
import { stickerPageToTagProduct } from '../../src/features/sticker-event/stickerprinter/tagProducts';
import type { StickerPage } from '../../src/features/sticker-event/stickerprinter/types';
import type { Product } from '../../src/features/sticker-event/types';

/** Một dòng bảng giá ERP mẫu 81 như bài test giao diện: tên cột A, giá gốc E, giá giảm F, khuyến mãi H, ngày in, mã thưởng, mã sản phẩm. */
const erpRow = (msp: string, name: string, goc: number | string, giam: number | string, khuyenMai = '') => {
  const row: unknown[] = Array.from({ length: 33 }, () => '');
  row[0] = name;
  row[4] = goc;
  row[5] = giam;
  row[7] = khuyenMai;
  row[30] = 'Ngày in: 04/11/2026';
  row[31] = '40A';
  row[32] = msp;
  return row;
};

const product = (msp: string, giaGoc: string, giaGiam: string, extra: Partial<Product> = {}): Product => ({
  msp, sanPham: `SP ${msp}`, giaGoc, giaGiam, khuyenMai: '', ngayIn: '', thuongERP: 0, thuongNong: 0, tongThuong: 0, selected: false, quantity: 1, ...extra,
});

const context = { header: 'SẢN PHẨM GIÁ SỐC', subHeader: '', discountThreshold: '', now: 1 };

describe('Tab Sticker nhập file bảng giá ERP của tab Event', () => {
  it('nhận ra file bảng giá ERP, không nhầm với file mẫu sticker', () => {
    expect(looksLikeErpPriceSheet([erpRow('1751099000213', 'Máy giặt Aqua', 9490000, 3000000)])).toBe(true);
    // Bảng giá thật có vài dòng tiêu đề trước khi tới sản phẩm
    expect(looksLikeErpPriceSheet([['BẢNG GIÁ'], [], erpRow('1', 'A', 1, 1)])).toBe(true);
    expect(looksLikeErpPriceSheet([
      ['TIÊU ĐỀ', 'CODE', 'TÊN SẢN PHẨM', 'GIÁ GỐC', 'GIÁ GIẢM', 'KHUYẾN MÃI', 'SỐ BẢN IN'],
      ['QUẠT', 'ABC123', 'Quạt điều hoà', '5490000', '3490000', '', '1'],
    ])).toBe(false);
    expect(looksLikeErpPriceSheet([['ABC123', 'Quạt điều hoà', '5490000', '3490000']])).toBe(false);
  });

  it('đọc dòng bảng giá như tab Event', () => {
    const { products, exportDate } = parseErpPriceRows([
      erpRow('1751099000213', 'Máy giặt Aqua AW11-BP4657M B', 9490000, 3000000, 'DUY NHẤT CHỈ CÓ 1 SUẤT'),
      erpRow('', 'Dòng không có mã', 100000, 90000),
    ]);
    expect(exportDate).toBe('Ngày in: 04/11/2026');
    expect(products).toHaveLength(1);
    expect(products[0]).toMatchObject({ msp: '1751099000213', sanPham: 'Máy giặt Aqua AW11-BP4657M B', khuyenMai: 'DUY NHẤT CHỈ CÓ 1 SUẤT' });
  });

  it('giá trên sticker: giá mới theo nghìn đồng, chỉ có giá cũ khi giảm, tem in đúng giá như tab Event', () => {
    const cases: [string, string, { oldPrice: string; newPrice: string; percent: string }, number, number][] = [
      ['9.490.000 ₫', '3.000.000 ₫', { oldPrice: '9.490.000', newPrice: '3.000', percent: '-68%' }, 9490000, 3000000],
      // Không giảm: không gạch giá cũ
      ['490.000 ₫', '490.000 ₫', { oldPrice: '', newPrice: '490', percent: '' }, 0, 490000],
      ['490.000 ₫', '0 ₫', { oldPrice: '', newPrice: '490', percent: '' }, 0, 490000],
      // Từ 100 triệu không giảm: giá cũ bằng giá bán để không bị hiểu nhầm là 120.000 đồng; tem không gạch vì hai giá bằng nhau
      ['120.000.000 ₫', '120.000.000 ₫', { oldPrice: '120.000.000', newPrice: '120.000', percent: '' }, 120000000, 120000000],
    ];
    for (const [giaGoc, giaGiam, expected, tagOld, tagSale] of cases) {
      const prices = erpStickerPrices({ giaGoc, giaGiam });
      expect(prices).toEqual(expected);
      const page: StickerPage = { id: 'x', html: '', label: 'SP', timestamp: 0, ...prices, salePrice: prices.newPrice };
      const tag = stickerPageToTagProduct(page, 'sale');
      expect(Number(tag.giaGiam.replace(/\D/g, ''))).toBe(tagSale);
      expect(Number(tag.giaGoc.replace(/\D/g, '')) || 0).toBe(tagOld);
    }
  });

  it('mỗi sản phẩm thành một sticker; mã đã có thì cập nhật giá, giữ số bản in; mã trùng trong file lấy dòng sau', () => {
    const existing: StickerPage[] = [{
      id: 'cu', html: '', label: 'Tên cũ', code: '2', oldPrice: '200.000', newPrice: '150', salePrice: '150', servicePrice: '140',
      percent: '-25%', timestamp: 0, quantity: 3, selected: true, footer: 'KM cũ',
    }];
    const { pages, added, updated } = mergeErpProductsIntoPages(existing, [
      product('1', '1.000.000 ₫', '800.000 ₫', { khuyenMai: 'Tặng quạt' }),
      product('2', '200.000 ₫', '100.000 ₫'),
      product('1', '1.000.000 ₫', '700.000 ₫', { khuyenMai: 'Tặng nồi' }),
    ], context);

    expect(updated).toBe(1);
    expect(added).toHaveLength(1);
    expect(pages.map((page) => page.code)).toEqual(['2', '1']);
    expect(pages[0]).toMatchObject({ id: 'cu', label: 'SP 2', oldPrice: '200.000', newPrice: '100', salePrice: '100', quantity: 3, selected: true, footer: '' });
    expect(pages[0].servicePrice).toBeUndefined();
    expect(pages[1]).toMatchObject({
      label: 'SP 1', code: '1', oldPrice: '1.000.000', newPrice: '700', percent: '-30%', footer: 'Tặng nồi', quantity: 1, selected: true, html: '',
      header: 'SẢN PHẨM GIÁ SỐC',
    });
  });

  it('ngưỡng % giảm chọn sẵn sticker như khi nhập file mẫu', () => {
    const { added } = mergeErpProductsIntoPages([], [product('1', '1.000.000 ₫', '500.000 ₫'), product('2', '1.000.000 ₫', '950.000 ₫')], { ...context, discountThreshold: '10%' });
    expect(added.map((page) => page.selected)).toEqual([true, false]);
  });
});

describe('Ô tìm sticker trong danh sách', () => {
  const page = { label: 'Máy giặt Aqua AW11-BP4657M B', code: '1751099000213' };
  it('tìm theo tên không dấu, theo mã, nhiều từ', () => {
    expect(matchesSticker(page, '')).toBe(true);
    expect(matchesSticker(page, 'may giat')).toBe(true);
    expect(matchesSticker(page, 'MÁY GIẶT aqua')).toBe(true);
    expect(matchesSticker(page, '000213')).toBe(true);
    expect(matchesSticker(page, 'aqua 000213')).toBe(true);
    expect(matchesSticker(page, 'tủ lạnh')).toBe(false);
  });
});
