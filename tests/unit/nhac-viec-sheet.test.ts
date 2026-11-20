import { describe, expect, it } from 'vitest';
import { mergeSheetTasks, parseCsv, parseDeadline, parseSheetTasks, sheetIdFromUrl } from '../../src/features/nhac-viec/sheetTasks';
import { markDone } from '../../src/features/nhac-viec/nhacViecModel';

const HEADER = 'Mã việc,Tiêu đề,Nội dung,Hạn hoàn tất (ngày/tháng/năm giờ:phút),Người xử lý,Mức độ (Thường/Quan trọng/Khẩn),"Nhắc trước (phút, ví dụ 60,15,0)","Lặp lại (Không/Mỗi ngày/Mỗi tháng/T2,T4)",Âm thanh (Chuông reo/Còi báo/Bíp dồn dập/Chuông cửa/Nhạc nhẹ/Đọc chữ),Câu đọc,Trạng thái (Huỷ/Xong),Người giao';
const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).getTime();

describe('Đọc file Google Sheet', () => {
  it('lấy mã file từ link chia sẻ', () => {
    expect(sheetIdFromUrl('https://docs.google.com/spreadsheets/d/1DrQV5W-YitTXIvEXjRfmqNStHy5MqC2AFDnWsOnCXyg/edit?usp=sharing')).toBe('1DrQV5W-YitTXIvEXjRfmqNStHy5MqC2AFDnWsOnCXyg');
    expect(sheetIdFromUrl('https://example.com/abc')).toBeNull();
  });

  it('CSV có ô chứa dấu phẩy, ngoặc kép, xuống dòng', () => {
    expect(parseCsv('a,"b, c","d ""x""",\n"dòng 1\ndòng 2",e\r\n')).toEqual([['a', 'b, c', 'd "x"', ''], ['dòng 1\ndòng 2', 'e']]);
  });

  it('hạn: ngày/tháng/năm, chỉ có ngày thì 17:00, kiểu Mỹ tháng/ngày, năm-tháng-ngày; sai thì null', () => {
    expect(parseDeadline('25/11/2026 15:30')).toBe(new Date(2026, 10, 25, 15, 30).getTime());
    expect(parseDeadline('25/11/2026 15:30:00')).toBe(new Date(2026, 10, 25, 15, 30).getTime());
    expect(parseDeadline('25/11/2026')).toBe(new Date(2026, 10, 25, 17, 0).getTime());
    expect(parseDeadline('11/25/2026 3:30 PM')).toBe(new Date(2026, 10, 25, 15, 30).getTime());
    expect(parseDeadline('2026-11-25 08:00')).toBe(new Date(2026, 10, 25, 8, 0).getTime());
    expect(parseDeadline('31/02/2026')).toBeNull();
    expect(parseDeadline('mai')).toBeNull();
  });

  it('đọc từng cột theo tiêu đề; bỏ dòng chưa có tiêu đề; báo dòng sai hạn và mã trùng', () => {
    const csv = [
      HEADER,
      'CV001,Kiểm hàng chuyển kho,"Đối chiếu, gửi báo cáo",25/11/2026 15:30,Ngọc - 11443,Khẩn,"60, 15, 0",T2 T6,Đọc chữ,Kiểm tra gấp,,QL Sơn',
      'CV002,Rút thăm 19h,,25/11/2026 19:00,,Quan trọng,,Mỗi ngày,Còi báo,,,',
      'CV003,,,,,,,,,,,',
      'CV004,Việc sai hạn,,mai,,,,,,,,',
      'CV002,Trùng mã,,25/11/2026,,,,,,,,',
      'CV005,Việc huỷ,,25/11/2026,,,,,,,Huỷ,',
    ].join('\n');
    const { tasks, skipped, badHeader } = parseSheetTasks(csv);
    expect(badHeader).toBe(false);
    expect(tasks.map(task => task.id)).toEqual(['CV001', 'CV002', 'CV005']);
    expect(tasks[0]).toMatchObject({
      title: 'Kiểm hàng chuyển kho', content: 'Đối chiếu, gửi báo cáo', deadline: at(25, 15, 30), assignee: 'Ngọc - 11443', assigner: 'QL Sơn',
      priority: 'urgent', remindBefore: [60, 15, 0], repeat: 'weekly', weekdays: [1, 5], sound: { kind: 'tts', text: 'Kiểm tra gấp' }, status: 'active',
    });
    expect(tasks[1]).toMatchObject({ priority: 'important', remindBefore: [15, 0], repeat: 'daily', sound: { kind: 'preset', preset: 'coi' } });
    expect(tasks[2].status).toBe('cancelled');
    expect(skipped).toEqual([
      { row: 5, reason: 'Hạn "mai" không đúng dạng ngày/tháng/năm giờ:phút' },
      { row: 6, reason: 'Mã việc CV002 bị trùng' },
    ]);
    expect(parseSheetTasks('a,b\n1,2').badHeader).toBe(true);
  });
});

