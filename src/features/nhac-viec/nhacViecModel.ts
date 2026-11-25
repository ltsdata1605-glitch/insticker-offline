/**
 * Nhắc việc và checklist: kiểu dữ liệu, tính các lần hạn (có lặp lại), các lần nhắc đến giờ, trạng thái và thống kê.
 * Không đụng giao diện hay IndexedDB để kiểm thử được. Mọi giờ tính theo giờ trên máy.
 */

export type Priority = 'normal' | 'important' | 'urgent';
export type RepeatKind = 'none' | 'daily' | 'weekly' | 'monthly';
export type PresetSound = 'chuong' | 'coi' | 'bip' | 'chuong-cua' | 'nhac';

export type SoundSpec =
    | { kind: 'preset'; preset: PresetSound }
    /** Đọc chữ thành tiếng. `text` rỗng thì đọc tiêu đề và hạn. */
    | { kind: 'tts'; text: string }
    /** File âm thanh nhập vào hoặc ghi âm, lưu trong kho ảnh và âm thanh */
    | { kind: 'file'; mediaId: string; name: string };

/** Khi bấm Đã xong phải kèm: ghi chú, ảnh, hay cả hai */
export type Proof = 'note' | 'photo' | 'both';

/** Một lần ai đó bấm Đã nhận, Cần hỗ trợ hay Đã xong cho một lần hạn */
export interface OccEvent {
    by: string;
    at: number;
    /** Lý do cần hỗ trợ, ghi chú khi xong */
    note?: string;
    /** Ảnh trên máy này (mã trong kho ảnh và âm thanh) */
    photos?: string[];
    /** Link ảnh trong Google Drive (máy khác gửi, đọc từ trang Nhật ký) */
    links?: string[];
}

export interface Reminder {
    id: string;
    title: string;
    content: string;
    /** Hạn của lần đầu. Lặp lại thì các lần sau cùng giờ này. */
    deadline: number;
    /** Nhắc trước hạn bao nhiêu phút; 0 là đúng hạn. */
    remindBefore: number[];
    repeat: RepeatKind;
    /** Lặp theo tuần: các thứ trong tuần, 0 là Chủ nhật. */
    weekdays: number[];
    priority: Priority;
    sound: SoundSpec;
    /** Checklist mở khi bấm nút trên cửa sổ nhắc */
    checklistTemplateId?: string;
    createdAt: number;
    updatedAt: number;
    /** Lúc đặt lịch lần cuối. Các lần nhắc trước mốc này bỏ qua, để sửa giờ không bật lại nhắc cũ. */
    armedAt: number;
    /** Lần hạn đã xong: hạn (ms) → lúc bấm Đã xong */
    done: Record<string, number>;
    /** Khoá lần nhắc đã hiện → lúc hiện */
    fired: Record<string, number>;
    /** Hoãn: nhắc lại lần hạn `occ` lúc `at` */
    snoozes: { occ: number; at: number }[];
    /** Dừng nhắc lặp lại */
    stopped?: boolean;
    /**
     * Việc trên Google Sheet (mã việc trong file). Kết nối bằng link chia sẻ (chỉ đọc) thì sửa trong file; đồng bộ hai chiều thì sửa
     * ngay trong app. `taskId` rỗng: việc tạo trên máy đang chờ gửi lên file.
     */
    source?: { kind: 'sheet'; taskId: string };
    /** Người xử lý, người giao (việc từ Google Sheet) */
    assignee?: string;
    assigner?: string;
    /** Bộ phận nhận việc (Kho, Thu ngân, Quản lý…). Trống là việc chung, máy nào cũng nhắc. */
    department?: string;
    /** Bấm Đã xong phải kèm ghi chú, ảnh */
    proof?: Proof;
    /** Lần hạn → ai bấm Đã nhận */
    acks?: Record<string, OccEvent>;
    /** Lần hạn → lần Cần hỗ trợ gần nhất */
    helps?: Record<string, OccEvent>;
    /** Lần hạn → ai bấm Đã xong, ghi chú, ảnh */
    doneInfo?: Record<string, OccEvent>;
}

export type ItemStatus = 'todo' | 'done' | 'issue' | 'na';

export interface ChecklistItemTemplate {
    id: string;
    title: string;
    guide: string;
    required: boolean;
    needPhoto: boolean;
    needNote: boolean;
}

