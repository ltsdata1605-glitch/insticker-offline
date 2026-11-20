import { describe, expect, it } from 'vitest';
import {
  MINUTE, checklistAlerts, markDone, markFired, occurrencesBetween, pendingAlerts, reminderView, repeatText, runProgress,
  runReportText, snooze, startRun, statsBetween,
} from '../../src/features/nhac-viec/nhacViecModel';
import type { ChecklistTemplate, Reminder } from '../../src/features/nhac-viec/nhacViecModel';

const at = (d: number, h: number, m = 0, month = 10) => new Date(2026, month, d, h, m).getTime();

const reminder = (overrides: Partial<Reminder> = {}): Reminder => ({
  id: 'r1', title: 'Kiểm hàng chuyển kho', content: '', deadline: at(20, 10), remindBefore: [15, 0], repeat: 'none', weekdays: [],
  priority: 'normal', sound: { kind: 'preset', preset: 'chuong' }, createdAt: at(20, 8), updatedAt: at(20, 8), armedAt: at(20, 8),
  done: {}, fired: {}, snoozes: [], ...overrides,
});

describe('Lần hạn lặp lại', () => {
  it('mỗi ngày, theo thứ trong tuần, mỗi tháng (tháng ngắn lấy ngày cuối tháng)', () => {
    const daily = reminder({ repeat: 'daily' });
    expect(occurrencesBetween(daily, at(19, 0), at(22, 23)).map(ms => new Date(ms).getDate())).toEqual([20, 21, 22]);
    // 20/11/2026 là thứ Sáu. Lặp T2, T6
    const weekly = reminder({ repeat: 'weekly', weekdays: [1, 5] });
    expect(occurrencesBetween(weekly, at(20, 0), at(30, 23)).map(ms => new Date(ms).getDate())).toEqual([20, 23, 27, 30]);
    expect(repeatText(weekly)).toBe('Mỗi tuần: T2, T6');
    const monthly = reminder({ repeat: 'monthly', deadline: new Date(2027, 0, 31, 9).getTime() });
    expect(occurrencesBetween(monthly, new Date(2027, 0, 1).getTime(), new Date(2027, 3, 30, 23, 59).getTime()).map(ms => new Date(ms).toDateString()))
      .toEqual(['Sun Jan 31 2027', 'Sun Feb 28 2027', 'Wed Mar 31 2027', 'Fri Apr 30 2027']);
  });
});

describe('Nhắc đến giờ', () => {
  it('nhắc trước 15 phút rồi đúng hạn; bấm Đã xong thì thôi nhắc', () => {
    let r = reminder();
    expect(pendingAlerts([r], at(20, 9, 40)).due).toEqual([]);
    const early = pendingAlerts([r], at(20, 9, 45)).due;
    expect(early.map(alert => alert.kind)).toEqual(['before']);
    r = markFired(r, early[0].occ, at(20, 9, 45));
    expect(pendingAlerts([r], at(20, 9, 50)).due).toEqual([]);
    const due = pendingAlerts([r], at(20, 10, 0)).due;
    expect(due.map(alert => alert.kind)).toEqual(['due']);
    r = markDone(r, due[0].occ, at(20, 10, 1));
    expect(pendingAlerts([r], at(20, 11)).due).toEqual([]);
    expect(reminderView(r, at(20, 11)).state).toBe('done');
  });

  it('app tắt lúc đến giờ: mở lại thì báo nhắc bị lỡ, không bật cửa sổ', () => {
    const { due, missed } = pendingAlerts([reminder()], at(20, 12));
    expect(due).toEqual([]);
    expect(missed.map(alert => alert.kind)).toEqual(['due']);
  });

  it('sửa giờ thì các mốc trước lúc sửa không bật lại', () => {
    const r = reminder({ armedAt: at(20, 9, 50) });
    expect(pendingAlerts([r], at(20, 9, 55)).due).toEqual([]);
    expect(pendingAlerts([r], at(20, 10)).due.map(alert => alert.kind)).toEqual(['due']);
  });

  it('hoãn 10 phút thì nhắc lại đúng lúc đó', () => {
    let r = reminder();
    r = snooze(r, r.deadline, 10, at(20, 10, 1));
    expect(pendingAlerts([r], at(20, 10, 5)).due).toEqual([]);
    expect(pendingAlerts([r], at(20, 10, 11)).due.map(alert => alert.kind)).toEqual(['snooze']);
  });

  it('việc khẩn quá hạn chưa xong: nhắc lại mỗi 10 phút', () => {
    let r = reminder({ priority: 'urgent' });
    r = markFired(r, r.deadline, at(20, 10));
    expect(pendingAlerts([r], at(20, 10, 9)).due).toEqual([]);
    const nag = pendingAlerts([r], at(20, 10, 10)).due;
    expect(nag.map(alert => alert.kind)).toEqual(['nag']);
    r = markFired(r, r.deadline, at(20, 10, 10));
    expect(pendingAlerts([r], at(20, 10, 15)).due).toEqual([]);
    expect(pendingAlerts([r], at(20, 10, 20)).due.map(alert => alert.kind)).toEqual(['nag']);
  });

  it('trạng thái danh sách: quá hạn, hôm nay, sắp tới; nhắc lặp lại đã xong hôm nay thì chuyển sang lần tới', () => {
    expect(reminderView(reminder(), at(20, 11)).state).toBe('overdue');
    expect(reminderView(reminder(), at(20, 9)).state).toBe('today');
    expect(reminderView(reminder(), at(19, 9)).state).toBe('upcoming');
    let daily = reminder({ repeat: 'daily' });
    daily = markDone(daily, at(20, 10), at(20, 10, 5));
    const view = reminderView(daily, at(20, 11));
    expect(view.state).toBe('done');
    expect(view.occ).toBe(at(21, 10));
  });
});

