import { describe, expect, it } from 'vitest';
import {
  TEMPLATES, cellProblem, densityProblem, emptyCell, fifoLabels, isEmptyCell, labelBox, parseSheetRows, perSheet, placeCells, printDocument,
  sequenceLabels, sheetLabels, sheetsOf,
} from '../../src/features/in-nhan/nhanModel';

describe('Tờ nhãn Tomy A5', () => {
  it('Tomy 117: 48 tem tròn 8 x 6, Tomy 105: 30 tem 5 x 6; mọi tem nằm trong tờ, không chồng nhau', () => {
    expect(perSheet(TEMPLATES['tomy-117'])).toBe(48);
    expect(perSheet(TEMPLATES['tomy-105'])).toBe(30);
    for (const template of Object.values(TEMPLATES)) {
      const boxes = Array.from({ length: perSheet(template) }, (_, i) => labelBox(template, i));
      for (const box of boxes) {
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.x + template.width).toBeLessThanOrEqual(template.paperW);
        expect(box.y + template.height).toBeLessThanOrEqual(template.paperH);
      }
      // Tem kề nhau không chồng lên nhau
      expect(boxes[1].x - boxes[0].x).toBeGreaterThanOrEqual(template.width);
      expect(boxes[template.cols].y - boxes[0].y).toBeGreaterThanOrEqual(template.height);
      // Lưới cân giữa tờ
      const last = boxes[boxes.length - 1];
      expect(boxes[0].x + last.x + template.width).toBeCloseTo(template.paperW, 1);
      expect(boxes[0].y + last.y + template.height).toBeCloseTo(template.paperH, 1);
    }
  });

  it('căn chỉnh: dịch cả lưới, nới khoảng cách thì hai mép giãn đều', () => {
    const t = TEMPLATES['tomy-117'];
    const base = labelBox(t, 9);
    expect(labelBox(t, 9, { offsetX: 1.5, offsetY: -0.5, gapX: 0, gapY: 0 })).toMatchObject({ x: base.x + 1.5, y: base.y - 0.5, col: 1, row: 1 });
    const wider = [labelBox(t, 0, { offsetX: 0, offsetY: 0, gapX: 0.4, gapY: 0 }), labelBox(t, 7, { offsetX: 0, offsetY: 0, gapX: 0.4, gapY: 0 })];
    expect(wider[0].x).toBeCloseTo(labelBox(t, 0).x - 1.4, 2);
    expect(wider[1].x).toBeCloseTo(labelBox(t, 7).x + 1.4, 2);
  });
});

describe('Nội dung tem', () => {
  it('tem FIFO theo màu: ngày, màu, ghi chú, đủ số lượng', () => {
    const labels = fifoLabels('22/11', [{ color: 'Đen', quantity: 2, note: '1020' }, { color: 'Trắng', quantity: 0, note: '8/128' }, { color: 'Bạc', quantity: 1, note: '' }]);
    expect(labels.map(l => [l.line1, l.line2, l.line3])).toEqual([['22/11', 'Đen', '1020'], ['22/11', 'Đen', '1020'], ['22/11', 'Bạc', '']]);
  });

  it('mã tự tăng giữ số chữ số; đặt từ vị trí bắt đầu, thiếu ô thì thêm', () => {
    const labels = sequenceLabels('barcode', 'SP', 98, 3, 'Ốp lưng');
    expect(labels.map(l => l.code)).toEqual(['SP98', 'SP99', 'SP100']);
    expect(sequenceLabels('qr', 'A-', 1, 2, '').map(l => l.code)).toEqual(['A-1', 'A-2']);
    expect(sequenceLabels('qr', 'B', 7, 1, '')[0].code).toBe('B7');
    expect(sequenceLabels('qr', 'C', 1, 1, '')[0]).toMatchObject({ kind: 'qr', name: '' });
    const cells = placeCells([null, emptyCell()], 3, labels);
    expect(cells).toHaveLength(6);
    expect(cells[3]?.code).toBe('SP98');
    expect(cells[2]).toBeNull();
  });

  it('đọc Excel có hoặc không có dòng tiêu đề; số tem mặc định 1; bỏ dòng trống', () => {
    expect(parseSheetRows([['Tên sản phẩm', 'Mã vạch', 'Số tem'], ['Ốp lưng iPhone 15', 'OP-015', 3], ['', '', ''], ['Cáp sạc', '8934563138165', '']]))
      .toEqual([{ name: 'Ốp lưng iPhone 15', code: 'OP-015', count: 3 }, { name: 'Cáp sạc', code: '8934563138165', count: 1 }]);
    expect(parseSheetRows([['Ốp lưng', 'OP1', 2]])).toEqual([{ name: 'Ốp lưng', code: 'OP1', count: 2 }]);
    const labels = sheetLabels([{ name: 'Ốp lưng', code: 'OP1', count: 2 }], 'barcode');
    expect(labels).toHaveLength(2);
    expect(labels[0]).toMatchObject({ kind: 'barcode', name: 'Ốp lưng', code: 'OP1' });
    expect(sheetLabels([{ name: 'Ốp lưng', code: 'OP1', count: 1 }], 'text')[0]).toMatchObject({ line1: 'Ốp lưng', line2: 'OP1' });
  });

  it('báo lỗi mã: mã vạch có dấu, mã vạch quá dài so với tem tròn', () => {
    expect(cellProblem({ ...emptyCell('barcode'), code: 'Đồng hồ' })).toContain('không dấu');
    expect(cellProblem({ ...emptyCell('qr'), code: 'Đồng hồ' })).toBe('');
    expect(densityProblem({ ...emptyCell('barcode'), code: 'SP-00123-ABCDEFG' }, TEMPLATES['tomy-117'])).toContain('dài quá');
    expect(densityProblem({ ...emptyCell('barcode'), code: 'SP123' }, TEMPLATES['tomy-105'])).toBe('');
    expect(isEmptyCell({ ...emptyCell('qr'), name: 'Chỉ tên' })).toBe(false);
  });

  it('chia tờ theo tem cuối cùng có nội dung; bản in A5 ngang mỗi tờ một trang, ô trống không in', () => {
    const t = TEMPLATES['tomy-105'];
    const cells = placeCells([], 29, fifoLabels('1/12', [{ color: 'Đen', quantity: 3, note: '' }]));
    expect(sheetsOf(cells, t)).toHaveLength(2);
    expect(sheetsOf([], t)).toHaveLength(1);
    const html = printDocument(t, cells, { offsetX: 0, offsetY: 0, gapX: 0, gapY: 0 }, '/fonts/google-fonts.css');
    expect(html).toContain('size: A5 landscape');
    expect(html.match(/class="tn-to print-page"/g)).toHaveLength(2);
    expect(html.match(/class="tn-tem"/g)).toHaveLength(3);
    // In thử khung: một tờ đủ 30 khung đánh số
    const frame = printDocument(t, cells, { offsetX: 0, offsetY: 0, gapX: 0, gapY: 0 }, '', true);
    expect(frame.match(/class="tn-tem( tron)? tn-khung"/g)).toHaveLength(30);
    expect(frame).toContain('<div class="tn-so">30</div>');
  });
});
