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

export const markDone = (reminder: Reminder, occ: number, now: number): Reminder => ({
    ...markFired(reminder, occ, now),
    done: { ...reminder.done, [String(occ)]: now },
    snoozes: reminder.snoozes.filter(snooze => snooze.occ !== occ),
    updatedAt: now,
});

export const snooze = (reminder: Reminder, occ: number, minutes: number, now: number): Reminder => ({
    ...markFired(reminder, occ, now),
    snoozes: [...reminder.snoozes.filter(item => item.occ !== occ), { occ, at: now + minutes * MINUTE }],
    updatedAt: now,
});

/** Bỏ dấu đã hiện, đã xong cũ hơn 40 ngày để dữ liệu nhắc lặp lại không phình mãi. */
export const pruneReminder = (reminder: Reminder, now: number): Reminder => {
    const keep = now - 40 * DAY;
    const fired = Object.fromEntries(Object.entries(reminder.fired).filter(([, at]) => at >= keep));
    const done = reminder.repeat === 'none' ? reminder.done : Object.fromEntries(Object.entries(reminder.done).filter(([occ]) => Number(occ) >= keep));
    return { ...reminder, fired, done, snoozes: reminder.snoozes.filter(item => item.at >= keep) };
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
    out.push(`Ngày ${run.date.split('-').reverse().join('/')}${run.performer ? ` · Người làm: ${run.performer}` : ''}`);
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
