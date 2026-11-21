import { describe, expect, it } from 'vitest';
import { FakeBridge } from '../e2e/cau-noi-gia';
import type { Reminder } from '../../src/features/nhac-viec/nhacViecModel';
import { mergeSheetTasks, readSheetTables } from '../../src/features/nhac-viec/sheetTasks';
import {
  applyDoneLog, applyResults, beforeText, bridgeLinkFrom, buildOps, enqueue, localReminders, reminderToRow, repeatCellText, runReport,
} from '../../src/features/nhac-viec/sheetBridge';
import type { OutboxOp } from '../../src/features/nhac-viec/sheetBridge';

const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).getTime();

const reminder = (overrides: Partial<Reminder> = {}): Reminder => ({
  id: 'nv-1', title: 'Trả hàng lỗi cho NCC', content: 'Gọi trước 30 phút', deadline: at(25, 15, 30), remindBefore: [15, 0], repeat: 'none', weekdays: [],
  priority: 'urgent', sound: { kind: 'tts', text: 'Trả hàng lỗi' }, createdAt: at(20, 8), updatedAt: at(20, 8), armedAt: at(20, 8),
  done: {}, fired: {}, snoozes: [], source: { kind: 'sheet', taskId: '' }, assignee: 'Linh', assigner: 'Ngọc - 11443', ...overrides,
});

