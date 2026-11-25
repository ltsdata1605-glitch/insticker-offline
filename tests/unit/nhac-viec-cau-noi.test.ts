import { describe, expect, it } from 'vitest';
import { FakeBridge } from '../e2e/cau-noi-gia';
import type { Reminder } from '../../src/features/nhac-viec/nhacViecModel';
import { personStats, ringsHere, shownHere, watchedHere } from '../../src/features/nhac-viec/nhacViecModel';
import { mergeSheetTasks, readSheetTables } from '../../src/features/nhac-viec/sheetTasks';
import {
  adoptTemplate, applyDoneLog, applyEvents, applyResults, beforeText, bridgeLinkFrom, buildOps, checklistRows, enqueue, localReminders, reminderToRow, repeatCellText, runReport,
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
    const kho = bridge.core.cnDongTuForm_({ tieuDe: 'Nhập hàng', ngay: '2026-11-26', boPhan: 'Kho', khiXong: 'Ảnh' });
    expect(kho).toMatchObject({ 'Bộ phận': 'Kho', 'Khi xong cần': 'Ảnh' });
  });

  it('Đã nhận, Cần hỗ trợ ghi ô của việc và Nhật ký (kèm lý do, link ảnh, bộ phận); gửi lại không ghi trùng; xong thì xoá ô Cần hỗ trợ', () => {
    const bridge = new FakeBridge(2);
    bridge.setTask('CV001', { 'Tiêu đề': 'Nhập hàng Samsung', 'Bộ phận': 'Kho', 'Trạng thái': 'Đang giao' });
    const occ = at(25, 15);
    const ack = { op: 'ack', ref: 'r1', id: 'CV001', occ, at: at(25, 14, 5) };
    bridge.apply([ack, ack], 'Linh');
    expect(bridge.task('CV001')['Đã nhận']).toBe('Linh · 25/11/2026 14:05');
    const help = { op: 'help', ref: 'r1', id: 'CV001', occ, at: at(25, 14, 30), note: 'Xe chưa tới', photos: [{ name: 'xe.jpg', data: Buffer.from('anh').toString('base64') }] };
    bridge.apply([help], 'Linh');
    bridge.apply([{ ...help, photos: undefined }], 'Linh');
    expect(bridge.task('CV001')['Cần hỗ trợ']).toBe('Linh · 25/11/2026 14:30: Xe chưa tới');
    expect(bridge.photos).toEqual([{ name: 'xe.jpg', bytes: 3 }]);
    bridge.apply([{ op: 'done', ref: 'r1', id: 'CV001', occ, at: at(25, 15, 10), repeat: false, note: 'Đã nhập đủ', photos: [{ name: 'kho.jpg', data: 'YQ==' }] }], 'Linh');
    expect(bridge.task('CV001')).toMatchObject({ 'Trạng thái': 'Xong', 'Cần hỗ trợ': '', 'Người xong': 'Linh' });
    expect(bridge.nhatKy.map(row => [row[1], row[4], row[6], row[7], row[9]])).toEqual([
      ['CV001', 'Linh', 'Đã nhận', '', 'Kho'],
      ['CV001', 'Linh', 'Cần hỗ trợ', 'Xe chưa tới', 'Kho'],
      ['CV001', 'Linh', 'Xong', 'Đã nhập đủ', 'Kho'],
    ]);
    // Lần xong cho bản app cũ chỉ gồm dòng Xong; sự kiện cho bản mới gồm cả Đã nhận, Cần hỗ trợ, kèm link ảnh
    expect(bridge.core.cnLanXong_(bridge.nhatKy, 0)).toEqual([{ id: 'CV001', occ, by: 'Linh' }]);
    const events = bridge.core.cnSuKien_(bridge.nhatKy, 0);
    expect(events.map(event => [event.loai, event.by, event.at, event.note, event.anh.length])).toEqual([
      ['nhan', 'Linh', at(25, 14, 5), '', 0], ['hotro', 'Linh', at(25, 14, 30), 'Xe chưa tới', 1], ['xong', 'Linh', at(25, 15, 10), 'Đã nhập đủ', 1],
    ]);
    expect(events[1].anh[0]).toMatch(/^https:\/\/drive\.google\.com\//);
  });

  it('checklist từ app: ghi dòng mới; sửa và đổi tên ghi đè đúng các dòng cũ, bớt việc thì xoá trắng dòng thừa; ngưng ghi Ngưng', () => {
    const bridge = new FakeBridge(1);
    bridge.checklist.push(['Đóng ca', 'Tắt đèn', '', 'TRUE', 'FALSE', 'FALSE', 'Mỗi ngày', '21:00', '22:00', '', 'Đang dùng', '']);
    const rows = (name: string, titles: string[]) => titles.map((title, n) => ({
      'Tên checklist': name, 'Việc': title, 'Hướng dẫn': '', 'Bắt buộc': n === 0, 'Cần ảnh': n === 1, 'Cần ghi chú': false,
      ...(n === 0 ? { 'Lịch làm': 'T2 - T6', 'Giờ bắt đầu': '08:00', 'Giờ hạn': '09:00', 'Người làm': 'Linh', 'Trạng thái': 'Đang dùng', 'Bộ phận': 'Kho' } : {}),
    }));
    bridge.apply([{ op: 'checklist', ref: 'tpl-1', name: 'Mở kho', rows: rows('Mở kho', ['Mở cửa kho', 'Chụp ảnh kệ', 'Đếm pallet']) }], 'Linh');
    expect(bridge.checklist.slice(1).map(row => [row[0], row[1], row[3], row[4], row[6], row[11]])).toEqual([
      ['Đóng ca', 'Tắt đèn', 'TRUE', 'FALSE', 'Mỗi ngày', ''],
      ['Mở kho', 'Mở cửa kho', 'TRUE', 'FALSE', 'T2 - T6', 'Kho'],
      ['Mở kho', 'Chụp ảnh kệ', 'FALSE', 'TRUE', '', ''],
      ['Mở kho', 'Đếm pallet', 'FALSE', 'FALSE', '', ''],
    ]);
    // Đổi tên, bớt một việc
    bridge.apply([{ op: 'checklist', ref: 'tpl-1', name: 'Mở kho sáng', from: 'Mở kho', rows: rows('Mở kho sáng', ['Mở cửa kho', 'Chụp ảnh kệ']) }], 'Linh');
    expect(bridge.checklist.slice(1).map(row => row.slice(0, 2))).toEqual([['Đóng ca', 'Tắt đèn'], ['Mở kho sáng', 'Mở cửa kho'], ['Mở kho sáng', 'Chụp ảnh kệ'], ['', '']]);
    // Thêm việc thì dùng lại dòng trống
    bridge.apply([{ op: 'checklist', ref: 'tpl-1', name: 'Mở kho sáng', rows: rows('Mở kho sáng', ['Mở cửa kho', 'Chụp ảnh kệ', 'Bật quạt']) }], 'Linh');
    expect(bridge.checklist).toHaveLength(5);
    expect(bridge.checklist[4].slice(0, 2)).toEqual(['Mở kho sáng', 'Bật quạt']);
    bridge.apply([{ op: 'checklist-stop', ref: 'tpl-1', name: 'Mở kho sáng' }], 'Linh');
    expect(bridge.checklist.slice(2).map(row => row[10])).toEqual(['Ngưng', 'Ngưng', 'Ngưng']);
    expect(bridge.checklist[1][10]).toBe('Đang dùng');
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

describe('Bộ phận, Đã nhận, Cần hỗ trợ, thống kê theo người', () => {
  const kho = { department: 'Kho', performer: 'Linh' };
  const quanLy = { department: 'Quản lý', performer: 'QL Sơn' };
  const moi = { department: '', performer: '' };

  it('máy bộ phận chỉ nhắc việc của bộ phận, việc chung và việc giao cho mình; máy quản lý thấy hết, theo dõi việc bộ phận khác', () => {
    expect(ringsHere({ department: 'Kho' }, kho)).toBe(true);
    expect(ringsHere({ department: 'kho ' }, kho)).toBe(true);
    expect(ringsHere({}, kho)).toBe(true);
    expect(ringsHere({ department: 'Thu ngân' }, kho)).toBe(false);
    expect(ringsHere({ department: 'Thu ngân', assignee: 'linh' }, kho)).toBe(true);
    expect(ringsHere({ department: 'Thu ngân' }, moi)).toBe(true);
    expect(shownHere({ department: 'Thu ngân' }, kho)).toBe(false);
    expect(shownHere({ department: 'Thu ngân' }, quanLy)).toBe(true);
    expect(ringsHere({ department: 'Thu ngân' }, quanLy)).toBe(false);
    expect(watchedHere(reminder({ department: 'Thu ngân', assignee: 'Minh', assigner: 'Ai đó' }), quanLy)).toBe(true);
    expect(watchedHere(reminder({ department: 'Quản lý', assignee: '', assigner: '' }), quanLy)).toBe(false);
    // Người giao theo dõi việc mình giao cho người khác
    expect(watchedHere(reminder({ department: undefined, assignee: 'Minh', assigner: 'Linh' }), kho)).toBe(true);
    expect(watchedHere(reminder({ department: undefined, assignee: 'Linh', assigner: 'Linh' }), kho)).toBe(false);
  });

  it('Nhật ký ghép vào việc: người nhận sớm nhất, lần cần hỗ trợ mới nhất, người xong kèm link ảnh; lần của chính máy chỉ thêm link', () => {
    const occ = at(25, 15);
    const base = reminder({ source: { kind: 'sheet', taskId: 'CV001' }, helps: { [occ]: { by: 'Linh', at: at(25, 14, 30), note: 'Xe chưa tới', photos: ['m-1'] } } });
    const events = [
      { id: 'CV001', occ, loai: 'nhan' as const, by: 'Minh', at: at(25, 14, 10), note: '', anh: [] },
      { id: 'CV001', occ, loai: 'nhan' as const, by: 'Linh', at: at(25, 14, 20), note: '', anh: [] },
      { id: 'cv001', occ, loai: 'hotro' as const, by: 'Linh', at: at(25, 14, 30), note: 'Xe chưa tới', anh: ['https://drive.google.com/file/d/abc/view'] },
      { id: 'CV001', occ, loai: 'xong' as const, by: 'Minh', at: at(25, 15, 5), note: 'Đủ hàng', anh: [] },
    ];
    const [merged] = applyEvents([base], events);
    expect(merged.acks?.[occ]).toEqual({ by: 'Minh', at: at(25, 14, 10) });
    expect(merged.helps?.[occ]).toEqual({ by: 'Linh', at: at(25, 14, 30), note: 'Xe chưa tới', photos: ['m-1'], links: ['https://drive.google.com/file/d/abc/view'] });
    expect(merged.doneInfo?.[occ]).toEqual({ by: 'Minh', at: at(25, 15, 5), note: 'Đủ hàng' });
    // Đọc lại cùng Nhật ký: không đổi gì
    expect(applyEvents([merged], events)[0]).toBe(merged);
  });

  it('gửi lên: Đã nhận, Cần hỗ trợ kèm lý do và ảnh, xong kèm ghi chú; script bản cũ thì không gửi', () => {
    const occ = at(25, 15);
    const task = reminder({
      source: { kind: 'sheet', taskId: 'CV001' },
      helps: { [occ]: { by: 'Linh', at: at(25, 14, 30), note: 'Xe chưa tới', photos: ['m-1'] } },
      doneInfo: { [occ]: { by: 'Linh', at: at(25, 15, 1), note: 'Đủ hàng' } },
    });
    const outbox: OutboxOp[] = [
      { id: 'a', kind: 'ack', ref: 'nv-1', occ, at: at(25, 14) },
      { id: 'b', kind: 'help', ref: 'nv-1', occ, at: at(25, 14, 30) },
      { id: 'c', kind: 'done', ref: 'nv-1', occ, at: at(25, 15, 1) },
    ];
    const photo = (id: string) => (id === 'm-1' ? 'data:image/jpeg;base64,QUJD' : null);
    expect(buildOps(outbox, [task], [], [], { version: 2, photo })).toEqual([
      { op: 'ack', ref: 'nv-1', id: 'CV001', occ, at: at(25, 14) },
      { op: 'help', ref: 'nv-1', id: 'CV001', occ, at: at(25, 14, 30), note: 'Xe chưa tới', photos: [{ name: 'anh-1.jpg', data: 'QUJD' }] },
      { op: 'done', ref: 'nv-1', id: 'CV001', occ, at: at(25, 15, 1), repeat: false, note: 'Đủ hàng' },
    ]);
    expect(buildOps(outbox, [task], [], [], { version: 1, photo })).toEqual([{ op: 'done', ref: 'nv-1', id: 'CV001', occ, at: at(25, 15, 1), repeat: false }]);
    expect(enqueue(outbox, { kind: 'ack', ref: 'nv-1', occ, at: at(25, 14, 5) }, () => 'CV001')).toBe(outbox);
  });

  it('checklist lên file: mã theo tên, mã việc theo thứ tự, lịch ghi đúng chữ của file', () => {
    const template = {
      id: 'cl-1', name: 'Mở kho', description: '', createdAt: 0, updatedAt: 0, department: 'Kho',
      items: [{ id: 'i-a', title: 'Mở cửa', guide: '', required: true, needPhoto: false, needNote: false }, { id: 'i-b', title: 'Chụp kệ', guide: 'Chụp cả 3 tầng', required: false, needPhoto: true, needNote: false }],
      schedule: { enabled: true, days: [1, 2, 3, 4, 5], start: '07:30', due: '08:00' },
    };
    const { template: adopted, itemIds } = adoptTemplate(template);
    expect(adopted.id).toBe('gs-cl-mo-kho');
    expect(adopted.source).toEqual({ kind: 'sheet' });
    expect([...itemIds]).toEqual([['i-a', 'gs-cl-mo-kho-1'], ['i-b', 'gs-cl-mo-kho-2']]);
    const rows = checklistRows(adopted);
    expect(rows[0]).toMatchObject({ 'Tên checklist': 'Mở kho', 'Việc': 'Mở cửa', 'Bắt buộc': true, 'Lịch làm': 'T2 - T6', 'Giờ bắt đầu': '07:30', 'Giờ hạn': '08:00', 'Bộ phận': 'Kho', 'Trạng thái': 'Đang dùng' });
    expect(rows[1]).toMatchObject({ 'Việc': 'Chụp kệ', 'Hướng dẫn': 'Chụp cả 3 tầng', 'Cần ảnh': true, 'Lịch làm': '', 'Bộ phận': '' });
    // Ghi lên file rồi đọc về: cùng mã, cùng việc, cùng lịch
    const bridge = new FakeBridge(1);
    bridge.apply([{ op: 'checklist', ref: adopted.id, name: adopted.name, rows }], 'Linh');
    const read = readSheetTables([{ name: 'Checklist', rows: bridge.checklist }]).checklists[0];
    expect(read).toMatchObject({ id: adopted.id, department: 'Kho', schedule: template.schedule });
    expect(read.items).toEqual(adopted.items);
  });

  it('thống kê theo người: người xử lý, không giao đích danh thì người bấm xong, chưa ai xong thì bộ phận', () => {
    const daily = (overrides: Partial<Reminder>) => reminder({ repeat: 'daily', deadline: at(20, 9), createdAt: at(19, 8), ...overrides });
    const list = [
      daily({ id: 'a', assignee: 'Minh', done: { [at(21, 9)]: at(21, 8, 50), [at(22, 9)]: at(22, 9, 30) }, acks: { [at(21, 9)]: { by: 'Minh', at: at(21, 8) } } }),
      daily({ id: 'b', assignee: '', department: 'Kho', done: { [at(21, 9)]: at(21, 9) }, doneInfo: { [at(21, 9)]: { by: 'Linh', at: at(21, 9) } }, helps: { [at(22, 9)]: { by: 'Linh', at: at(22, 8) } } }),
    ];
    const stats = personStats(list, at(21, 0), at(22, 12));
    expect(stats).toEqual([
      { name: 'Minh', total: 2, acked: 1, onTime: 1, late: 1, open: 0, help: 0 },
      { name: 'Bộ phận Kho', total: 1, acked: 0, onTime: 0, late: 0, open: 1, help: 1 },
      { name: 'Linh', total: 1, acked: 0, onTime: 1, late: 0, open: 0, help: 0 },
    ]);
  });
});

