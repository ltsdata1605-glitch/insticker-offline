/**
 * Nhận việc từ Google Sheet: quản lý ghi việc vào file Google Sheet (tạo từ file mẫu), app đọc file dạng CSV vài phút một lần và
 * ghép vào danh sách nhắc việc. Chỉ đọc, không ghi ngược lên file. Không đụng giao diện để kiểm thử được.
 */
import type { ChecklistItemTemplate, ChecklistSchedule, ChecklistTemplate, PresetSound, Priority, Reminder, RepeatKind, SoundSpec } from './nhacViecModel';
import { MINUTE } from './nhacViecModel';

/** File mẫu công khai (ai có link được xem). "Tạo file nhắc việc" mở trang tạo bản sao của file này. */
export const TEMPLATE_SHEET_ID = '1DrQV5W-YitTXIvEXjRfmqNStHy5MqC2AFDnWsOnCXyg';
export const TEMPLATE_COPY_URL = `https://docs.google.com/spreadsheets/d/${TEMPLATE_SHEET_ID}/copy`;
/** Đọc lại file 5 phút một lần */
export const SYNC_EVERY = 5 * MINUTE;

/** Mã file Google Sheet trong link chia sẻ. Không phải link Google Sheet thì trả về null. */
export const sheetIdFromUrl = (url: string): string | null => {
    const match = url.trim().match(/^https:\/\/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/);
    return match ? match[1] : null;
};

/** Đọc CSV theo chuẩn: ô có dấu phẩy, xuống dòng hoặc ngoặc kép thì nằm trong ngoặc kép. */
export const parseCsv = (text: string): string[][] => {
    const rows: string[][] = [];
    let row: string[] = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (quoted) {
            if (ch === '"') {
                if (text[i + 1] === '"') {
                    cell += '"';
                    i++;
                } else {
                    quoted = false;
                }
            } else {
                cell += ch;
            }
        } else if (ch === '"') {
            quoted = true;
        } else if (ch === ',') {
            row.push(cell);
            cell = '';
        } else if (ch === '\n' || ch === '\r') {
            if (ch === '\r' && text[i + 1] === '\n') i++;
            row.push(cell);
            rows.push(row);
            row = [];
            cell = '';
        } else {
            cell += ch;
        }
    }
    if (cell !== '' || row.length > 0) {
        row.push(cell);
        rows.push(row);
    }
    return rows;
};

/** Bỏ dấu, chữ thường: "Quan trọng" và "quan trong" là một */
const plain = (value: string): string => value.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/\s+/g, ' ').trim().toLowerCase();

const COLUMNS = {
    id: 'ma viec',
    title: 'tieu de',
    content: 'noi dung',
    /** Mẫu cũ: ngày giờ chung một cột */
    deadline: 'han hoan tat',
    /** Mẫu mới: ngày (chọn trên lịch) và giờ (chọn từ danh sách) tách riêng */
    date: 'ngay han',
    time: 'gio han',
    assignee: 'nguoi xu ly',
    priority: 'muc do',
    before: 'nhac truoc',
    repeat: 'lap lai',
    sound: 'am thanh',
    speech: 'cau doc',
    checklist: 'checklist',
    status: 'trang thai',
    assigner: 'nguoi giao',
} as const;

export interface SheetTask {
    id: string;
    row: number;
    title: string;
    content: string;
    deadline: number;
    assignee: string;
    assigner: string;
    priority: Priority;
    remindBefore: number[];
    repeat: RepeatKind;
    weekdays: number[];
    sound: SoundSpec;
    /** Tên checklist gắn với việc */
    checklist: string;
    status: 'active' | 'done' | 'cancelled';
}

export interface SheetParseResult {
    tasks: SheetTask[];
    /** Dòng có tiêu đề nhưng ghi sai, kèm lý do */
    skipped: { row: number; reason: string }[];
    /** Không thấy dòng tiêu đề đúng mẫu */
    badHeader: boolean;
}

