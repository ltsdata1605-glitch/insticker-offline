import { describe, expect, it } from 'vitest';
import {
  DENOMINATIONS, amountInWords, asCount, diffOf, diffText, formatMoney, isBlank, newCount, parseMoney, reportText, sheetTotal, totalOf, upsertHistory,
} from '../../src/features/kiem-quy/kiemQuyModel';

const sample = () => ({ ...newCount(new Date(2026, 10, 21, 21, 5).getTime()), name: 'Ca tối - Ngọc', counts: { 500000: 3, 200000: 2, 10000: 5, 500: 4 }, other: 1_200 });

describe('Kiểm quỹ', () => {
  it('tổng tiền theo số tờ từng mệnh giá cộng tiền khác, chênh lệch với số theo sổ', () => {
    const count = sample();
    expect(totalOf(count)).toBe(1_500_000 + 400_000 + 50_000 + 2_000 + 1_200);
    expect(sheetTotal(count)).toBe(14);
    expect(diffOf(count)).toBeNull();
    expect(diffOf({ ...count, expected: 1_953_200 })).toBe(0);
    expect(diffText(diffOf({ ...count, expected: 1_953_200 }))).toBe('Khớp sổ');
    expect(diffText(diffOf({ ...count, expected: 2_000_000 }))).toBe('Thiếu 46.800');
    expect(diffText(diffOf({ ...count, expected: 1_900_000 }))).toBe('Thừa 53.200');
    expect(DENOMINATIONS[0]).toBe(500_000);
  });

  it('đọc số tiền gõ tay có dấu chấm, phẩy, chữ đ', () => {
    expect(parseMoney('1.250.000')).toBe(1_250_000);
    expect(parseMoney('1,250,000 đ')).toBe(1_250_000);
    expect(parseMoney('')).toBe(0);
    expect(formatMoney(1_250_000)).toBe('1.250.000');
  });

  it('số tiền bằng chữ', () => {
    expect(amountInWords(1_250_000)).toBe('Một triệu hai trăm năm mươi nghìn đồng');
    expect(amountInWords(21)).toBe('Hai mươi mốt đồng');
    expect(amountInWords(11)).toBe('Mười một đồng');
    expect(amountInWords(15)).toBe('Mười lăm đồng');
    expect(amountInWords(25_000)).toBe('Hai mươi lăm nghìn đồng');
    expect(amountInWords(105)).toBe('Một trăm linh năm đồng');
    expect(amountInWords(1_005_000)).toBe('Một triệu không trăm linh năm nghìn đồng');
    expect(amountInWords(2_000_500)).toBe('Hai triệu năm trăm đồng');
    expect(amountInWords(1_000_000_000)).toBe('Một tỷ đồng');
    expect(amountInWords(0)).toBe('Không đồng');
  });

  it('báo cáo dạng chữ chỉ ghi mệnh giá có tiền', () => {
    const text = reportText({ ...sample(), expected: 2_000_000, note: 'Thiếu do thối nhầm' }, new Date(2026, 10, 21, 21, 10).getTime());
    expect(text).toContain('KIỂM QUỸ: Ca tối - Ngọc');
    expect(text).toContain('Lúc 21:10 21/11/2026');
    expect(text).toContain('500.000 x 3 tờ = 1.500.000');
    expect(text).toContain('500 x 4 tờ = 2.000');
    expect(text).not.toContain('100.000 x');
    expect(text).toContain('Tiền khác: 1.200');
    expect(text).toContain('Tổng thực tế: 1.953.200 đ (14 tờ)');
    expect(text).toContain('Bằng chữ: Một triệu chín trăm năm mươi ba nghìn hai trăm đồng');
    expect(text).toContain('Chênh lệch: Thiếu 46.800');
    expect(text).toContain('Ghi chú: Thiếu do thối nhầm');
  });

  it('lịch sử: lưu lại lần đã lưu thì thay, lần mới lên đầu; đọc dữ liệu hỏng thì bù hoặc bỏ', () => {
    const a = { ...sample(), id: 'a' };
    const b = { ...sample(), id: 'b' };
    expect(upsertHistory([a], b).map(item => item.id)).toEqual(['b', 'a']);
    expect(upsertHistory([b, a], { ...a, name: 'Sửa' }).map(item => `${item.id}:${item.name}`)).toEqual(['a:Sửa', 'b:Ca tối - Ngọc']);
    expect(asCount({ id: 'x', counts: { 500000: '2', 1000: -3 }, expected: '' })).toMatchObject({ counts: { 500000: 2 }, other: 0, expected: null, name: '' });
    expect(asCount({ counts: {} })).toBeNull();
    expect(isBlank(newCount())).toBe(true);
    expect(isBlank({ ...newCount(), counts: { 1000: 1 } })).toBe(false);
  });
});
