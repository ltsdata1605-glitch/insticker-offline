/**
 * Đồng bộ hai chiều với Google Sheet qua "cầu nối" (script dán trong file, scripts/google-sheet/cau-noi-nhac-viec.gs, triển khai
 * thành ứng dụng web). App gửi thay đổi (tạo, sửa, huỷ, xong, báo cáo checklist) theo hàng chờ: mất mạng thì giữ lại, có mạng
 * gửi tiếp. Không đụng giao diện để kiểm thử được.
 */
import type { ChecklistRun, ChecklistTemplate, Reminder, SoundSpec } from './nhacViecModel';
import { MINUTE, STATUS_TEXT, dateKey, newId, runProgress, timeOfDay } from './nhacViecModel';

/** App hỏi cầu nối mỗi phút (chỉ tải lại khi file có thay đổi) */
export const BRIDGE_SYNC_EVERY = MINUTE;

/**
 * Link kết nối: URL ứng dụng web của script kèm mã bí mật, ví dụ https://script.google.com/macros/s/AKfy…/exec?k=…
 * Tài khoản Google Workspace có dạng /a/macros/<tên miền>/s/…. Bài kiểm thử dùng máy chủ giả ở 127.0.0.1 (main chỉ cho phép khi
 * chạy kiểm thử).
 */
const BRIDGE_PATTERN = /^(?:https:\/\/script\.google\.com\/(?:a\/macros\/[^/\s]+|macros)|http:\/\/127\.0\.0\.1:\d+\/macros)\/s\/[A-Za-z0-9_-]{10,}\/exec\?k=[A-Za-z0-9]{16,}$/;

export const bridgeLinkFrom = (text: string): string | null => {
    const link = text.trim();
    return BRIDGE_PATTERN.test(link) ? link : null;
};

// ---------- Việc → dòng trang Nhắc việc ----------

const pad = (n: number) => String(n).padStart(2, '0');

/** Mốc nhắc trước → chữ khớp danh sách chọn trong file: [15, 0] → "15 phút + đúng hạn", [5] → "5 phút trước" */
export const beforeText = (minutes: number[]): string => {
    const sorted = [...new Set(minutes)].sort((a, b) => b - a);
    const parts = sorted.filter(n => n > 0).map(n => (n % 1440 === 0 ? `${n / 1440} ngày` : n % 60 === 0 ? `${n / 60} giờ` : `${n} phút`));
    if (sorted.includes(0)) return parts.length ? `${parts.join(' + ')} + đúng hạn` : 'Đúng hạn';
    return parts.length === 1 ? `${parts[0]} trước` : parts.join(' + ');
};

const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DAY_TEXT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

/** Cách lặp → chữ trong cột Lặp lại: "Mỗi ngày", "T2 - T6", "T2, T4, T6", "Mỗi tuần" (chưa chọn thứ: thứ của ngày hạn) */
export const repeatCellText = (reminder: Pick<Reminder, 'repeat' | 'weekdays'>): string => {
    if (reminder.repeat === 'daily') return 'Mỗi ngày';
    if (reminder.repeat === 'monthly') return 'Mỗi tháng';
    if (reminder.repeat !== 'weekly') return 'Không lặp';
    if (reminder.weekdays.length === 0) return 'Mỗi tuần';
    const days = WEEK_ORDER.filter(day => reminder.weekdays.includes(day));
    if (days.length === 7) return 'Mỗi ngày';
    const key = days.join();
    if (key === '1,2,3,4,5') return 'T2 - T6';
    if (key === '1,2,3,4,5,6') return 'T2 - T7';
    if (key === '6,0') return 'T7 - CN';
    return days.map(day => DAY_TEXT[day]).join(', ');
};

const SOUND_TEXT: Record<string, string> = { chuong: 'Chuông reo', coi: 'Còi báo', bip: 'Bíp dồn dập', 'chuong-cua': 'Chuông cửa', nhac: 'Nhạc nhẹ' };

/** Âm thanh tự ghi hoặc file chỉ có trên máy này: file ghi Chuông reo, máy khác dùng chuông đó */
export const soundCellText = (sound: SoundSpec): { sound: string; speech: string } => {
    if (sound.kind === 'tts') return { sound: 'Đọc chữ', speech: sound.text };
    if (sound.kind === 'preset') return { sound: SOUND_TEXT[sound.preset] ?? 'Chuông reo', speech: '' };
    return { sound: 'Chuông reo', speech: '' };
};