export interface ChecklistSchedule {
    enabled: boolean;
    /** Các thứ trong tuần, 0 là Chủ nhật. Đủ 7 ngày là mỗi ngày. */
    days: number[];
    /** HH:mm */
    start: string;
    due: string;
}

export interface ChecklistTemplate {
    id: string;
    name: string;
    description: string;
    items: ChecklistItemTemplate[];
    schedule: ChecklistSchedule;
    createdAt: number;
    updatedAt: number;
    /** Checklist nhận từ trang Checklist của Google Sheet: sửa trong file, không sửa trong app */
    source?: { kind: 'sheet' };
    /** Người làm (checklist từ Google Sheet) */
    assignee?: string;
    /** Bộ phận làm checklist. Trống là máy nào cũng nhắc. */
    department?: string;
}

export interface ChecklistRunItem extends ChecklistItemTemplate {
    status: ItemStatus;
    note: string;
    /** Mã ảnh trong kho ảnh và âm thanh */
    photos: string[];
    doneAt?: number;
    by?: string;
}

export interface ChecklistRun {
    id: string;
    templateId: string;
    name: string;
    /** Ngày làm, yyyy-mm-dd */
    date: string;
    startedAt: number;
    deadline?: number;
    finishedAt?: number;
    performer: string;
    items: ChecklistRunItem[];
    /** Ghi chú chung, và lý do khi hoàn tất lúc còn việc bắt buộc chưa làm */
    note: string;
}

export const MINUTE = 60_000;
export const DAY = 86_400_000;
/** Việc khẩn quá hạn chưa xong: nhắc lại mỗi 10 phút, tối đa 3 giờ */
export const NAG_EVERY = 10 * MINUTE;
export const NAG_MAX = 18;
/** Lần nhắc đến giờ trong khoảng này thì bật cửa sổ; cũ hơn là nhắc bị lỡ (app tắt, máy ngủ) */
export const LATE_GRACE = 2 * MINUTE;
export const MISSED_WINDOW = 3 * DAY;