/**
 * Ngày giờ hạn: ngày/tháng/năm [giờ:phút[:giây]], năm-tháng-ngày [giờ:phút], giờ:phút ngày/tháng/năm. Google Sheet để ngôn ngữ
 * Mỹ thì ra tháng/ngày/năm: số đầu không quá 12 mà số thứ hai lớn hơn 12 thì hiểu là tháng/ngày. Chỉ có ngày thì hạn là 17:00.
 */
export const parseDeadline = (value: string): number | null => {
    const text = value.trim();
    if (!text) return null;
    let date: RegExpMatchArray | null;
    let h = 17;
    let m = 0;
    const time = text.match(/(\d{1,2})[:h](\d{2})(?::\d{2})?\s*(SA|CH|AM|PM)?/i);
    if (time) {
        h = Number(time[1]);
        m = Number(time[2]);
        const half = time[3]?.toUpperCase();
        if ((half === 'PM' || half === 'CH') && h < 12) h += 12;
        if ((half === 'AM' || half === 'SA') && h === 12) h = 0;
    }
    let year: number;
    let month: number;
    let day: number;
    if ((date = text.match(/(\d{4})-(\d{1,2})-(\d{1,2})/))) {
        [year, month, day] = [Number(date[1]), Number(date[2]), Number(date[3])];
    } else if ((date = text.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/))) {
        const a = Number(date[1]);
        const b = Number(date[2]);
        year = Number(date[3]) < 100 ? 2000 + Number(date[3]) : Number(date[3]);
        [day, month] = a <= 12 && b > 12 ? [b, a] : [a, b];
    } else {
        return null;
    }
    if (month < 1 || month > 12 || day < 1 || day > 31 || h > 23 || m > 59) return null;
    const result = new Date(year, month - 1, day, h, m, 0, 0);
    return result.getMonth() === month - 1 ? result.getTime() : null;
};

const parsePriority = (value: string): Priority => {
    const key = plain(value);
    if (key.startsWith('khan')) return 'urgent';
    if (key.startsWith('quan trong')) return 'important';
    return 'normal';
};

/** Mốc nhắc trước: "1 giờ + 15 phút + đúng hạn", "60, 15, 0" (số không có đơn vị là phút), "1 ngày". */
export const parseBefore = (value: string): number[] => {
    const key = plain(value);
    if (!key) return [15, 0];
    const out = new Set<number>();
    if (key.includes('dung han')) out.add(0);
    for (const match of key.matchAll(/(\d+)\s*(phut|gio|ngay|h\b)?/g)) {
        const n = Number(match[1]);
        const unit = match[2];
        out.add(unit === 'gio' || unit === 'h' ? n * 60 : unit === 'ngay' ? n * 1440 : n);
    }
    const list = [...out].filter(n => n >= 0 && n <= 10080);
    return list.length ? list.sort((a, b) => b - a) : [15, 0];
};

const WEEKDAY_WORDS: Record<string, number> = { cn: 0, 'chu nhat': 0, t2: 1, t3: 2, t4: 3, t5: 4, t6: 5, t7: 6, 'thu 2': 1, 'thu 3': 2, 'thu 4': 3, 'thu 5': 4, 'thu 6': 5, 'thu 7': 6 };

const dayOf = (word: string): number | undefined => WEEKDAY_WORDS[word.trim()];

/** Các thứ: "T2 - T6", "T7 - CN" (khoảng), "T2, T4, T6" (liệt kê) */
export const parseWeekdays = (key: string): number[] => {
    const range = key.match(/(t\d|cn|thu \d)\s*-\s*(t\d|cn|thu \d)/);
    if (range) {
        const from = dayOf(range[1]);
        const to = dayOf(range[2]);
        if (from !== undefined && to !== undefined) {
            // Tuần tính từ thứ Hai, Chủ nhật là ngày cuối
            const order = (day: number) => (day + 6) % 7;
            const out: number[] = [];
            for (let i = order(from); i <= order(to); i++) out.push((i + 1) % 7);
            return out;
        }
    }
    return [...new Set(key.split(/[,;/ ]+(?=t|c|thu)/).flatMap(part => {
        const day = dayOf(part);
        return day === undefined ? [] : [day];
    }))];
};