describe('Script cầu nối trong file (phần Lõi)', () => {
  it('việc mới vào dòng chưa dùng đầu tiên, ghi Đang giao và Người giao; hết dòng thì thêm dòng với mã kế tiếp', () => {
    const bridge = new FakeBridge(2);
    bridge.setTask('CV001', { 'Tiêu đề': 'Việc có sẵn', 'Ngày hạn': '24/11/2026' });
    const first = bridge.apply([{ op: 'upsert', ref: 'a', row: { 'Tiêu đề': 'Việc A', 'Ngày hạn': { ngay: '2026-11-25' }, 'Giờ hạn': '15:30' } }], 'Ngọc');
    expect(first.ketQua).toEqual([{ ref: 'a', id: 'CV002' }]);
    expect(bridge.task('CV002')).toMatchObject({ 'Tiêu đề': 'Việc A', 'Ngày hạn': '25/11/2026', 'Giờ hạn': '15:30', 'Trạng thái': 'Đang giao', 'Người giao': 'Ngọc' });
    const second = bridge.apply([{ op: 'upsert', ref: 'b', row: { 'Tiêu đề': 'Việc B', 'Người giao': 'QL Sơn' } }], 'Ngọc');
    expect(second.ketQua[0].id).toBe('CV003');
    expect(bridge.task('CV003')['Người giao']).toBe('QL Sơn');
    expect(bridge.viec).toHaveLength(4);
  });

  it('app gửi lại (mất mạng giữa chừng) không tạo trùng việc; sửa chỉ ghi ô đổi; mã không còn thì báo', () => {
    const bridge = new FakeBridge(3);
    bridge.apply([{ op: 'upsert', ref: 'a', row: { 'Tiêu đề': 'Việc A', 'Nội dung': 'x' } }], 'Ngọc');
    const again = bridge.apply([{ op: 'upsert', ref: 'a', row: { 'Tiêu đề': 'Việc A', 'Nội dung': 'y' } }], 'Ngọc');
    expect(again.ketQua).toEqual([{ ref: 'a', id: 'CV001' }]);
    expect(again.ghi).toEqual([{ trang: 'viec', dong: 2, cot: 3, giaTri: 'y' }]);
    expect(bridge.task('CV002')['Tiêu đề']).toBe('');
    expect(bridge.apply([{ op: 'upsert', ref: 'z', id: 'CV099', row: { 'Tiêu đề': 'Mất' } }], 'Ngọc').ketQua[0].loi).toBe('khong-thay');
  });

  it('Đã xong: việc một lần ghi Xong; việc lặp lại chỉ ghi người xong và Nhật ký; bấm hai lần không ghi trùng; huỷ ghi Huỷ', () => {
    const bridge = new FakeBridge(3);
    bridge.setTask('CV001', { 'Tiêu đề': 'Một lần' });
    bridge.setTask('CV002', { 'Tiêu đề': 'Mỗi ngày', 'Trạng thái': 'Đang giao' });
    bridge.apply([
      { op: 'done', ref: 'r1', id: 'CV001', occ: at(25, 15), at: at(25, 14, 50), repeat: false },
      { op: 'done', ref: 'r2', id: 'CV002', occ: at(25, 9), at: at(25, 9, 5), repeat: true },
      { op: 'done', ref: 'r2', id: 'CV002', occ: at(25, 9), at: at(25, 9, 6), repeat: true },
    ], 'Ngọc');
    expect(bridge.task('CV001')).toMatchObject({ 'Trạng thái': 'Xong', 'Người xong': 'Ngọc', 'Xong lúc': '25/11/2026 14:50' });
    expect(bridge.task('CV002')).toMatchObject({ 'Trạng thái': 'Đang giao', 'Người xong': 'Ngọc' });
    expect(bridge.nhatKy.map(row => [row[1], row[2], row[4], row[5]])).toEqual([
      ['CV001', 'Một lần', 'Ngọc', String(at(25, 15))],
      ['CV002', 'Mỗi ngày', 'Ngọc', String(at(25, 9))],
    ]);
    expect(bridge.core.cnLanXong_(bridge.nhatKy, 0)).toEqual([{ id: 'CV001', occ: at(25, 15), by: 'Ngọc' }, { id: 'CV002', occ: at(25, 9), by: 'Ngọc' }]);
    // Chỉ gửi về app các lần xong trong 40 ngày gần đây
    expect(bridge.core.cnLanXong_(bridge.nhatKy, at(25, 10))).toEqual([{ id: 'CV001', occ: at(25, 15), by: 'Ngọc' }]);
    bridge.apply([{ op: 'cancel', ref: 'r1', id: 'CV001' }], 'Ngọc');
    expect(bridge.task('CV001')['Trạng thái']).toBe('Huỷ');
  });

  it('việc vừa tạo trong cùng lượt gửi: xong và huỷ tìm theo mã của app', () => {
    const bridge = new FakeBridge(3);
    const out = bridge.apply([
      { op: 'upsert', ref: 'nv-9', row: { 'Tiêu đề': 'Việc mới' } },
      { op: 'done', ref: 'nv-9', occ: at(25, 9), at: at(25, 9), repeat: false },
    ], 'Ngọc');
    expect(out.ketQua.map(item => item.id)).toEqual(['CV001', 'CV001']);
    expect(bridge.task('CV001')['Trạng thái']).toBe('Xong');
  });

  it('báo cáo checklist ghi một dòng, gửi lại không ghi trùng; khung Giao việc nhanh ghi ngày hạn dạng ngày', () => {
    const bridge = new FakeBridge(2);
    const report = { op: 'report', ref: 'run-1', report: { finishedAt: at(25, 8, 40), checklist: 'Mở ca', date: '25/11/2026', performer: 'Ngọc', result: '2/2 hoàn tất', issues: '0', todo: '0', note: '', detail: '1. A: Hoàn tất' } };
    bridge.apply([report], 'Ngọc');
    bridge.apply([report], 'Ngọc');
    expect(bridge.baoCao).toEqual([['25/11/2026 08:40', 'Mở ca', '25/11/2026', 'Ngọc', '2/2 hoàn tất', '0', '0', '', '1. A: Hoàn tất', 'run-1']]);
    const row = bridge.core.cnDongTuForm_({ tieuDe: 'Kiểm kho', ngay: '2026-11-26', gio: '10:00', nguoiXuLy: 'Linh', mucDo: 'Khẩn' });
    expect(row['Ngày hạn']).toEqual({ ngay: '2026-11-26' });
    bridge.apply([{ op: 'upsert', row }], 'QL Sơn');
    expect(bridge.task('CV001')).toMatchObject({ 'Tiêu đề': 'Kiểm kho', 'Ngày hạn': '26/11/2026', 'Người xử lý': 'Linh', 'Người giao': 'QL Sơn' });
  });
});