export const newId = (prefix: string): string => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const pad = (n: number) => String(n).padStart(2, '0');
export const dateKey = (ms: number): string => {
    const d = new Date(ms);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
export const startOfDay = (ms: number): number => {
    const d = new Date(ms);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
};
export const timeOfDay = (ms: number): string => {
    const d = new Date(ms);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export const dateTimeText = (ms: number): string => {
    const d = new Date(ms);
    return `${timeOfDay(ms)} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};
/** Giờ HH:mm của ngày chứa `dayMs` */
export const atTime = (dayMs: number, hhmm: string): number => {
    const [h, m] = hhmm.split(':').map(Number);
    const d = new Date(dayMs);
    d.setHours(h || 0, m || 0, 0, 0);
    return d.getTime();
};

const WEEKDAY_NAMES = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
export const weekdayName = (day: number): string => WEEKDAY_NAMES[day] ?? '';

export const repeatText = (reminder: Pick<Reminder, 'repeat' | 'weekdays' | 'deadline'>): string => {
    switch (reminder.repeat) {
        case 'daily': return 'Mỗi ngày';
        case 'weekly': {
            const days = reminder.weekdays.length ? reminder.weekdays : [new Date(reminder.deadline).getDay()];
            return days.length === 7 ? 'Mỗi ngày' : `Mỗi tuần: ${[...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map(weekdayName).join(', ')}`;
        }
        case 'monthly': return `Mỗi tháng, ngày ${new Date(reminder.deadline).getDate()}`;
        default: return 'Không lặp';
    }
};

/** Các lần hạn trong khoảng [from, to], không trước hạn đầu tiên. Lặp theo tháng: tháng ngắn hơn thì lấy ngày cuối tháng. */
export const occurrencesBetween = (reminder: Pick<Reminder, 'deadline' | 'repeat' | 'weekdays'>, from: number, to: number): number[] => {
    const first = reminder.deadline;
    if (reminder.repeat === 'none') return first >= from && first <= to ? [first] : [];
    if (to < first) return [];
    const base = new Date(first);
    const out: number[] = [];
    if (reminder.repeat === 'monthly') {
        const day = base.getDate();
        for (let i = 0; i < 240 && out.length < 400; i++) {
            const d = new Date(base.getFullYear(), base.getMonth() + i, 1, base.getHours(), base.getMinutes(), 0, 0);
            const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
            d.setDate(Math.min(day, last));
            const ms = d.getTime();
            if (ms > to) break;
            if (ms >= from && ms >= first) out.push(ms);
        }
        return out;
    }
    const days = reminder.repeat === 'weekly' ? (reminder.weekdays.length ? reminder.weekdays : [base.getDay()]) : [0, 1, 2, 3, 4, 5, 6];
    // Bắt đầu từ ngày muộn hơn giữa hạn đầu và `from`
    const startDay = new Date(Math.max(startOfDay(first), startOfDay(from)));
    for (let i = 0; i < 800 && out.length < 400; i++) {
        const d = new Date(startDay.getFullYear(), startDay.getMonth(), startDay.getDate() + i, base.getHours(), base.getMinutes(), 0, 0);
        const ms = d.getTime();
        if (ms > to) break;
        if (ms >= from && ms >= first && days.includes(d.getDay())) out.push(ms);
    }
    return out;
};

export type AlertKind = 'before' | 'due' | 'snooze' | 'nag';

export interface Alert {
    key: string;
    reminderId: string;
    occ: number;
    at: number;
    kind: AlertKind;
    /** Nhắc trước bao nhiêu phút (kind = before) */
    minutes?: number;
}

const alertKey = (id: string, occ: number, suffix: string) => `${id}@${occ}#${suffix}`;

/** Mọi lần nhắc của một nhắc việc đến giờ trong (from, to], chưa hiện, lần hạn chưa xong. */
export const alertsOf = (reminder: Reminder, from: number, to: number): Alert[] => {
    if (reminder.stopped) return [];
    const maxBefore = Math.max(0, ...reminder.remindBefore) * MINUTE;
    const out: Alert[] = [];
    const lower = Math.max(from, reminder.armedAt);
    const occs = occurrencesBetween(reminder, lower - NAG_EVERY * NAG_MAX - DAY, to + maxBefore);
    for (const occ of occs) {
        if (reminder.done[String(occ)]) continue;
        for (const minutes of reminder.remindBefore) {
            const at = occ - minutes * MINUTE;
            const key = alertKey(reminder.id, occ, minutes === 0 ? 'due' : `b${minutes}`);
            if (at > lower && at <= to && !reminder.fired[key]) out.push({ key, reminderId: reminder.id, occ, at, kind: minutes === 0 ? 'due' : 'before', minutes });
        }
        for (const snooze of reminder.snoozes) {
            if (snooze.occ !== occ) continue;
            const key = alertKey(reminder.id, occ, `z${snooze.at}`);
            if (snooze.at > from && snooze.at <= to && !reminder.fired[key]) out.push({ key, reminderId: reminder.id, occ, at: snooze.at, kind: 'snooze' });
        }
        if (reminder.priority === 'urgent' && to >= occ + NAG_EVERY) {
            const n = Math.min(NAG_MAX, Math.floor((to - occ) / NAG_EVERY));
            const at = occ + n * NAG_EVERY;
            const key = alertKey(reminder.id, occ, `n${n}`);
            if (at > lower && !reminder.fired[key]) out.push({ key, reminderId: reminder.id, occ, at, kind: 'nag' });
        }
    }
    return out;
};

/**
 * Các lần nhắc cần xử lý lúc `now`: `due` là vừa đến giờ (bật cửa sổ, kêu chuông), `missed` là đã qua lúc app tắt hoặc máy ngủ.
 * Mỗi lần hạn chỉ lấy lần nhắc mới nhất để không bật nhiều cửa sổ cho cùng một việc.
 */
export const pendingAlerts = (reminders: Reminder[], now: number): { due: Alert[]; missed: Alert[] } => {
    const due: Alert[] = [];
    const missed: Alert[] = [];
    for (const reminder of reminders) {
        const latest = new Map<number, Alert>();
        const all = alertsOf(reminder, now - MISSED_WINDOW, now);
        for (const alert of all) {
            const current = latest.get(alert.occ);
            if (!current || alert.at > current.at) latest.set(alert.occ, alert);
        }
        for (const alert of latest.values()) (alert.at >= now - LATE_GRACE ? due : missed).push(alert);
    }
    return { due: due.sort((a, b) => a.at - b.at), missed: missed.sort((a, b) => a.at - b.at) };
};

/** Đánh dấu đã hiện mọi lần nhắc của cùng lần hạn đến lúc `now`, để không bật lại các mốc nhắc trước đó. */
export const markFired = (reminder: Reminder, occ: number, now: number): Reminder => {
    const fired = { ...reminder.fired };
    for (const alert of alertsOf(reminder, now - MISSED_WINDOW, now)) if (alert.occ === occ) fired[alert.key] = now;
    return { ...reminder, fired };
};

export const markDone = (reminder: Reminder, occ: number, now: number, info?: OccEvent): Reminder => ({
    ...markFired(reminder, occ, now),
    done: { ...reminder.done, [String(occ)]: now },
    ...(info ? { doneInfo: { ...reminder.doneInfo, [String(occ)]: info } } : {}),
    snoozes: reminder.snoozes.filter(snooze => snooze.occ !== occ),
    updatedAt: now,
});

export const snooze = (reminder: Reminder, occ: number, minutes: number, now: number): Reminder => ({
    ...markFired(reminder, occ, now),
    snoozes: [...reminder.snoozes.filter(item => item.occ !== occ), { occ, at: now + minutes * MINUTE }],
    updatedAt: now,
});

/**
 * Hạn gợi ý cho bản sao: nhắc lặp lại giữ lịch cũ; việc một lần còn hạn thì giữ, đã qua hạn thì dời sang cùng giờ hôm nay
 * (nếu giờ đó chưa qua) hoặc ngày mai, để nhân bản việc hôm qua là lưu được ngay.
 */
export const copyDeadline = (reminder: Pick<Reminder, 'deadline' | 'repeat'>, now: number): number => {
    if (reminder.repeat !== 'none' || reminder.deadline > now) return reminder.deadline;
    const time = new Date(reminder.deadline);
    const today = new Date(now);
    today.setHours(time.getHours(), time.getMinutes(), 0, 0);
    if (today.getTime() > now) return today.getTime();
    today.setDate(today.getDate() + 1);
    return today.getTime();
};

/** Bỏ dấu đã hiện, đã xong cũ hơn 40 ngày để dữ liệu nhắc lặp lại không phình mãi. */
export const pruneReminder = (reminder: Reminder, now: number): Reminder => {
    const keep = now - 40 * DAY;
    const fired = Object.fromEntries(Object.entries(reminder.fired).filter(([, at]) => at >= keep));
    const done = reminder.repeat === 'none' ? reminder.done : Object.fromEntries(Object.entries(reminder.done).filter(([occ]) => Number(occ) >= keep));
    const recent = <T,>(map: Record<string, T> | undefined) => (map && reminder.repeat !== 'none' ? Object.fromEntries(Object.entries(map).filter(([occ]) => Number(occ) >= keep)) : map);
    return {
        ...reminder, fired, done, snoozes: reminder.snoozes.filter(item => item.at >= keep),
        acks: recent(reminder.acks), helps: recent(reminder.helps), doneInfo: recent(reminder.doneInfo),
    };
};

export type ReminderState = 'overdue' | 'today' | 'upcoming' | 'done' | 'stopped';

export interface ReminderView {
    reminder: Reminder;
    state: ReminderState;
    /** Lần hạn đang xét (lần quá hạn, hôm nay, hoặc lần tới) */
    occ: number | null;
    /** Lần tới sau lần đang xét, với nhắc lặp lại */
    next: number | null;
}

/** Trạng thái để xếp danh sách: quá hạn, hôm nay, sắp tới, đã xong. */
export const reminderView = (reminder: Reminder, now: number): ReminderView => {
    const todayStart = startOfDay(now);
    const todayEnd = todayStart + DAY - 1;
    if (reminder.repeat === 'none') {
        const occ = reminder.deadline;
        const state: ReminderState = reminder.done[String(occ)] ? 'done' : occ < now ? 'overdue' : occ <= todayEnd ? 'today' : 'upcoming';
        return { reminder, state, occ, next: null };
    }
    if (reminder.stopped) return { reminder, state: 'stopped', occ: null, next: null };
    const upcoming = occurrencesBetween(reminder, todayStart, now + 400 * DAY);
    const notDone = upcoming.filter(occ => !reminder.done[String(occ)]);
    const occ = notDone[0] ?? null;
    if (occ === null) return { reminder, state: 'done', occ: upcoming[0] ?? null, next: null };
    const next = notDone[1] ?? null;
    if (occ <= todayEnd) return { reminder, state: occ < now ? 'overdue' : 'today', occ, next };
    // Lần hôm nay đã xong thì xếp vào Đã xong hôm nay
    const todayDone = upcoming.some(item => item <= todayEnd && reminder.done[String(item)]);
    return { reminder, state: todayDone ? 'done' : 'upcoming', occ, next };
};

export const PRIORITY_TEXT: Record<Priority, string> = { normal: 'Thường', important: 'Quan trọng', urgent: 'Khẩn' };

export const PROOF_TEXT: Record<Proof, string> = { note: 'Ghi chú', photo: 'Ảnh', both: 'Ảnh + ghi chú' };
export const proofNeedsNote = (proof?: Proof): boolean => proof === 'note' || proof === 'both';
export const proofNeedsPhoto = (proof?: Proof): boolean => proof === 'photo' || proof === 'both';

// ---------- Bộ phận của máy ----------

/** Bộ phận có sẵn để chọn; file Google Sheet ghi bộ phận khác thì cũng chọn được */
export const DEFAULT_DEPARTMENTS = ['Kho', 'Thu ngân', 'Quản lý'];

const nameKey = (value?: string): string => (value ?? '').normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/\s+/g, ' ').trim().toLowerCase();
/** Cùng tên, không kể dấu, hoa thường; tên trống không trùng với gì */
export const sameName = (a?: string, b?: string): boolean => nameKey(a) !== '' && nameKey(a) === nameKey(b);
/** Máy của quản lý: thấy việc mọi bộ phận, được báo việc quá hạn và nhân viên cần hỗ trợ */
export const isManagerDept = (department?: string): boolean => nameKey(department) === 'quan ly';

/** Máy này: bộ phận (trống là nhận mọi việc như trước) và tên người dùng máy */
export interface MachineRole {
    department: string;
    performer: string;
}

/** Việc (hay checklist) nhắc trên máy này: việc chung, việc của bộ phận máy, việc giao đích danh cho người dùng máy */
export const ringsHere = (item: { department?: string; assignee?: string }, role: MachineRole): boolean =>
    !role.department.trim() || !item.department?.trim() || sameName(item.department, role.department) || sameName(item.assignee, role.performer);

/** Việc hiện trong danh sách của máy: máy quản lý thấy hết, máy khác chỉ thấy việc nhắc trên máy */
export const shownHere = (item: { department?: string; assignee?: string }, role: MachineRole): boolean =>
    isManagerDept(role.department) || ringsHere(item, role);

/**
 * Việc người khác làm mà máy này phải theo dõi (báo khi quá hạn, khi cần hỗ trợ): máy quản lý theo dõi việc không nhắc trên máy
 * mình; người giao theo dõi việc mình giao cho người khác.
 */
export const watchedHere = (reminder: Pick<Reminder, 'department' | 'assignee' | 'assigner'>, role: MachineRole): boolean => {
    const assignedByMe = sameName(reminder.assigner, role.performer) && !sameName(reminder.assignee, role.performer) && Boolean(reminder.assignee?.trim() || reminder.department?.trim());
    return assignedByMe || (isManagerDept(role.department) && !ringsHere(reminder, role));
};

/** Việc quá hạn bao lâu chưa xong thì báo quản lý, người giao */
export const OVERDUE_ALERT_AFTER = 15 * MINUTE;

/** Còn bao lâu hoặc trễ bao lâu, dạng "còn 15 phút", "trễ 2 giờ". */
export const relativeText = (target: number, now: number): string => {
    const diff = target - now;
    const abs = Math.abs(diff);
    const text = abs < MINUTE ? 'dưới 1 phút'
        : abs < 60 * MINUTE ? `${Math.round(abs / MINUTE)} phút`
            : abs < DAY ? `${Math.floor(abs / (60 * MINUTE))} giờ${Math.round((abs % (60 * MINUTE)) / MINUTE) ? ` ${Math.round((abs % (60 * MINUTE)) / MINUTE)} phút` : ''}`
                : `${Math.round(abs / DAY)} ngày`;
    return diff >= 0 ? `còn ${text}` : `trễ ${text}`;
};

/** Câu đọc mặc định khi chọn đọc chữ mà không gõ câu riêng. */
export const defaultSpeech = (reminder: Pick<Reminder, 'title' | 'content'>, occ: number, now: number): string => {
    const when = occ >= now ? `Hạn lúc ${timeOfDay(occ).replace(':', ' giờ ')}` : `Đã quá hạn ${relativeText(occ, now).replace('trễ ', '')}`;
    return `Nhắc việc. ${reminder.title}. ${when}.`;
};

// ---------- Checklist ----------

/** Lượt làm mới từ mẫu */
export const startRun = (template: ChecklistTemplate, now: number, performer: string): ChecklistRun => ({
    id: newId('run'),
    templateId: template.id,
    name: template.name,
    date: dateKey(now),
    startedAt: now,
    deadline: template.schedule.enabled && template.schedule.due ? atTime(now, template.schedule.due) : undefined,
    performer,
    items: template.items.map(item => ({ ...item, status: 'todo', note: '', photos: [] })),
    note: '',
});

/** Ngày (00:00) của khoá yyyy-mm-dd */
export const dayOfKey = (date: string): number => {
    const [y, m, d] = date.split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1).getTime();
};

/** Lượt của mẫu trong ngày: lượt đang làm dở trước, không có thì lượt đã hoàn tất gần nhất */
export const runOfDay = (runs: ChecklistRun[], templateId: string, date: string): ChecklistRun | null => {
    const ofDay = runs.filter(run => run.templateId === templateId && run.date === date);
    return ofDay.find(run => !run.finishedAt)
        ?? ofDay.filter(run => run.finishedAt).sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0))[0]
        ?? null;
};