const parseRepeat = (value: string): { repeat: RepeatKind; weekdays: number[] } => {
    const key = plain(value);
    if (!key || key.startsWith('khong')) return { repeat: 'none', weekdays: [] };
    if (key.includes('ngay') && (key.startsWith('moi') || key.startsWith('hang'))) return { repeat: 'daily', weekdays: [] };
    if (key.includes('thang')) return { repeat: 'monthly', weekdays: [] };
    // Mỗi tuần: vào thứ của ngày hạn
    if (key.includes('tuan')) return { repeat: 'weekly', weekdays: [] };
    const ranged = parseWeekdays(key);
    if (ranged.length) return { repeat: 'weekly', weekdays: ranged };
    const days = key.split(/[,;/ ]+(?=t|c|thu)/).flatMap(part => {
        const word = part.trim();
        return word in WEEKDAY_WORDS ? [WEEKDAY_WORDS[word]] : [];
    });
    const unique = [...new Set(days)];
    return unique.length ? { repeat: 'weekly', weekdays: unique } : { repeat: 'none', weekdays: [] };
};

const SOUND_WORDS: [string, PresetSound][] = [['chuong reo', 'chuong'], ['coi', 'coi'], ['bip', 'bip'], ['chuong cua', 'chuong-cua'], ['nhac', 'nhac']];

const parseSound = (value: string, speech: string): SoundSpec => {
    const key = plain(value);
    if (key.startsWith('doc')) return { kind: 'tts', text: speech };
    const preset = SOUND_WORDS.find(([word]) => key.startsWith(word));
    if (preset) return { kind: 'preset', preset: preset[1] };
    return speech ? { kind: 'tts', text: speech } : { kind: 'preset', preset: 'chuong' };
};

/** Đọc bảng công việc dạng CSV (trang đầu của file mẫu cũ). */
export const parseSheetTasks = (csv: string): SheetParseResult => parseTaskRows(parseCsv(csv.replace(/^﻿/, '')));

/** Đọc bảng công việc. Dòng chưa có tiêu đề thì bỏ qua (file mẫu điền sẵn mã việc cho nhiều dòng). */
export const parseTaskRows = (rows: string[][]): SheetParseResult => {
    const headerIndex = rows.findIndex(row => row.some(cell => plain(cell).startsWith(COLUMNS.title)));
    if (headerIndex < 0) return { tasks: [], skipped: [], badHeader: true };
    const header = rows[headerIndex].map(plain);
    const col = (key: string) => header.findIndex(cell => cell.startsWith(key));
    const index = Object.fromEntries(Object.entries(COLUMNS).map(([name, key]) => [name, col(key)])) as Record<keyof typeof COLUMNS, number>;
    const get = (row: string[], name: keyof typeof COLUMNS) => (index[name] >= 0 ? (row[index[name]] ?? '').trim() : '');

    const tasks: SheetTask[] = [];
    const skipped: SheetParseResult['skipped'] = [];
    const seen = new Set<string>();
    rows.slice(headerIndex + 1).forEach((row, offset) => {
        const rowNumber = headerIndex + offset + 2;
        const title = get(row, 'title');
        if (!title) return;
        const id = get(row, 'id') || `dong-${rowNumber}`;
        if (seen.has(id)) {
            skipped.push({ row: rowNumber, reason: `Mã việc ${id} bị trùng` });
            return;
        }
        // Mẫu cũ ghi ngày giờ chung một cột; mẫu mới tách Ngày hạn và Giờ hạn
        const deadlineText = index.deadline >= 0 ? get(row, 'deadline') : [get(row, 'date'), get(row, 'time')].filter(Boolean).join(' ');
        const deadline = index.deadline >= 0 || get(row, 'date') ? parseDeadline(deadlineText) : null;
        if (deadline === null) {
            skipped.push({ row: rowNumber, reason: deadlineText ? `Hạn "${deadlineText}" không đúng dạng ngày/tháng/năm giờ:phút` : 'Chưa ghi hạn hoàn tất' });
            return;
        }
        seen.add(id);
        const status = plain(get(row, 'status'));
        const speech = get(row, 'speech');
        tasks.push({
            id,
            row: rowNumber,
            title,
            content: get(row, 'content'),
            deadline,
            assignee: get(row, 'assignee'),
            assigner: get(row, 'assigner'),
            priority: parsePriority(get(row, 'priority')),
            remindBefore: parseBefore(get(row, 'before')),
            ...parseRepeat(get(row, 'repeat')),
            sound: parseSound(get(row, 'sound'), speech),
            checklist: get(row, 'checklist'),
            status: status.startsWith('huy') ? 'cancelled' : status.startsWith('xong') || status.startsWith('da xong') ? 'done' : 'active',
        });
    });
    return { tasks, skipped, badHeader: false };
};