describe('Đồng bộ hai chiều (app)', () => {
  it('nhận Link kết nối, không nhận link khác', () => {
    expect(bridgeLinkFrom(' https://script.google.com/macros/s/AKfycbx_abc-DEF123456789/exec?k=0123456789abcdef0123 ')).toBe('https://script.google.com/macros/s/AKfycbx_abc-DEF123456789/exec?k=0123456789abcdef0123');
    expect(bridgeLinkFrom('https://script.google.com/a/macros/cty.vn/s/AKfycbx_abc-DEF123456789/exec?k=0123456789abcdef0123')).not.toBeNull();
    expect(bridgeLinkFrom('https://script.google.com/macros/s/AKfycbx_abc-DEF123456789/exec')).toBeNull();
    expect(bridgeLinkFrom('https://docs.google.com/spreadsheets/d/1DrQV5W-YitTXIvEXjRfmqNStHy5MqC2AFDnWsOnCXyg/edit')).toBeNull();
    expect(bridgeLinkFrom('https://evil.com/macros/s/AKfycbx_abc-DEF123456789/exec?k=0123456789abcdef0123')).toBeNull();
  });

  it('mốc nhắc và cách lặp ghi đúng chữ trong danh sách chọn của file', () => {
    expect(beforeText([15, 0])).toBe('15 phút + đúng hạn');
    expect(beforeText([0])).toBe('Đúng hạn');
    expect(beforeText([5])).toBe('5 phút trước');
    expect(beforeText([0, 15, 60])).toBe('1 giờ + 15 phút + đúng hạn');
    expect(beforeText([1440, 60, 0])).toBe('1 ngày + 1 giờ + đúng hạn');
    expect(beforeText([90, 0])).toBe('90 phút + đúng hạn');
    expect(repeatCellText({ repeat: 'weekly', weekdays: [5, 1, 2, 3, 4] })).toBe('T2 - T6');
    expect(repeatCellText({ repeat: 'weekly', weekdays: [0, 6] })).toBe('T7 - CN');
    expect(repeatCellText({ repeat: 'weekly', weekdays: [1, 3, 5] })).toBe('T2, T4, T6');
    expect(repeatCellText({ repeat: 'weekly', weekdays: [] })).toBe('Mỗi tuần');
    expect(repeatCellText({ repeat: 'daily', weekdays: [] })).toBe('Mỗi ngày');
  });

  it('việc ghi lên file rồi đọc về vẫn y nguyên, không bị coi là đã đổi', () => {
    const bridge = new FakeBridge(3);
    for (const item of [
      reminder(),
      reminder({ id: 'nv-2', title: 'Kiểm quỹ', repeat: 'weekly', weekdays: [1, 3, 5], remindBefore: [60, 15, 0], sound: { kind: 'preset', preset: 'bip' }, priority: 'normal', assignee: undefined }),
      reminder({ id: 'nv-3', title: 'Chốt ca', repeat: 'weekly', weekdays: [2], remindBefore: [1440], sound: { kind: 'tts', text: '' }, content: '' }),
    ]) {
      const result = bridge.apply([{ op: 'upsert', ref: item.id, row: reminderToRow(item, '') }], 'Ngọc - 11443').ketQua[0];
      const synced = { ...item, source: { kind: 'sheet' as const, taskId: result.id } };
      const parsed = readSheetTables(bridge.doc().tables);
      const merged = mergeSheetTasks([synced], parsed.tasks.filter(task => task.id === result.id), at(21, 8));
      expect(merged.updated, item.title).toBe(0);
      expect(merged.added).toEqual([]);
    }
  });

  it('hàng chờ: không gửi trùng; huỷ việc chưa kịp gửi thì bỏ hết; gửi theo nội dung mới nhất; gắn mã việc trả về', () => {
    const none = () => '';
    let outbox: OutboxOp[] = [];
    outbox = enqueue(outbox, { kind: 'upsert', ref: 'nv-1' }, none);
    outbox = enqueue(outbox, { kind: 'upsert', ref: 'nv-1' }, none);
    outbox = enqueue(outbox, { kind: 'done', ref: 'nv-1', occ: 1, at: 2 }, none);
    outbox = enqueue(outbox, { kind: 'done', ref: 'nv-1', occ: 1, at: 3 }, none);
    expect(outbox.map(op => op.kind)).toEqual(['upsert', 'done']);
    expect(enqueue(outbox, { kind: 'cancel', ref: 'nv-1', taskId: '' }, none)).toEqual([]);
    expect(enqueue(outbox, { kind: 'cancel', ref: 'nv-1', taskId: 'CV004' }, none).map(op => op.kind)).toEqual(['upsert', 'done', 'cancel']);

    const item = reminder({ title: 'Tiêu đề mới nhất' });
    const ops = buildOps(outbox, [item], [], []);
    expect(ops[0]).toMatchObject({ op: 'upsert', ref: 'nv-1', row: { 'Tiêu đề': 'Tiêu đề mới nhất', 'Mức độ': 'Khẩn', 'Âm thanh': 'Đọc chữ', 'Câu đọc': 'Trả hàng lỗi', 'Ngày hạn': { ngay: '2026-11-25' }, 'Giờ hạn': '15:30' } });
    expect(ops[1]).toMatchObject({ op: 'done', ref: 'nv-1', occ: 1, repeat: false });
    expect(buildOps(outbox, [], [], [])).toEqual([{ op: 'done', ref: 'nv-1', id: undefined, occ: 1, at: 2, repeat: false }]);
    const [withId] = applyResults([item], [{ ref: 'nv-1', id: 'CV007' }]);
    expect(withId.source).toEqual({ kind: 'sheet', taskId: 'CV007' });
  });

  it('lần xong ở máy khác (trang Nhật ký) đánh dấu xong ở máy này; việc chỉ có trên máy thì đưa lên được', () => {
    const daily = reminder({ repeat: 'daily', source: { kind: 'sheet', taskId: 'CV002' }, snoozes: [{ occ: at(25, 15, 30), at: at(25, 15, 40) }] });
    const [next] = applyDoneLog([daily], [{ id: 'cv002', occ: at(25, 15, 30), by: 'Linh' }], at(25, 15, 35));
    expect(next.done[String(at(25, 15, 30))]).toBe(at(25, 15, 35));
    expect(next.snoozes).toEqual([]);
    expect(applyDoneLog([next], [{ id: 'CV002', occ: at(25, 15, 30), by: 'Linh' }], at(25, 16))[0]).toBe(next);

    const local = reminder({ id: 'nv-5', source: undefined });
    const finished = reminder({ id: 'nv-6', source: undefined, done: { [String(at(25, 15, 30))]: at(25, 15) } });
    expect(localReminders([local, finished, daily]).map(item => item.id)).toEqual(['nv-5']);
  });

  it('báo cáo checklist: kết quả và chi tiết từng việc', () => {
    const report = runReport({
      id: 'run-1', templateId: 'cl', name: 'Mở ca', date: '2026-11-25', startedAt: at(25, 8), finishedAt: at(25, 8, 40), performer: 'Ngọc', note: 'Thiếu người',
      items: [
        { id: 'a', title: 'Bật đèn', guide: '', required: true, needPhoto: false, needNote: false, status: 'done', note: '', photos: [] },
        { id: 'b', title: 'Kiểm tem', guide: '', required: true, needPhoto: true, needNote: false, status: 'issue', note: '3 tem sai', photos: ['m1'] },
      ],
    });
    expect(report).toMatchObject({ checklist: 'Mở ca', date: '25/11/2026', performer: 'Ngọc', result: '1/2 hoàn tất', issues: '1', todo: '0', note: 'Thiếu người' });
    expect(report.detail).toBe('1. Bật đèn: Hoàn tất\n2. Kiểm tem: Có vấn đề (3 tem sai), 1 ảnh\nCó vấn đề: Kiểm tem');
  });
});