/** Lượt mở ra rồi chưa làm gì: chưa đánh việc nào, không ghi chú, không ảnh */
export const untouchedRun = (run: ChecklistRun): boolean => !run.finishedAt && !run.note.trim()
    && run.items.every(item => item.status === 'todo' && !item.note.trim() && item.photos.length === 0);

/**
 * Cột lượt bên phải tab Checklist: "Đang làm" chỉ gồm lượt chưa hoàn tất của hôm nay; lượt chưa hoàn tất từ ngày trước (quên
 * bấm Hoàn tất, hay mẫu đã xoá hoặc đổi tên) xếp riêng để xem lại hoặc xoá, không dồn vào Đang làm.
 */
export const splitRuns = (runs: ChecklistRun[], today: string): { active: ChecklistRun[]; stale: ChecklistRun[]; finished: ChecklistRun[] } => ({
    active: runs.filter(run => !run.finishedAt && run.date >= today),
    stale: runs.filter(run => !run.finishedAt && run.date < today),
    finished: runs.filter(run => run.finishedAt),
});

/**
 * Sửa mẫu trong lúc đang làm: lượt chưa hoàn tất nhận tên, danh sách việc và giờ hạn mới; việc còn trong mẫu giữ nguyên kết
 * quả, ghi chú, ảnh; việc mới thêm là chưa làm; việc đã bỏ khỏi mẫu thì bỏ khỏi lượt. Lượt đã hoàn tất giữ nguyên như đã báo cáo.
 */