export interface MergeResult {
    reminders: Reminder[];
    /** Việc mới, để báo người dùng */
    added: Reminder[];
    updated: number;
    removed: number;
}

const sameSchedule = (a: Reminder, b: Pick<Reminder, 'deadline' | 'remindBefore' | 'repeat' | 'weekdays'>) =>
    a.deadline === b.deadline && a.repeat === b.repeat && a.remindBefore.join() === b.remindBefore.join() && a.weekdays.join() === b.weekdays.join();

/**
 * Ghép việc đọc được vào danh sách nhắc việc. Việc đã có (cùng mã việc) thì cập nhật nội dung, giữ trạng thái đã xong và các lần
 * đã nhắc; đổi giờ thì đặt lại lịch. Việc bị xoá khỏi file hoặc ghi Huỷ thì bỏ khỏi app. Ghi Xong thì đánh dấu xong lần hạn đó.
 */
export const mergeSheetTasks = (reminders: Reminder[], tasks: SheetTask[], now: number): MergeResult => {
    const fromSheet = new Map(reminders.filter(item => item.source?.kind === 'sheet').map(item => [item.source!.taskId, item]));
    const active = tasks.filter(task => task.status !== 'cancelled');
    const keep = new Set(active.map(task => task.id));
    const added: Reminder[] = [];
    let updated = 0;
    const next: Reminder[] = reminders.filter(item => item.source?.kind !== 'sheet' || keep.has(item.source.taskId));
    const removed = reminders.length - next.length;
    for (const task of active) {
        const fields = {
            title: task.title,
            content: task.content,
            deadline: task.deadline,
            remindBefore: task.remindBefore,
            repeat: task.repeat,
            weekdays: task.weekdays,
            priority: task.priority,
            sound: task.sound,
            assignee: task.assignee,
            assigner: task.assigner,
            checklistTemplateId: task.checklist ? checklistIdFor(task.checklist) : undefined,
        };
        const existing = fromSheet.get(task.id);
        if (!existing) {
            const reminder: Reminder = {
                id: `gs-${task.id}`,
                ...fields,
                source: { kind: 'sheet', taskId: task.id },
                createdAt: now,
                updatedAt: now,
                armedAt: now,
                done: task.status === 'done' ? { [String(task.deadline)]: now } : {},
                fired: {},
                snoozes: [],
            };
            next.unshift(reminder);
            if (task.status !== 'done') added.push(reminder);
            continue;
        }
        const changed = (Object.keys(fields) as (keyof typeof fields)[]).some(key => JSON.stringify(existing[key] ?? '') !== JSON.stringify(fields[key] ?? ''));
        const markDoneNow = task.status === 'done' && !existing.done[String(task.deadline)];
        if (!changed && !markDoneNow) continue;
        const merged: Reminder = {
            ...existing,
            ...fields,
            updatedAt: now,
            armedAt: sameSchedule(existing, fields) ? existing.armedAt : now,
            done: markDoneNow ? { ...existing.done, [String(task.deadline)]: now } : existing.done,
        };
        const at = next.findIndex(item => item.id === existing.id);
        next[at] = merged;
        updated += 1;
    }
    return { reminders: next, added, updated, removed };
};

