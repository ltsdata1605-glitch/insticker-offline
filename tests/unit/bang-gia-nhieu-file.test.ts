import { describe, expect, it } from 'vitest';
import {
  LEGACY_SOURCE_ID,
  MAX_IMPORT_HISTORY,
  appendHistory,
  applyPriceImport,
  dedupeProducts,
  fileInfoFor,
  fullyOverriddenIds,
  legacySource,
  mergeSources,
  removeSources,
  summarizeSources,
} from '../../src/features/sticker-event/services/priceSources';
import type { PriceImportRecord, PriceSource } from '../../src/features/sticker-event/services/priceSources';
import type { Product } from '../../src/features/sticker-event/types';

const product = (msp: string, giaGiam = '100.000 ₫', extra: Partial<Product> = {}): Product => ({
  msp,
  sanPham: `SP ${msp}`,
  thuongERP: 0,
  thuongNong: 0,
  tongThuong: 0,
  giaGoc: '200.000 ₫',
  giaGiam,
  khuyenMai: '',
  ngayIn: '',
  selected: false,
  quantity: 1,
  ...extra,
});

const source = (id: string, products: Product[], importedAt = '2026-11-01T00:00:00.000Z'): PriceSource => ({
  id,
  fileName: `${id}.xlsx`,
  importedAt,
  exportDate: null,
  products,
});

const prices = (products: Product[]) => Object.fromEntries(products.map((p) => [p.msp, p.giaGiam]));

describe('Ghép bảng giá từ nhiều file', () => {
  it('file nhập sau ghi đè giá khi trùng mã, mã mới được thêm, mã cũ vẫn còn', () => {
    const old = source('a', [product('1', '100'), product('2', '200')]);
    const outcome = applyPriceImport([old], [source('b', [product('2', '250'), product('3', '300')])]);

    expect(prices(outcome.products)).toEqual({ 1: '100', 2: '250', 3: '300' });
    // Mã giữ thứ tự lần đầu xuất hiện để thứ tự gợi ý không nhảy lung tung
    expect(outcome.products.map((p) => p.msp)).toEqual(['1', '2', '3']);
    expect(outcome.added.map((p) => p.msp)).toEqual(['3']);
    expect(outcome.updated).toEqual([expect.objectContaining({ msp: '2', giaGiamCu: '200', giaGiam: '250' })]);
    expect(outcome.unchanged).toBe(0);
    expect([...outcome.incoming.keys()]).toEqual(['2', '3']);
  });

  it('mã trùng và không đổi gì thì tính là không đổi; đổi khuyến mãi hay thưởng cũng là cập nhật', () => {
    const old = source('a', [product('1'), product('2'), product('3')]);
    const outcome = applyPriceImport([old], [source('b', [
      product('1'),
      product('2', undefined, { khuyenMai: 'Tặng quà' }),
      product('3', undefined, { thuongERP: 5000 }),
    ])]);
    expect(outcome.unchanged).toBe(1);
    expect(outcome.updated.map((p) => p.msp)).toEqual(['2', '3']);
  });

  it('nhiều file trong một lần nhập: file sau trong lượt ghi đè file trước', () => {
    const outcome = applyPriceImport([], [source('a', [product('1', '100')]), source('b', [product('1', '90')])]);
    expect(prices(outcome.products)).toEqual({ 1: '90' });
    expect(outcome.added).toEqual([expect.objectContaining({ msp: '1', giaGiam: '90' })]);
  });

  it('mã trùng trong cùng một file giữ dòng đầu như trước', () => {
    expect(dedupeProducts([product('1', '100'), product('1', '50'), product('2')]).map((p) => [p.msp, p.giaGiam]))
      .toEqual([['1', '100'], ['2', '100.000 ₫']]);
  });

  it('xoá một file: mã chỉ có ở file đó mất, mã có ở file khác lấy giá file mới nhất còn lại', () => {
    const sources = [
      source('a', [product('1', '100'), product('2', '200')]),
      source('b', [product('2', '210'), product('3', '300')]),
      source('c', [product('2', '220')]),
    ];
    expect(prices(mergeSources(sources))).toEqual({ 1: '100', 2: '220', 3: '300' });

    const withoutC = removeSources(sources, ['c']);
    expect(prices(withoutC.products)).toEqual({ 1: '100', 2: '210', 3: '300' });

    const withoutB = removeSources(sources, ['b']);
    expect(prices(withoutB.products)).toEqual({ 1: '100', 2: '220' });
    expect(withoutB.sources.map((s) => s.id)).toEqual(['a', 'c']);

    expect(removeSources(sources, ['a', 'b', 'c']).products).toEqual([]);
  });
});

describe('Màn quản lý file', () => {
  it('file mới nhất đứng đầu, đếm số mã đã có giá ở file nhập sau', () => {
    const summaries = summarizeSources([
      source('a', [product('1'), product('2')]),
      source('b', [product('2'), product('3')]),
      source('c', [product('3')]),
    ]);
    expect(summaries.map((s) => [s.id, s.productCount, s.overriddenCount])).toEqual([
      ['c', 1, 0],
      ['b', 2, 1],
      ['a', 2, 1],
    ]);
    expect(fullyOverriddenIds(summaries)).toEqual([]);
  });

  it('tìm được file mà mọi mã đã bị file sau thay hết', () => {
    const summaries = summarizeSources([source('a', [product('1')]), source('b', [product('1'), product('2')])]);
    expect(fullyOverriddenIds(summaries)).toEqual(['a']);
  });
});

describe('Dữ liệu từ bản trước', () => {
  it('bảng giá cũ chưa tách file thành một file, giữ tên và giờ nạp', () => {
    const legacy = legacySource([product('1')], { fileName: 'a.xlsx, b.xlsx', uploadTimestamp: new Date('2026-10-01T08:00:00.000Z'), fileExportDate: 'Ngày in: 01/10/2026' });
    expect(legacy).toMatchObject({ id: LEGACY_SOURCE_ID, fileName: 'a.xlsx, b.xlsx', importedAt: '2026-10-01T08:00:00.000Z', exportDate: 'Ngày in: 01/10/2026' });
    expect(legacySource([], null).fileName).toBe('Bảng giá đã nạp trước đây');
  });

  it('thông tin file lưu kèm giữ định dạng cũ, giờ cập nhật là lần nhập gần nhất', () => {
    const info = fileInfoFor([source('a', [], '2026-11-01T00:00:00.000Z'), source('b', [], '2026-11-03T00:00:00.000Z')]);
    expect(info?.fileName).toBe('a.xlsx, b.xlsx');
    expect(info?.uploadTimestamp.toISOString()).toBe('2026-11-03T00:00:00.000Z');
    expect(fileInfoFor([])).toBeNull();
  });
});

describe('Lịch sử nhập', () => {
  it('lần nhập mới đứng đầu, giữ tối đa số lần quy định', () => {
    const record = (i: number): PriceImportRecord => ({
      id: `r${i}`, importedAt: '', files: [], failedFiles: [], added: [], updated: [], unchanged: 0, totalAfter: 0,
    });
    let history: PriceImportRecord[] = [];
    for (let i = 0; i < MAX_IMPORT_HISTORY + 5; i++) history = appendHistory(history, record(i));
    expect(history).toHaveLength(MAX_IMPORT_HISTORY);
    expect(history[0].id).toBe(`r${MAX_IMPORT_HISTORY + 4}`);
  });
});