export const applyTemplateToRun = (run: ChecklistRun, template: ChecklistTemplate): ChecklistRun => {
    if (run.finishedAt || run.templateId !== template.id) return run;
    return {
        ...run,
        name: template.name,
        deadline: template.schedule.enabled && template.schedule.due ? atTime(dayOfKey(run.date), template.schedule.due) : run.deadline,
        items: template.items.map(item => {
            const before = run.items.find(old => old.id === item.id);
            return before
                ? { ...before, title: item.title, guide: item.guide, required: item.required, needPhoto: item.needPhoto, needNote: item.needNote }
                : { ...item, status: 'todo' as const, note: '', photos: [] };
        }),
    };
};

/** Bỏ các lượt trống mở thừa sau khi mẫu đã hoàn tất trong ngày (bản cũ bấm Bắt đầu lần nữa là tạo lượt mới) */
export const dropLeftoverRuns = (runs: ChecklistRun[]): ChecklistRun[] => {
    const finished = new Set(runs.filter(run => run.finishedAt).map(run => `${run.templateId}@${run.date}`));
    return runs.filter(run => !(untouchedRun(run) && finished.has(`${run.templateId}@${run.date}`)));
};

export interface RunProgress {
    total: number;
    done: number;
    issue: number;
    na: number;
    todo: number;
    /** Việc bắt buộc còn chưa làm */
    requiredTodo: number;
    /** Đã xử lý (xong, có vấn đề, không áp dụng) / tổng */
    handled: number;
    percent: number;
    /** Việc cần ảnh mà chưa có ảnh, cần ghi chú mà chưa ghi */
    missingEvidence: ChecklistRunItem[];
}