// ---------- Trang Checklist ----------

const CHECKLIST_COLUMNS = {
    name: 'ten checklist',
    title: 'viec',
    guide: 'huong dan',
    required: 'bat buoc',
    needPhoto: 'can anh',
    needNote: 'can ghi chu',
    schedule: 'lich lam',
    start: 'gio bat dau',
    due: 'gio han',
    assignee: 'nguoi lam',
    status: 'trang thai',
} as const;

/** Mã mẫu checklist nhận từ file: theo tên checklist, bỏ dấu */
export const checklistIdFor = (name: string): string => `gs-cl-${plain(name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;

export interface SheetChecklist {
    id: string;
    name: string;
    items: ChecklistItemTemplate[];
    schedule: ChecklistSchedule;
    assignee: string;
    stopped: boolean;
}

const ticked = (value: string): boolean => ['true', 'x', 'co', '1', 'v'].includes(plain(value));

const parseTime = (value: string): string | null => {
    const match = value.match(/(\d{1,2})[:h](\d{2})/);
    if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return null;
    return `${match[1].padStart(2, '0')}:${match[2]}`;
};

const parseChecklistDays = (value: string): number[] | null => {
    const key = plain(value);
    if (!key || key.startsWith('khong')) return null;
    if (key.includes('ngay')) return [0, 1, 2, 3, 4, 5, 6];
    const days = parseWeekdays(key);
    return days.length ? days : null;
};

/**
 * Đọc trang Checklist: các dòng cùng tên là một checklist, mỗi dòng một việc. Lịch làm, giờ bắt đầu, giờ hạn, người làm, trạng
 * thái lấy ở dòng đầu tiên có ghi của checklist đó.
 */
export const parseChecklistRows = (rows: string[][]): { checklists: SheetChecklist[]; skipped: { row: number; reason: string }[] } => {
    const headerIndex = rows.findIndex(row => row.some(cell => plain(cell).startsWith(CHECKLIST_COLUMNS.name)));
    if (headerIndex < 0) return { checklists: [], skipped: [] };
    const header = rows[headerIndex].map(plain);
    const index = Object.fromEntries(Object.entries(CHECKLIST_COLUMNS).map(([name, key]) => [name, header.findIndex(cell => cell === key || cell.startsWith(`${key} `))])) as Record<keyof typeof CHECKLIST_COLUMNS, number>;
    const get = (row: string[], name: keyof typeof CHECKLIST_COLUMNS) => (index[name] >= 0 ? String(row[index[name]] ?? '').trim() : '');
    const byId = new Map<string, SheetChecklist>();
    const skipped: { row: number; reason: string }[] = [];
    rows.slice(headerIndex + 1).forEach((row, offset) => {
        const name = get(row, 'name');
        const title = get(row, 'title');
        if (!name || !title) {
            if (name && !title) skipped.push({ row: headerIndex + offset + 2, reason: `Checklist ${name}: dòng chưa ghi việc` });
            return;
        }
        const id = checklistIdFor(name);
        let checklist = byId.get(id);
        if (!checklist) {
            checklist = { id, name, items: [], schedule: { enabled: false, days: [], start: '08:00', due: '09:00' }, assignee: '', stopped: false };
            byId.set(id, checklist);
        }
        // Thông tin chung lấy ở dòng đầu có ghi
        const days = parseChecklistDays(get(row, 'schedule'));
        if (days && !checklist.schedule.enabled) {
            checklist.schedule = {
                enabled: true,
                days,
                start: parseTime(get(row, 'start')) ?? '08:00',
                due: parseTime(get(row, 'due')) ?? '17:00',
            };
            if (checklist.schedule.due <= checklist.schedule.start) checklist.schedule.due = '23:59';
        }
        if (!checklist.assignee) checklist.assignee = get(row, 'assignee');
        if (plain(get(row, 'status')).startsWith('ngung')) checklist.stopped = true;
        checklist.items.push({
            id: `${id}-${checklist.items.length + 1}`,
            title,
            guide: get(row, 'guide'),
            required: ticked(get(row, 'required')),
            needPhoto: ticked(get(row, 'needPhoto')),
            needNote: ticked(get(row, 'needNote')),
        });
    });
    return { checklists: [...byId.values()], skipped };
};

export interface SheetTable {
    name: string;
    rows: string[][];
}

export interface SheetReadResult {
    tasks: SheetTask[];
    checklists: SheetChecklist[];
    skipped: { row: number; reason: string; sheet: string }[];
    badHeader: boolean;
}

/** Đọc cả file: trang Nhắc việc (hoặc trang đầu có cột Tiêu đề, file mẫu cũ) và trang Checklist. */
export const readSheetTables = (tables: SheetTable[]): SheetReadResult => {
    const taskTable = tables.find(table => plain(table.name).startsWith('nhac viec'))
        ?? tables.find(table => table.rows.some(row => row.some(cell => plain(String(cell)).startsWith(COLUMNS.title))));
    const checklistTable = tables.find(table => plain(table.name) === 'checklist');
    const tasks = taskTable ? parseTaskRows(taskTable.rows) : { tasks: [], skipped: [], badHeader: true };
    const checklists = checklistTable ? parseChecklistRows(checklistTable.rows) : { checklists: [], skipped: [] };
    return {
        tasks: tasks.tasks,
        checklists: checklists.checklists,
        skipped: [
            ...tasks.skipped.map(item => ({ ...item, sheet: taskTable?.name ?? 'Nhắc việc' })),
            ...checklists.skipped.map(item => ({ ...item, sheet: checklistTable?.name ?? 'Checklist' })),
        ],
        badHeader: tasks.badHeader && !checklistTable,
    };
};

/**
 * Ghép checklist đọc được vào các mẫu checklist. Mẫu tạo trong app giữ nguyên. Mẫu từ file bị xoá khỏi file hoặc ghi Ngưng thì bỏ;
 * các lượt đã làm vẫn còn trong lịch sử.
 */
export const mergeSheetChecklists = (templates: ChecklistTemplate[], checklists: SheetChecklist[], now: number): { templates: ChecklistTemplate[]; changed: boolean; added: number } => {
    const active = checklists.filter(item => !item.stopped);
    const keep = new Set(active.map(item => item.id));
    let changed = false;
    let added = 0;
    const next = templates.filter(item => {
        const drop = item.source?.kind === 'sheet' && !keep.has(item.id);
        if (drop) changed = true;
        return !drop;
    });
    for (const checklist of active) {
        const fields = { name: checklist.name, description: '', items: checklist.items, schedule: checklist.schedule, assignee: checklist.assignee };
        const at = next.findIndex(item => item.id === checklist.id);
        if (at < 0) {
            next.push({ id: checklist.id, ...fields, source: { kind: 'sheet' }, createdAt: now, updatedAt: now });
            changed = true;
            added += 1;
            continue;
        }
        const existing = next[at];
        const same = JSON.stringify([existing.name, existing.items, existing.schedule, existing.assignee ?? '']) === JSON.stringify([fields.name, fields.items, fields.schedule, fields.assignee]);
        if (same) continue;
        next[at] = { ...existing, ...fields, updatedAt: now };
        changed = true;
    }
    return { templates: next, changed, added };
};