const template: ChecklistTemplate = {
  id: 't1', name: 'Mở ca sáng', description: '', createdAt: at(1, 8), updatedAt: at(1, 8),
  schedule: { enabled: true, days: [0, 1, 2, 3, 4, 5, 6], start: '08:00', due: '09:00' },
  items: [
    { id: 'i1', title: 'Bật đèn, máy lạnh', guide: '', required: true, needPhoto: false, needNote: false },
    { id: 'i2', title: 'Kiểm tem giá khu điện thoại', guide: '', required: true, needPhoto: true, needNote: false },
    { id: 'i3', title: 'Đếm tiền quỹ', guide: '', required: true, needPhoto: false, needNote: true },
    { id: 'i4', title: 'Vệ sinh tủ lạnh trưng bày', guide: '', required: false, needPhoto: false, needNote: false },
  ],
};

describe('Checklist', () => {
  it('tiến độ, việc bắt buộc còn thiếu, thiếu ảnh hoặc ghi chú', () => {
    const run = startRun(template, at(20, 8, 5), 'Ngọc');
    expect(run.deadline).toBe(at(20, 9));
    run.items[0] = { ...run.items[0], status: 'done', doneAt: at(20, 8, 10) };
    run.items[1] = { ...run.items[1], status: 'issue', note: '3 tem sai giá, đã in lại' };
    run.items[3] = { ...run.items[3], status: 'na', note: 'Tủ đang bảo trì' };
    const progress = runProgress(run);
    expect(progress).toMatchObject({ total: 4, done: 1, issue: 1, na: 1, todo: 1, requiredTodo: 1, percent: 75 });
    expect(progress.missingEvidence.map(item => item.id)).toEqual(['i2']);
  });

  it('báo cáo dạng chữ có từng việc, trạng thái, ghi chú, ảnh và đúng hạn hay trễ', () => {
    const run = startRun(template, at(20, 8, 5), 'Ngọc');
    run.items = run.items.map((item, index) => ({ ...item, status: index === 1 ? 'issue' : 'done', doneAt: at(20, 8, 10 + index), note: index === 1 ? '3 tem sai giá' : '', photos: index === 1 ? ['m1', 'm2'] : [] }));
    run.finishedAt = at(20, 9, 20);
    const text = runReportText(run, at(20, 9, 30));
    expect(text).toContain('BÁO CÁO CHECKLIST: MỞ CA SÁNG');
    expect(text).toContain('Ngày 20/11/2026 · Người làm: Ngọc');
    expect(text).toContain('Bắt đầu 08:05 · Hoàn tất 09:20 · Hạn 09:00');
    expect(text).toContain('Kết quả: 3/4 hoàn tất, 1 có vấn đề · TRỄ HẠN');
    expect(text).toContain('[!] 2. Kiểm tem giá khu điện thoại - Có vấn đề (08:11)');
    expect(text).toContain('    Ghi chú: 3 tem sai giá');
    expect(text).toContain('    2 ảnh');
  });

  it('nhắc lúc bắt đầu, 15 phút trước hạn và lúc hạn nếu chưa hoàn tất', () => {
    expect(checklistAlerts([template], [], {}, at(20, 8)).due.map(alert => alert.kind)).toEqual(['start']);
    const run = startRun(template, at(20, 8, 2), '');
    expect(checklistAlerts([template], [run], {}, at(20, 8, 46)).due.map(alert => alert.kind)).toEqual(['due']);
    expect(checklistAlerts([template], [run], {}, at(20, 9)).due.map(alert => alert.kind)).toEqual(['late']);
    expect(checklistAlerts([template], [{ ...run, finishedAt: at(20, 8, 50) }], {}, at(20, 9)).due).toEqual([]);
  });

  it('thống kê: lượt hoàn tất đúng hạn, trễ, chưa xong, việc hay có vấn đề, nhắc việc đã xong và bị lỡ', () => {
    const make = (day: number, finishedMinute: number | null, issue: boolean) => {
      const run = startRun(template, at(day, 8), 'Ngọc');
      if (issue) run.items[1] = { ...run.items[1], status: 'issue' };
      if (finishedMinute !== null) run.finishedAt = at(day, 8, finishedMinute) + (finishedMinute >= 60 ? 0 : 0);
      return run;
    };
    const runs = [make(17, 50, true), make(18, 59, false), { ...make(19, 0, true), finishedAt: at(19, 9, 30) }, make(20, null, false)];
    const daily = markDone(reminder({ repeat: 'daily', deadline: at(17, 10), createdAt: at(17, 8), armedAt: at(17, 8) }), at(18, 10), at(18, 10));
    const stats = statsBetween([daily], runs, at(17, 0), at(19, 23, 59));
    expect(stats).toMatchObject({ runs: 3, finished: 3, onTime: 2, late: 1, unfinished: 0, topIssues: [{ title: 'Kiểm tem giá khu điện thoại', count: 2 }] });
    expect(stats.remindersDone).toBe(1);
    expect(stats.remindersMissed).toBe(2);
    expect(MINUTE).toBe(60000);
  });
});