export const runProgress = (run: Pick<ChecklistRun, 'items'>): RunProgress => {
    const count = (status: ItemStatus) => run.items.filter(item => item.status === status).length;
    const total = run.items.length;
    const done = count('done');
    const issue = count('issue');
    const na = count('na');
    const handled = done + issue + na;
    return {
        total, done, issue, na, todo: total - handled, handled,
        requiredTodo: run.items.filter(item => item.required && item.status === 'todo').length,
        percent: total ? Math.round((handled / total) * 100) : 0,
        missingEvidence: run.items.filter(item => item.status !== 'todo' && item.status !== 'na'
            && ((item.needPhoto && item.photos.length === 0) || (item.needNote && !item.note.trim()))),
    };
};

/** Lượt làm có đúng hạn không: chưa có hạn thì coi như đúng hạn */
export const runOnTime = (run: ChecklistRun): boolean | null =>
    run.finishedAt === undefined ? null : run.deadline === undefined || run.finishedAt <= run.deadline;

export const STATUS_TEXT: Record<ItemStatus, string> = { todo: 'Chưa làm', done: 'Hoàn tất', issue: 'Có vấn đề', na: 'Không áp dụng' };

/** Nội dung chữ để dán vào Zalo hoặc tin nhắn báo cáo. */
export const runReportText = (run: ChecklistRun, now: number): string => {
    const progress = runProgress(run);
    const onTime = runOnTime(run);
    const out: string[] = [];
    out.push(`BÁO CÁO CHECKLIST: ${run.name.toUpperCase()}`);
    out.push(`Người làm: ${run.performer.trim() || 'Chưa ghi tên'}`);
    out.push(`Ngày ${run.date.split('-').reverse().join('/')}`);
    out.push(`Bắt đầu ${timeOfDay(run.startedAt)}${run.finishedAt ? ` · Hoàn tất ${timeOfDay(run.finishedAt)}` : ' · Chưa hoàn tất'}${run.deadline ? ` · Hạn ${timeOfDay(run.deadline)}` : ''}`);
    const result = [`${progress.done}/${progress.total} hoàn tất`, progress.issue && `${progress.issue} có vấn đề`, progress.na && `${progress.na} không áp dụng`, progress.todo && `${progress.todo} chưa làm`]
        .filter(Boolean).join(', ');
    out.push(`Kết quả: ${result}${onTime === false ? ' · TRỄ HẠN' : onTime ? ' · Đúng hạn' : run.deadline && now > run.deadline ? ' · Đã quá hạn' : ''}`);
    out.push('');
    const mark: Record<ItemStatus, string> = { done: '[x]', issue: '[!]', na: '[-]', todo: '[ ]' };
    run.items.forEach((item, index) => {
        const time = item.doneAt ? ` (${timeOfDay(item.doneAt)})` : '';
        out.push(`${mark[item.status]} ${index + 1}. ${item.title}${item.status !== 'done' ? ` - ${STATUS_TEXT[item.status]}` : ''}${time}`);
        if (item.note.trim()) out.push(`    Ghi chú: ${item.note.trim()}`);
        if (item.photos.length) out.push(`    ${item.photos.length} ảnh`);
    });
    if (run.note.trim()) {
        out.push('');
        out.push(`Ghi chú chung: ${run.note.trim()}`);
    }
    return out.join('\n');
};

