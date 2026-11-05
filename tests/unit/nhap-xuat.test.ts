import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import {
  applyImport,
  createImportWorkbook,
  indexProducts,
  matchImportItems,
  parseImportText,
  rowsToImportText,
} from '../../src/features/sticker-event/services/productListImport';
import type { Product } from '../../src/features/sticker-event/types';

const product = (msp: string, quantity = 1, selected = false): Product => ({
  msp,
  sanPham: `SP ${msp}`,
  quantity,
  selected,
} as Product);

describe('Đọc nội dung dán', () => {
  it('đọc dòng tab từ Excel và cộng số lượng các mã trùng', () => {
    const parsed = parseImportText('2714133000100\t1\n4844099000052\t1\n2714133000100\t1\n4844099000052\t1\n');
    expect(parsed.items).toEqual([
      { code: '2714133000100', quantity: 2 },
      { code: '4844099000052', quantity: 2 },
    ]);
    expect(parsed.mergedLines).toBe(2);
    expect(parsed.problems).toEqual([]);
  });

  it('nhận cả dấu phẩy, chấm phẩy, khoảng trắng, xuống dòng Windows; thiếu số lượng tính là 1', () => {
    expect(parseImportText('A1,2\r\nA2;3\r\nA3   4\r\nA4\r\n').items).toEqual([
      { code: 'A1', quantity: 2 },
      { code: 'A2', quantity: 3 },
      { code: 'A3', quantity: 4 },
      { code: 'A4', quantity: 1 },
    ]);
  });

  it('bỏ dòng tiêu đề ở đầu, nhưng mã bình thường ở dòng đầu thì giữ', () => {
    expect(parseImportText('CODE\tSỐ LƯỢNG\nA1\t2').items).toEqual([{ code: 'A1', quantity: 2 }]);
    expect(parseImportText('mã sản phẩm\tsố lượng\nA1\t2').items).toEqual([{ code: 'A1', quantity: 2 }]);
    expect(parseImportText('CODE123\t2').items).toEqual([{ code: 'CODE123', quantity: 2 }]);
  });

  it('báo đúng dòng lỗi, các dòng khác vẫn nhận', () => {
    const parsed = parseImportText('A1\t2\n\nA2\tabc\nA3\t0\nA4\t1.5\nA5\t501\n\t3\n2.71413E+12\t1\nA6\t500');
    expect(parsed.items).toEqual([{ code: 'A1', quantity: 2 }, { code: 'A6', quantity: 500 }]);
    expect(parsed.problems.map((p) => p.line)).toEqual([3, 4, 5, 6, 7, 8]);
    expect(parsed.problems[5].reason).toContain('rút gọn');
  });

  it('cộng dồn không vượt quá 500 tem mỗi sản phẩm', () => {
    expect(parseImportText('A1\t400\nA1\t400').items).toEqual([{ code: 'A1', quantity: 500 }]);
  });
});

describe('Tìm sản phẩm theo mã', () => {
  it('không phân biệt hoa thường, tách mã không có trong bảng giá', () => {
    const index = indexProducts([product('ABC1'), product('2001')]);
    const { entries, notFound } = matchImportItems(
      [{ code: 'abc1', quantity: 2 }, { code: '2001', quantity: 1 }, { code: 'KHONGCO', quantity: 1 }],
      index,
    );
    expect(entries.map((e) => [e.product.msp, e.quantity])).toEqual([['ABC1', 2], ['2001', 1]]);
    expect(notFound).toEqual(['KHONGCO']);
  });
});

describe('Áp vào danh sách', () => {
  const current = [product('A', 4, true), product('B', 1)];
  const entries = [{ product: product('C'), quantity: 2 }, { product: product('A'), quantity: 3 }];

  it('Thêm: mã đã có thì cộng số lượng và giữ ô đã chọn, mã mới đứng đầu', () => {
    const next = applyImport(current, entries, 'add');
    expect(next.map((p) => [p.msp, p.quantity, p.selected])).toEqual([
      ['C', 2, false],
      ['A', 7, true],
      ['B', 1, false],
    ]);
  });

  it('Thay: chỉ còn các sản phẩm vừa nhập', () => {
    const next = applyImport(current, entries, 'replace');
    expect(next.map((p) => [p.msp, p.quantity, p.selected])).toEqual([['C', 2, false], ['A', 3, false]]);
  });
});

describe('File Excel', () => {
  const roundTrip = (items: { code: string; quantity: number }[]) => {
    const bytes = XLSX.write(createImportWorkbook(XLSX, items), { type: 'buffer', bookType: 'xlsx' });
    return XLSX.read(bytes, { type: 'buffer', cellNF: true });
  };
  const rowsOf = (workbook: XLSX.WorkBook) =>
    XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[workbook.SheetNames[0]], { header: 1, raw: true, blankrows: false, defval: '' });

  it('xuất đủ hai cột, cột mã để dạng Text, nhập lại được đúng số liệu', () => {
    const workbook = roundTrip([{ code: '0271413300010', quantity: 3 }, { code: 'ABC', quantity: 1 }]);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    expect(sheet.A1.v).toBe('CODE');
    expect(sheet.B1.v).toBe('SỐ LƯỢNG');
    expect(sheet.A2.z).toBe('@');
    expect(parseImportText(rowsToImportText(rowsOf(workbook))).items).toEqual([
      { code: '0271413300010', quantity: 3 },
      { code: 'ABC', quantity: 1 },
    ]);
  });

  it('danh sách trống ra file mẫu không có dòng dữ liệu, ô mã trống đã để sẵn dạng Text', () => {
    const workbook = roundTrip([]);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    expect(sheet.A500.z).toBe('@');
    expect(rowsToImportText(rowsOf(workbook))).toBe('');
  });

  it('đọc được mã lưu dạng số, cột tìm theo tiêu đề dù đổi thứ tự hoặc có cột khác', () => {
    expect(parseImportText(rowsToImportText([[2714133000100, 2], ['ABC', 3]])).items).toEqual([
      { code: '2714133000100', quantity: 2 },
      { code: 'ABC', quantity: 3 },
    ]);
    const text = rowsToImportText([['TÊN', 'SỐ LƯỢNG', 'CODE'], ['Nồi', 5, 2714133000100]]);
    expect(parseImportText(text).items).toEqual([{ code: '2714133000100', quantity: 5 }]);
  });
});