describe('Ghép vào danh sách nhắc việc', () => {
  const sheet = (rows: string[]) => parseSheetTasks([HEADER, ...rows].join('\n')).tasks;

  it('việc mới thì thêm và báo; việc sửa thì cập nhật, giữ đã xong; việc huỷ hoặc bị xoá thì bỏ; ghi Xong thì đánh dấu xong', () => {
    const first = mergeSheetTasks([], sheet([
      'CV001,Kiểm hàng,,25/11/2026 15:30,Ngọc,,,,,,,QL',
      'CV002,Rút thăm,,25/11/2026 19:00,,,,,,,,',
    ]), at(20, 8));
    expect(first.added.map(item => item.title)).toEqual(['Kiểm hàng', 'Rút thăm']);
    expect(first.reminders.find(item => item.id === 'gs-CV001')).toMatchObject({ assignee: 'Ngọc', assigner: 'QL', source: { kind: 'sheet', taskId: 'CV001' }, armedAt: at(20, 8) });

    // Đã bấm xong CV002 trong app; quản lý sửa nội dung CV002 và đổi giờ CV001; thêm CV003
    let list = first.reminders.map(item => (item.id === 'gs-CV002' ? markDone(item, item.deadline, at(20, 9)) : item));
    const second = mergeSheetTasks(list, sheet([
      'CV001,Kiểm hàng,,25/11/2026 16:00,Ngọc,,,,,,,QL',
      'CV002,Rút thăm,Chuẩn bị quà,25/11/2026 19:00,,,,,,,,',
      'CV003,Gọi khách,,26/11/2026,,,,,,,,',
    ]), at(20, 10));
    expect(second.added.map(item => item.id)).toEqual(['gs-CV003']);
    expect(second.updated).toBe(2);
    const cv1 = second.reminders.find(item => item.id === 'gs-CV001')!;
    expect(cv1.deadline).toBe(at(25, 16));
    expect(cv1.armedAt).toBe(at(20, 10));
    const cv2 = second.reminders.find(item => item.id === 'gs-CV002')!;
    expect(cv2.content).toBe('Chuẩn bị quà');
    expect(cv2.done[String(at(25, 19))]).toBe(at(20, 9));
    expect(cv2.armedAt).toBe(at(20, 8));

    // Không đổi gì thì không cập nhật
    expect(mergeSheetTasks(second.reminders, sheet([
      'CV001,Kiểm hàng,,25/11/2026 16:00,Ngọc,,,,,,,QL',
      'CV002,Rút thăm,Chuẩn bị quà,25/11/2026 19:00,,,,,,,,',
      'CV003,Gọi khách,,26/11/2026,,,,,,,,',
    ]), at(20, 11))).toMatchObject({ added: [], updated: 0, removed: 0 });

    // CV001 huỷ, CV002 bị xoá khỏi file, CV003 ghi Xong; nhắc việc tự tạo trong app thì giữ nguyên
    list = [...second.reminders, { ...second.reminders[0], id: 'tu-tao', source: undefined }];
    const third = mergeSheetTasks(list, sheet([
      'CV001,Kiểm hàng,,25/11/2026 16:00,Ngọc,,,,,,Huỷ,QL',
      'CV003,Gọi khách,,26/11/2026,,,,,,,Xong,',
    ]), at(20, 12));
    expect(third.removed).toBe(2);
    expect(third.reminders.map(item => item.id).sort()).toEqual(['gs-CV003', 'tu-tao']);
    expect(third.reminders.find(item => item.id === 'gs-CV003')!.done[String(at(26, 17))]).toBe(at(20, 12));
  });
});