/** Lịch của mẫu checklist có rơi vào ngày chứa `ms` không */
export const scheduledOn = (template: ChecklistTemplate, ms: number): boolean =>
    template.schedule.enabled && template.schedule.days.includes(new Date(ms).getDay());

export interface ChecklistAlert {
    key: string;
    templateId: string;
    date: string;
    at: number;
    kind: 'start' | 'due' | 'late';
}

/**
 * Nhắc của checklist có lịch: lúc bắt đầu (chưa có lượt nào hoàn tất trong ngày), 15 phút trước hạn và lúc hạn nếu chưa hoàn tất.
 */
export const checklistAlerts = (templates: ChecklistTemplate[], runs: ChecklistRun[], fired: Record<string, number>, now: number): { due: ChecklistAlert[]; missed: ChecklistAlert[] } => {
    const due: ChecklistAlert[] = [];
    const missed: ChecklistAlert[] = [];
    const today = startOfDay(now);
    for (const template of templates) {
        for (const day of [today - DAY, today]) {
            if (!scheduledOn(template, day)) continue;
            const date = dateKey(day);
            const finished = runs.some(run => run.templateId === template.id && run.date === date && run.finishedAt);
            if (finished || day < template.createdAt - DAY) continue;
            const started = runs.some(run => run.templateId === template.id && run.date === date);
            const points: ChecklistAlert[] = [
                ...(started ? [] : [{ key: `cl:${template.id}@${date}#start`, templateId: template.id, date, at: atTime(day, template.schedule.start), kind: 'start' as const }]),
                { key: `cl:${template.id}@${date}#due`, templateId: template.id, date, at: atTime(day, template.schedule.due) - 15 * MINUTE, kind: 'due' },
                { key: `cl:${template.id}@${date}#late`, templateId: template.id, date, at: atTime(day, template.schedule.due), kind: 'late' },
            ];
            const reached = points.filter(point => point.at <= now && point.at > template.updatedAt && !fired[point.key]);
            const latest = reached.sort((a, b) => b.at - a.at)[0];
            if (!latest) continue;
            (latest.at >= now - LATE_GRACE ? due : missed).push(latest);
        }
    }
    return { due, missed };
};

