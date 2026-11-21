import { describe, expect, it } from 'vitest';
import {
  MIN_BAR_MM, barWidthMm, barcodeProblem, barcodeSvg, cellHtml, densityProblem, code128Bars, code128Values, decodeCode128, fileSlug, gridFor, itemProblem, pagesOf, parseLines, printDocument,
  qrMatrix, qrSvg, DEFAULT_SETTINGS,
} from '../../src/features/tao-ma/maCode';

/** Đọc lại chữ từ giá trị Code 128 (kiểm tra số kiểm tra, START, STOP), để chắc mã vạch quét ra đúng nội dung */
const readBack = (values: number[]): string => {
  expect(values[values.length - 1]).toBe(106);
  const body = values.slice(0, -2);
  const check = body.reduce((sum, value, index) => sum + value * (index === 0 ? 1 : index), 0) % 103;
  expect(values[values.length - 2]).toBe(check);
  let set = body[0] === 105 ? 'C' : body[0] === 104 ? 'B' : '?';
  let text = '';
  for (const value of body.slice(1)) {
    // Bộ C: 0 đến 99 là hai chữ số, 100 sang bộ B. Bộ B: 99 sang bộ C
    if (set === 'C' && value === 100) set = 'B';
    else if (set === 'B' && value === 99) set = 'C';
    else text += set === 'C' ? String(value).padStart(2, '0') : String.fromCharCode(value + 32);
  }
  return text;
};

describe('Mã vạch Code 128', () => {
  it('số kiểm tra và bộ ký tự đúng chuẩn', () => {
    expect(code128Values('123456')).toEqual([105, 12, 34, 56, 44, 106]);
    expect(code128Values('ABC')).toEqual([104, 33, 34, 35, 1, 106]);
    // Dãy số dài ở giữa chuyển sang bộ C cho mã ngắn
    expect(code128Values('AB12345678').slice(0, 8)).toEqual([104, 33, 34, 99, 12, 34, 56, 78]);
  });

  it('quét ngược ra đúng nội dung với chữ, số, ký hiệu, dãy số lẻ', () => {
    for (const text of ['SP-00123', '8934563138165', '12345', 'IMEI 356938035643809', 'a', '7', 'Ab1234567c', 'https://insticker.vn/?id=42&x=1', '0099']) {
      const { widths, modules } = code128Bars(text);
      expect(readBack(decodeCode128(widths))).toBe(text);
      // Mỗi ký hiệu 11 vạch nhỏ, STOP 13
      expect(modules).toBe((code128Values(text).length - 1) * 11 + 13);
    }
  });

  it('không nhận chữ có dấu, xuống dòng hay nội dung quá dài', () => {
    expect(barcodeProblem('Áo thun')).toContain('không dấu');
    expect(barcodeProblem('A\nB')).toContain('không dấu');
    expect(barcodeProblem('x'.repeat(81))).toContain('quá dài');
    expect(barcodeProblem('SP-001')).toBe('');
    expect(() => code128Values('Đồng hồ')).toThrow();
  });

  it('SVG có đủ vạch đen, vùng trắng hai bên', () => {
    const svg = barcodeSvg('SP-001');
    const { widths, modules } = code128Bars('SP-001');
    expect(svg).toContain(`viewBox="0 0 ${modules + 20} 40"`);
    expect(svg.match(/M\d+ 0h/g)).toHaveLength(Math.ceil(widths.length / 2));
    expect(svg).toContain('M10 0h2');
  });
});

describe('Mã QR', () => {
  it('nhận tiếng Việt có dấu, có viền trắng 4 ô', () => {
    const matrix = qrMatrix('Chuyển hàng Online · Kho sáng');
    expect(matrix.length).toBeGreaterThanOrEqual(21);
    // Ô định vị góc trên trái luôn đen
    expect(matrix[0][0] && matrix[0][6] && matrix[6][0]).toBe(true);
    expect(qrSvg('Chuyển hàng')).toContain(`viewBox="0 0 ${qrMatrix('Chuyển hàng').length + 8} `);
  });

  it('nội dung quá dài thì báo lỗi thay vì vỡ', () => {
    expect(itemProblem({ content: 'x'.repeat(3000) }, 'qr')).toContain('quá dài');
    expect(itemProblem({ content: '  ' }, 'qr')).toBe('Chưa có nội dung');
    expect(itemProblem({ content: 'Áo thun' }, 'qr')).toBe('');
    expect(itemProblem({ content: 'Áo thun' }, 'both')).toContain('không dấu');
  });
});