describe('File mẫu mới (Nhắc việc và Checklist, chọn từ danh sách)', () => {
  const taskHeader = ['Mã việc', 'Tiêu đề', 'Nội dung', 'Ngày hạn', 'Giờ hạn', 'Người xử lý', 'Mức độ', 'Nhắc trước', 'Lặp lại', 'Âm thanh', 'Câu đọc', 'Checklist', 'Trạng thái', 'Người giao'];
  const checklistHeader = ['Tên checklist', 'Việc', 'Hướng dẫn', 'Bắt buộc', 'Cần ảnh', 'Cần ghi chú', 'Lịch làm', 'Giờ bắt đầu', 'Giờ hạn', 'Người làm', 'Trạng thái'];

  it('ngày và giờ tách cột; nhắc trước có đơn vị; lặp theo khoảng thứ; gắn checklist; Đang giao là việc đang làm', async () => {
    const { parseBefore, parseTaskRows, parseWeekdays } = await import('../../src/features/nhac-viec/sheetTasks');
    expect(parseBefore('1 giờ + 15 phút + đúng hạn')).toEqual([60, 15, 0]);
    expect(parseBefore('1 ngày + 1 giờ + đúng hạn')).toEqual([1440, 60, 0]);
    expect(parseBefore('15 phút trước')).toEqual([15]);
    expect(parseBefore('')).toEqual([15, 0]);
    expect(parseWeekdays('t2 - t6')).toEqual([1, 2, 3, 4, 5]);
    expect(parseWeekdays('t7 - cn')).toEqual([6, 0]);
    const { tasks, skipped } = parseTaskRows([
      taskHeader,
      ['CV001', 'Mở ca', '', '25/11/2026', '07:45', 'Ngọc - 11443', 'Quan trọng', '1 giờ + 15 phút + đúng hạn', 'T2 - T6', 'Đọc chữ', '', 'Mở ca sáng', 'Đang giao', 'QL Sơn'],
      ['CV002', 'Không giờ', '', '26/11/2026', '', '', '', '', 'Mỗi tuần', '', '', '', '', ''],
      ['CV003', 'Thiếu ngày', '', '', '08:00', '', '', '', '', '', '', '', '', ''],
      ['CV004', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ]);
    expect(tasks[0]).toMatchObject({
      deadline: at(25, 7, 45), priority: 'important', remindBefore: [60, 15, 0], repeat: 'weekly', weekdays: [1, 2, 3, 4, 5],
      sound: { kind: 'tts', text: '' }, checklist: 'Mở ca sáng', status: 'active', assignee: 'Ngọc - 11443', assigner: 'QL Sơn',
    });
    expect(tasks[1]).toMatchObject({ deadline: at(26, 17), repeat: 'weekly', weekdays: [] });
    expect(skipped).toEqual([{ row: 4, reason: 'Hạn "08:00" không đúng dạng ngày/tháng/năm giờ:phút' }]);
  });

  it('trang Checklist: các dòng cùng tên là một checklist; ô tick; lịch, giờ, người làm ở dòng đầu; Ngưng thì bỏ', async () => {
    const { checklistIdFor, mergeSheetChecklists, parseChecklistRows } = await import('../../src/features/nhac-viec/sheetTasks');
    const { checklists, skipped } = parseChecklistRows([
      checklistHeader,
      ['Mở ca sáng', 'Bật đèn, máy lạnh', '', 'TRUE', 'FALSE', 'FALSE', 'Mỗi ngày', '08:00', '09:00', 'Ngọc', 'Đang dùng'],
      ['Mở ca sáng', 'Kiểm tem giá', 'Khu điện thoại', 'TRUE', 'TRUE', 'FALSE', '', '', '', '', ''],
      ['Đóng ca', 'Tắt điện', '', 'FALSE', 'FALSE', 'TRUE', 'T2 - T6', '21:30', '22:00', '', ''],
      ['Kiểm kê tháng', 'Đếm kho', '', 'TRUE', 'FALSE', 'FALSE', '', '', '', '', 'Ngưng'],
      ['Đóng ca', '', '', 'FALSE', 'FALSE', 'FALSE', '', '', '', '', ''],
    ]);
    expect(checklists.map(item => [item.name, item.items.length, item.stopped])).toEqual([['Mở ca sáng', 2, false], ['Đóng ca', 1, false], ['Kiểm kê tháng', 1, true]]);
    expect(checklists[0]).toMatchObject({
      id: checklistIdFor('Mở ca sáng'),
      assignee: 'Ngọc',
      schedule: { enabled: true, days: [0, 1, 2, 3, 4, 5, 6], start: '08:00', due: '09:00' },
    });
    expect(checklists[0].items[1]).toMatchObject({ title: 'Kiểm tem giá', guide: 'Khu điện thoại', required: true, needPhoto: true, needNote: false });
    expect(checklists[1].schedule).toEqual({ enabled: true, days: [1, 2, 3, 4, 5], start: '21:30', due: '22:00' });
    expect(skipped).toEqual([{ row: 6, reason: 'Checklist Đóng ca: dòng chưa ghi việc' }]);

    const own = { id: 'tu-tao', name: 'Tự tạo', description: '', items: [], schedule: { enabled: false, days: [], start: '08:00', due: '09:00' }, createdAt: 1, updatedAt: 1 };
    const first = mergeSheetChecklists([own], checklists, at(20, 8));
    expect(first.templates.map(item => item.name)).toEqual(['Tự tạo', 'Mở ca sáng', 'Đóng ca']);
    expect(first.added).toBe(2);
    // Đọc lại không đổi gì thì không ghi
    expect(mergeSheetChecklists(first.templates, checklists, at(20, 9)).changed).toBe(false);
    // Bỏ Đóng ca khỏi file: mẫu đó bị bỏ, mẫu tự tạo giữ nguyên
    const second = mergeSheetChecklists(first.templates, checklists.filter(item => item.name !== 'Đóng ca'), at(20, 10));
    expect(second.templates.map(item => item.name)).toEqual(['Tự tạo', 'Mở ca sáng']);
  });

  it('đọc cả file theo tên trang; việc gắn checklist trỏ tới mẫu checklist từ file', async () => {
    const { checklistIdFor, mergeSheetTasks, readSheetTables } = await import('../../src/features/nhac-viec/sheetTasks');
    const result = readSheetTables([
      { name: 'Hướng dẫn', rows: [['HƯỚNG DẪN']] },
      { name: 'Checklist', rows: [checklistHeader, ['Mở ca sáng', 'Bật đèn', '', 'TRUE', '', '', 'Mỗi ngày', '08:00', '09:00', '', '']] },
      { name: 'Nhắc việc', rows: [taskHeader, ['CV001', 'Mở ca', '', '25/11/2026', '07:45', '', '', '', '', '', '', 'Mở ca sáng', '', '']] },
    ]);
    expect(result.badHeader).toBe(false);
    expect(result.tasks).toHaveLength(1);
    expect(result.checklists).toHaveLength(1);
    const merged = mergeSheetTasks([], result.tasks, at(20, 8));
    expect(merged.added[0].checklistTemplateId).toBe(checklistIdFor('Mở ca sáng'));
    expect(readSheetTables([{ name: 'Trang 1', rows: [['a', 'b']] }]).badHeader).toBe(true);
  });
});