// ---------- Thống kê ----------

export interface PersonStat {
    name: string;
    /** Số lần hạn đã đến trong khoảng */
    total: number;
    acked: number;
    onTime: number;
    late: number;
    /** Đã qua hạn mà chưa xong */
    open: number;
    help: number;
}

/**
 * Thống kê theo người: mỗi lần hạn đã đến tính cho người xử lý; việc không giao đích danh thì tính cho người bấm Đã xong, chưa ai
 * xong thì tính cho bộ phận (hoặc Việc chung).
 */
export const personStats = (reminders: Reminder[], from: number, to: number): PersonStat[] => {
    const byName = new Map<string, PersonStat>();
    for (const reminder of reminders) {
        for (const occ of occurrencesBetween(reminder, Math.max(from, reminder.createdAt), to)) {
            const key = String(occ);
            const name = reminder.assignee?.trim() || reminder.doneInfo?.[key]?.by.trim() || (reminder.department?.trim() ? `Bộ phận ${reminder.department.trim()}` : 'Việc chung');
            const stat = byName.get(nameKey(name)) ?? { name, total: 0, acked: 0, onTime: 0, late: 0, open: 0, help: 0 };
            stat.total += 1;
            if (reminder.acks?.[key]) stat.acked += 1;
            if (reminder.helps?.[key]) stat.help += 1;
            const doneAt = reminder.done[key];
            if (doneAt === undefined) stat.open += 1;
            else if (doneAt <= occ) stat.onTime += 1;
            else stat.late += 1;
            byName.set(nameKey(name), stat);
        }
    }
    return [...byName.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'vi'));
};

export interface Stats {
    runs: number;
    finished: number;
    onTime: number;
    late: number;
    unfinished: number;
    /** Việc hay gặp vấn đề nhất */
    topIssues: { title: string; count: number }[];
    remindersDone: number;
    remindersMissed: number;
}

export const statsBetween = (reminders: Reminder[], runs: ChecklistRun[], from: number, to: number): Stats => {
    const inRange = runs.filter(run => run.startedAt >= from && run.startedAt <= to);
    const issues = new Map<string, number>();
    for (const run of inRange) for (const item of run.items) if (item.status === 'issue') issues.set(item.title, (issues.get(item.title) ?? 0) + 1);
    let remindersDone = 0;
    let remindersMissed = 0;
    for (const reminder of reminders) {
        for (const occ of occurrencesBetween(reminder, Math.max(from, reminder.createdAt), Math.min(to, Date.now()))) {
            if (reminder.done[String(occ)]) remindersDone += 1;
            else remindersMissed += 1;
        }
    }
    const finished = inRange.filter(run => run.finishedAt);
    return {
        runs: inRange.length,
        finished: finished.length,
        onTime: finished.filter(run => runOnTime(run)).length,
        late: finished.filter(run => runOnTime(run) === false).length,
        unfinished: inRange.length - finished.length,
        topIssues: [...issues.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([title, count]) => ({ title, count })),
        remindersDone,
        remindersMissed,
    };
};