describe('Nhập nhiều dòng', () => {
  it('một cột là nội dung; hai cột (dán Excel hoặc dấu |) là tiêu đề và nội dung; bỏ dòng trống', () => {
    expect(parseLines('SP001\n\nTủ lạnh LG\tSP002\nMáy giặt | SP003 \r\n  ')).toEqual([
      { title: '', content: 'SP001' },
      { title: 'Tủ lạnh LG', content: 'SP002' },
      { title: 'Máy giặt', content: 'SP003' },
    ]);
    // Dòng có tiêu đề mà không có nội dung thì bỏ
    expect(parseLines('Chỉ tiêu đề\t')).toEqual([]);
  });
});

describe('Trang in', () => {
  it('chia A4 theo số mã mỗi trang: QR gần vuông, mã vạch dài ngang', () => {
    expect(gridFor(12, false, 'qr')).toMatchObject({ cols: 3, rows: 4 });
    expect(gridFor(1, false, 'qr')).toMatchObject({ cols: 1, rows: 1 });
    expect(gridFor(20, false, 'qr')).toMatchObject({ cols: 4, rows: 5 });
    expect(gridFor(12, false, 'barcode')).toMatchObject({ cols: 2, rows: 6 });
    expect(gridFor(12, true, 'qr')).toMatchObject({ cols: 4, rows: 3 });
    // Đủ chỗ cho mọi lựa chọn
    for (const n of [1, 2, 4, 6, 8, 9, 10, 12, 15, 16, 18, 20, 24, 28, 30, 35, 40, 48, 54, 63, 70]) {
      for (const kind of ['qr', 'barcode', 'both'] as const) {
        const grid = gridFor(n, false, kind);
        expect(grid.cols * grid.rows).toBeGreaterThanOrEqual(n);
        expect(grid.cols * (grid.rows - 1)).toBeLessThan(n);
      }
    }
  });

  it('mỗi mã lặp theo số bản rồi chia trang', () => {
    const pages = pagesOf([{ id: 'a', copies: 3 }, { id: 'b', copies: 1 }, { id: 'c', copies: 0 }], 2);
    expect(pages.map(page => page.map(item => item.id))).toEqual([['a', 'a'], ['a', 'b'], ['c']]);
  });

  it('tài liệu in: đủ trang, tiêu đề được thoát ký tự, lỗi từng mã ghi trong ô', () => {
    const items = Array.from({ length: 13 }, (_, i) => ({ id: `m${i}`, title: i === 0 ? '<Kho> & "A"' : `Mã ${i}`, content: i === 1 ? 'Có dấu' : `SP${i}`, copies: 1 }));
    const html = printDocument(items, { ...DEFAULT_SETTINGS, kind: 'both', perPage: 12 }, 'Mã QR');
    expect(html.match(/class="tm-trang print-page"/g)).toHaveLength(2);
    expect(html.match(/class="tm-o"/g)).toHaveLength(13);
    expect(html).toContain('&lt;Kho&gt; &amp; &quot;A&quot;');
    expect(html).toContain('size: A4 portrait');
    expect(html).toContain('Mã vạch chỉ nhận chữ không dấu');
    expect(cellHtml({ title: '', content: 'SP1' }, { ...DEFAULT_SETTINGS, showText: false })).not.toContain('tm-nd');
  });

  it('cảnh báo mã vạch dài in trong ô nhỏ (vạch mảnh hơn mức máy quét đọc được)', () => {
    const link = 'https://insticker.vn/kho?ma=CHO-2026-11';
    const both12 = { ...DEFAULT_SETTINGS, kind: 'both' as const, perPage: 12 };
    expect(barWidthMm(link, both12, gridFor(12, false, 'both'))).toBeLessThan(MIN_BAR_MM);
    expect(densityProblem({ content: link }, both12)).toContain('khó đọc');
    expect(densityProblem({ content: 'SP-00123' }, both12)).toBe('');
    // In to hơn (2 mã mỗi trang) thì đọc được; mã QR không cảnh báo
    expect(densityProblem({ content: link }, { ...both12, perPage: 2 })).toBe('');
    expect(densityProblem({ content: link }, { ...both12, kind: 'qr' })).toBe('');
  });

  it('tên file không dấu', () => {
    expect(fileSlug('Đồng hồ Casio / Kho 2')).toBe('Dong_ho_Casio_Kho_2');
    expect(fileSlug('###')).toBe('ma');
  });
});