const PRIORITY_CELL = { normal: 'Thường', important: 'Quan trọng', urgent: 'Khẩn' } as const;

export type SheetCell = string | { ngay: string };

/** Dòng gửi lên cầu nối: tên cột → giá trị. Cầu nối chỉ ghi các cột file có (file mẫu cũ ghi ngày giờ chung một cột). */
export const reminderToRow = (reminder: Reminder, checklistName: string): Record<string, SheetCell> => {
    const d = new Date(reminder.deadline);
    const sound = soundCellText(reminder.sound);
    return {
        'Tiêu đề': reminder.title,
        'Nội dung': reminder.content,
        'Ngày hạn': { ngay: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` },
        'Giờ hạn': timeOfDay(reminder.deadline),
        'Hạn hoàn tất': `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${timeOfDay(reminder.deadline)}`,
        'Người xử lý': reminder.assignee ?? '',
        'Mức độ': PRIORITY_CELL[reminder.priority],
        'Nhắc trước': beforeText(reminder.remindBefore),
        'Lặp lại': repeatCellText(reminder),
        'Âm thanh': sound.sound,
        'Câu đọc': sound.speech,
        'Checklist': checklistName,
        ...(reminder.assigner ? { 'Người giao': reminder.assigner } : {}),
    };
};

// ---------- Hàng chờ gửi ----------

export type OutboxOp =
    /** Tạo hoặc sửa việc: nội dung lấy lúc gửi, nhiều lần sửa liền nhau chỉ gửi một lần */
    | { id: string; kind: 'upsert'; ref: string }
    | { id: string; kind: 'cancel'; ref: string; taskId: string }
    | { id: string; kind: 'done'; ref: string; occ: number; at: number }
    /** Báo cáo lượt checklist hoàn tất */
    | { id: string; kind: 'report'; ref: string };

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type NewOp = DistributiveOmit<OutboxOp, 'id'>;

/** Thêm vào hàng chờ: bỏ thao tác trùng; huỷ việc chưa kịp gửi lên thì bỏ luôn, không gửi gì */
export const enqueue = (outbox: OutboxOp[], op: NewOp, taskIdOf: (ref: string) => string): OutboxOp[] => {
    if (op.kind === 'upsert' && outbox.some(item => item.kind === 'upsert' && item.ref === op.ref)) return outbox;
    if (op.kind === 'report' && outbox.some(item => item.kind === 'report' && item.ref === op.ref)) return outbox;
    if (op.kind === 'done' && outbox.some(item => item.kind === 'done' && item.ref === op.ref && item.occ === op.occ)) return outbox;
    if (op.kind === 'cancel' && !op.taskId && !taskIdOf(op.ref)) return outbox.filter(item => item.ref !== op.ref);
    return [...outbox, { ...op, id: newId('op') } as OutboxOp];
};

export interface BridgeOp {
    op: 'upsert' | 'cancel' | 'done' | 'report';
    ref: string;
    id?: string;
    row?: Record<string, SheetCell>;
    occ?: number;
    at?: number;
    repeat?: boolean;
    report?: Record<string, string | number>;
}

export interface BridgeResult {
    ref: string;
    id: string;
    loi?: string;
}

/** Báo cáo lượt checklist cho trang Báo cáo checklist */
export const runReport = (run: ChecklistRun): Record<string, string | number> => {
    const progress = runProgress(run);
    const line = (status: keyof typeof STATUS_TEXT) => run.items.filter(item => item.status === status).map(item => item.title).join('; ');
    return {
        finishedAt: run.finishedAt ?? run.startedAt,
        checklist: run.name,
        date: run.date.split('-').reverse().join('/'),
        performer: run.performer,
        result: `${progress.done}/${progress.total} hoàn tất`,
        issues: String(progress.issue),
        todo: String(progress.todo),
        note: run.note,
        detail: run.items.map((item, i) => `${i + 1}. ${item.title}: ${STATUS_TEXT[item.status]}${item.note ? ` (${item.note})` : ''}${item.photos.length ? `, ${item.photos.length} ảnh` : ''}`).join('\n')
            + (line('issue') ? `\nCó vấn đề: ${line('issue')}` : ''),
    };
};

/** Hàng chờ → các thao tác gửi lên. Việc hay lượt đã bị xoá khỏi máy thì bỏ qua. */
export const buildOps = (outbox: OutboxOp[], reminders: Reminder[], runs: ChecklistRun[], templates: ChecklistTemplate[]): BridgeOp[] => {
    const byId = new Map(reminders.map(item => [item.id, item]));
    const ops: BridgeOp[] = [];
    for (const item of outbox) {
        const reminder = byId.get(item.ref);
        const taskId = reminder?.source?.kind === 'sheet' && reminder.source.taskId ? reminder.source.taskId : undefined;
        if (item.kind === 'upsert') {
            if (!reminder || reminder.source?.kind !== 'sheet') continue;
            const checklist = reminder.checklistTemplateId ? templates.find(template => template.id === reminder.checklistTemplateId)?.name ?? '' : '';
            ops.push({ op: 'upsert', ref: item.ref, id: taskId, row: reminderToRow(reminder, checklist) });
        } else if (item.kind === 'cancel') {
            ops.push({ op: 'cancel', ref: item.ref, id: item.taskId || taskId });
        } else if (item.kind === 'done') {
            ops.push({ op: 'done', ref: item.ref, id: taskId, occ: item.occ, at: item.at, repeat: reminder ? reminder.repeat !== 'none' : false });
        } else {
            const run = runs.find(entry => entry.id === item.ref);
            if (run?.finishedAt) ops.push({ op: 'report', ref: item.ref, report: runReport(run) });
        }
    }
    return ops;
};

/** Gắn mã việc cầu nối vừa cấp cho việc tạo trên máy */
export const applyResults = (reminders: Reminder[], results: BridgeResult[]): Reminder[] => {
    const ids = new Map(results.filter(result => result.id && !result.loi).map(result => [result.ref, result.id]));
    if (ids.size === 0) return reminders;
    let changed = false;
    const next = reminders.map(reminder => {
        const id = ids.get(reminder.id);
        if (!id || reminder.source?.kind !== 'sheet' || reminder.source.taskId === id) return reminder;
        changed = true;
        return { ...reminder, source: { kind: 'sheet' as const, taskId: id } };
    });
    return changed ? next : reminders;
};

export interface DoneEntry {
    id: string;
    occ: number;
    by: string;
}

/** Lần xong ghi ở trang Nhật ký (máy khác bấm Đã xong): đánh dấu xong ở máy này, không nhắc lần đó nữa */
export const applyDoneLog = (reminders: Reminder[], log: DoneEntry[], now: number): Reminder[] => {
    if (log.length === 0) return reminders;
    const byTask = new Map<string, DoneEntry[]>();
    for (const entry of log) byTask.set(entry.id.toUpperCase(), [...(byTask.get(entry.id.toUpperCase()) ?? []), entry]);
    let changed = false;
    const next = reminders.map(reminder => {
        if (reminder.source?.kind !== 'sheet' || !reminder.source.taskId) return reminder;
        const entries = byTask.get(reminder.source.taskId.toUpperCase());
        const fresh = entries?.filter(entry => !reminder.done[String(entry.occ)]);
        if (!fresh?.length) return reminder;
        changed = true;
        const done = { ...reminder.done };
        for (const entry of fresh) done[String(entry.occ)] = now;
        return { ...reminder, done, snoozes: reminder.snoozes.filter(snooze => !fresh.some(entry => entry.occ === snooze.occ)) };
    });
    return changed ? next : reminders;
};

/** Việc chỉ có trên máy này, đưa lên được: bỏ việc một lần đã xong và việc lặp đã dừng */
export const localReminders = (reminders: Reminder[]): Reminder[] =>
    reminders.filter(reminder => !reminder.source && !reminder.stopped && !(reminder.repeat === 'none' && reminder.done[String(reminder.deadline)]));

/** Các lần đã xong hôm nay của việc, để đưa việc lên file thì máy khác cũng thấy đã xong */
export const doneToday = (reminder: Reminder, now: number): number[] =>
    Object.keys(reminder.done).map(Number).filter(occ => dateKey(occ) === dateKey(now));
