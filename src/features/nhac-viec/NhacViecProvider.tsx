import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { getSetting, saveSetting } from '../sticker-event/services/dbService';
import type { ReminderPopupData } from '../../../electron/contract';
import type { ChecklistAlert, ChecklistRun, ChecklistTemplate, Reminder } from './nhacViecModel';
import {
    DAY, MINUTE, checklistAlerts, dateKey, defaultSpeech, markDone, markFired, newId, pendingAlerts, pruneReminder, reminderView,
    runProgress, startRun, startOfDay, timeOfDay,
} from './nhacViecModel';

export const KEYS = {
    reminders: 'nhacViecReminders',
    templates: 'nhacViecTemplates',
    runs: 'nhacViecRuns',
    media: 'nhacViecMedia',
    state: 'nhacViecState',
} as const;

const MAX_RUNS = 1000;

export interface MediaEntry {
    dataUrl: string;
    name: string;
    kind: 'audio' | 'image';
    createdAt: number;
}

interface NhacViecState {
    /** Lần nhắc checklist đã hiện */
    checklistFired: Record<string, number>;
    /** Hoãn nhắc checklist: khoá cửa sổ → lúc nhắc lại */
    checklistSnoozes: Record<string, number>;
    /** Người thực hiện, nhớ cho lần sau */
    performer: string;
}

const EMPTY_STATE: NhacViecState = { checklistFired: {}, checklistSnoozes: {}, performer: '' };

export type OpenRequest =
    | { kind: 'today' }
    | { kind: 'reminder'; id: string }
    | { kind: 'run'; id: string };

interface NhacViecApi {
    loaded: boolean;
    /** Giờ hiện tại, cập nhật mỗi 30 giây để danh sách tự đổi trạng thái */
    now: number;
    reminders: Reminder[];
    templates: ChecklistTemplate[];
    runs: ChecklistRun[];
    performer: string;
    setPerformer: (name: string) => void;
    saveReminder: (reminder: Reminder) => void;
    deleteReminder: (id: string) => void;
    completeReminder: (id: string, occ: number) => void;
    saveTemplate: (template: ChecklistTemplate) => void;
    deleteTemplate: (id: string) => void;
    /** Lượt làm hôm nay của mẫu (chưa hoàn tất) hoặc lượt mới */
    openRunFor: (templateId: string) => ChecklistRun | null;
    saveRun: (run: ChecklistRun) => void;
    deleteRun: (id: string) => void;
    addMedia: (entry: Omit<MediaEntry, 'createdAt'>) => Promise<string>;
    getMedia: (id: string) => MediaEntry | null;
    openRequest: OpenRequest | null;
    clearOpenRequest: () => void;
    /** Số việc quá hạn, hiện trên thanh bên trái */
    badge: number;
}

const Ctx = createContext<NhacViecApi | null>(null);

export const useNhacViec = (): NhacViecApi => {
    const value = useContext(Ctx);
    if (!value) throw new Error('Thiếu NhacViecProvider');
    return value;
};

type TestWindow = Window & { __nhacViecOffset?: number; __nhacViecTick?: () => void };
/** Bài kiểm thử dời đồng hồ bằng `__nhacViecOffset` để không phải chờ đến giờ thật */
export const clockNow = (): number => Date.now() + ((window as TestWindow).__nhacViecOffset ?? 0);

/** Đọc file ảnh hoặc âm thanh trong kho của nhắc việc (dùng được cả ở cửa sổ nhắc) */
export const loadMediaDataUrl = async (id: string): Promise<string | null> => {
    const media = await getSetting<Record<string, MediaEntry>>(KEYS.media);
    return media?.[id]?.dataUrl ?? null;
};

const desktop = () => (typeof window !== 'undefined' ? window.stickerDesktop?.reminders : undefined);

export const NhacViecProvider: React.FC<{ enabled: boolean; onOpen: () => void; children: React.ReactNode }> = ({ enabled, onOpen, children }) => {
    const [loaded, setLoaded] = useState(false);
    const [now, setNow] = useState(clockNow);
    const [reminders, setReminders] = useState<Reminder[]>([]);
    const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
    const [runs, setRuns] = useState<ChecklistRun[]>([]);
    const [state, setState] = useState<NhacViecState>(EMPTY_STATE);
    const [media, setMedia] = useState<Record<string, MediaEntry>>({});
    const [openRequest, setOpenRequest] = useState<OpenRequest | null>(null);
    const refs = useRef({ reminders, templates, runs, state, media });
    refs.current = { reminders, templates, runs, state, media };
    const onOpenRef = useRef(onOpen);
    onOpenRef.current = onOpen;

    useEffect(() => {
        let cancelled = false;
        void Promise.all([
            getSetting<Reminder[]>(KEYS.reminders), getSetting<ChecklistTemplate[]>(KEYS.templates), getSetting<ChecklistRun[]>(KEYS.runs),
            getSetting<NhacViecState>(KEYS.state), getSetting<Record<string, MediaEntry>>(KEYS.media),
        ]).then(([savedReminders, savedTemplates, savedRuns, savedState, savedMedia]) => {
            if (cancelled) return;
            setReminders(Array.isArray(savedReminders) ? savedReminders : []);
            setTemplates(Array.isArray(savedTemplates) ? savedTemplates : []);
            setRuns(Array.isArray(savedRuns) ? savedRuns : []);
            setState({ ...EMPTY_STATE, ...(savedState ?? {}) });
            setMedia(savedMedia && typeof savedMedia === 'object' ? savedMedia : {});
            setLoaded(true);
        });
        return () => {
            cancelled = true;
        };
    }, []);

    const commitReminders = useCallback((next: Reminder[]) => {
        refs.current.reminders = next;
        setReminders(next);
        void saveSetting(KEYS.reminders, next);
    }, []);
    const commitTemplates = useCallback((next: ChecklistTemplate[]) => {
        refs.current.templates = next;
        setTemplates(next);
        void saveSetting(KEYS.templates, next);
    }, []);
    const commitRuns = useCallback((next: ChecklistRun[]) => {
        const trimmed = next.slice(0, MAX_RUNS);
        refs.current.runs = trimmed;
        setRuns(trimmed);
        void saveSetting(KEYS.runs, trimmed);
    }, []);
    const commitState = useCallback((next: NhacViecState) => {
        refs.current.state = next;
        setState(next);
        void saveSetting(KEYS.state, next);
    }, []);
    const commitMedia = useCallback((next: Record<string, MediaEntry>) => {
        refs.current.media = next;
        setMedia(next);
        void saveSetting(KEYS.media, next);
    }, []);

    /** Bỏ ảnh và âm thanh không còn nhắc việc hay lượt checklist nào dùng */
    const collectMedia = useCallback(() => {
        const used = new Set<string>();
        for (const reminder of refs.current.reminders) if (reminder.sound.kind === 'file') used.add(reminder.sound.mediaId);
        for (const run of refs.current.runs) for (const item of run.items) item.photos.forEach(id => used.add(id));
        const current = refs.current.media;
        if (Object.keys(current).every(id => used.has(id))) return;
        commitMedia(Object.fromEntries(Object.entries(current).filter(([id]) => used.has(id))));
    }, [commitMedia]);

    // ---------- Hẹn giờ ----------

    const showPopup = useCallback((data: Omit<ReminderPopupData, 'shownAt'>) => {
        void desktop()?.showPopup({ ...data, shownAt: clockNow() });
    }, []);

    const checklistPopup = useCallback((alert: Pick<ChecklistAlert, 'templateId' | 'date' | 'kind'>, at: number): Omit<ReminderPopupData, 'shownAt'> | null => {
        const template = refs.current.templates.find(item => item.id === alert.templateId);
        if (!template) return null;
        const run = refs.current.runs.find(item => item.templateId === template.id && item.date === alert.date);
        const progress = run ? runProgress(run) : null;
        const left = progress ? `${progress.todo}/${progress.total}` : `${template.items.length}/${template.items.length}`;
        const content = alert.kind === 'start'
            ? `Đến giờ làm checklist (${template.items.length} việc). Hạn ${template.schedule.due}.`
            : alert.kind === 'due' ? `Còn ${left} việc chưa xong, hạn ${template.schedule.due}.` : `Đã quá hạn ${template.schedule.due}, còn ${left} việc chưa xong.`;
        return {
            key: `cl:${template.id}@${alert.date}`,
            kind: 'checklist',
            title: `Checklist: ${template.name}`,
            content,
            deadline: at,
            priority: alert.kind === 'late' ? 'urgent' : 'important',
            sound: { kind: 'preset', preset: alert.kind === 'late' ? 'coi' : 'chuong' },
            speech: `Checklist ${template.name}. ${content}`,
            hasChecklist: true,
        };
    }, []);

    const tick = useCallback(() => {
        if (!enabled) return;
        const at = clockNow();
        setNow(at);
        const { reminders: list, templates: tpls, runs: runList, state: st } = refs.current;
        const { due, missed } = pendingAlerts(list, at);
        const checklist = checklistAlerts(tpls, runList, st.checklistFired, at);
        const missedLines: { title: string; at: number }[] = [];
        let nextReminders = list;
        const touch = (id: string, change: (reminder: Reminder) => Reminder) => {
            nextReminders = nextReminders.map(reminder => (reminder.id === id ? change(reminder) : reminder));
        };
        for (const alert of due) {
            const reminder = list.find(item => item.id === alert.reminderId)!;
            showPopup({
                key: `${reminder.id}@${alert.occ}`,
                kind: 'reminder',
                title: reminder.title,
                content: reminder.content,
                deadline: alert.occ,
                priority: reminder.priority,
                sound: reminder.sound,
                speech: defaultSpeech(reminder, alert.occ, at),
                hasChecklist: Boolean(reminder.checklistTemplateId),
            });
            touch(reminder.id, item => markFired(item, alert.occ, at));
        }
        for (const alert of missed) {
            const reminder = list.find(item => item.id === alert.reminderId)!;
            missedLines.push({ title: reminder.title, at: alert.occ });
            touch(reminder.id, item => markFired(item, alert.occ, at));
        }
        const fired = { ...st.checklistFired };
        const snoozes = { ...st.checklistSnoozes };
        let stateChanged = false;
        for (const alert of checklist.due) {
            const data = checklistPopup(alert, atTimeOf(alert));
            if (data) showPopup(data);
            fired[alert.key] = at;
            stateChanged = true;
        }
        for (const alert of checklist.missed) {
            const template = tpls.find(item => item.id === alert.templateId);
            if (template) missedLines.push({ title: `Checklist: ${template.name}`, at: alert.at });
            fired[alert.key] = at;
            stateChanged = true;
        }
        for (const [key, until] of Object.entries(snoozes)) {
            if (until > at) continue;
            delete snoozes[key];
            stateChanged = true;
            const [templateId, date] = key.slice(3).split('@');
            const data = checklistPopup({ templateId, date, kind: 'due' }, until);
            if (data) showPopup(data);
        }
        if (missedLines.length > 0) {
            showPopup({
                key: `missed@${at}`,
                kind: 'missed',
                title: `Bạn đã bỏ lỡ ${missedLines.length} nhắc việc`,
                content: 'Các nhắc việc này đến giờ lúc app đang tắt hoặc máy đang ngủ.',
                priority: 'important',
                sound: { kind: 'preset', preset: 'chuong-cua' },
                speech: `Bạn đã bỏ lỡ ${missedLines.length} nhắc việc.`,
                missed: missedLines.sort((a, b) => a.at - b.at),
            });
        }
        if (nextReminders !== list) commitReminders(nextReminders.map(reminder => pruneReminder(reminder, at)));
        if (stateChanged) {
            // Bỏ dấu đã hiện cũ hơn 7 ngày
            const keep = at - 7 * DAY;
            commitState({ ...st, checklistFired: Object.fromEntries(Object.entries(fired).filter(([, time]) => time >= keep)), checklistSnoozes: snoozes });
        }
    }, [enabled, showPopup, checklistPopup, commitReminders, commitState]);

    useEffect(() => {
        if (!loaded || !enabled) return;
        tick();
        const timer = window.setInterval(tick, 15_000);
        const offRecheck = desktop()?.onRecheck(tick);
        const onVisible = () => tick();
        document.addEventListener('visibilitychange', onVisible);
        (window as TestWindow).__nhacViecTick = tick;
        return () => {
            window.clearInterval(timer);
            offRecheck?.();
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [loaded, enabled, tick]);

    // Giờ trên màn tự đổi mỗi 30 giây kể cả khi tắt nhắc
    useEffect(() => {
        const timer = window.setInterval(() => setNow(clockNow()), 30_000);
        return () => window.clearInterval(timer);
    }, []);

    // ---------- Lượt checklist ----------

    const openRunFor = useCallback((templateId: string): ChecklistRun | null => {
        const template = refs.current.templates.find(item => item.id === templateId);
        if (!template) return null;
        const at = clockNow();
        const today = dateKey(at);
        const existing = refs.current.runs.find(run => run.templateId === templateId && run.date === today && !run.finishedAt);
        if (existing) return existing;
        const run = startRun(template, at, refs.current.state.performer);
        commitRuns([run, ...refs.current.runs]);
        return run;
    }, [commitRuns]);

    // ---------- Nút trên cửa sổ nhắc ----------

    useEffect(() => {
        const off = desktop()?.onAction(action => {
            const at = clockNow();
            if (action.key.startsWith('missed@')) {
                if (action.action === 'open') {
                    setOpenRequest({ kind: 'today' });
                    onOpenRef.current();
                }
                return;
            }
            if (action.key.startsWith('cl:')) {
                const [templateId] = action.key.slice(3).split('@');
                if (action.action === 'snooze') {
                    const st = refs.current.state;
                    commitState({ ...st, checklistSnoozes: { ...st.checklistSnoozes, [action.key]: at + (action.minutes ?? 10) * MINUTE } });
                } else if (action.action === 'open') {
                    const run = openRunFor(templateId);
                    if (run) setOpenRequest({ kind: 'run', id: run.id });
                    onOpenRef.current();
                }
                return;
            }
            const [id, occText] = action.key.split('@');
            const occ = Number(occText);
            const reminder = refs.current.reminders.find(item => item.id === id);
            if (!reminder) return;
            if (action.action === 'done') {
                commitReminders(refs.current.reminders.map(item => (item.id === id ? markDone(item, occ, at) : item)));
            } else if (action.action === 'snooze') {
                commitReminders(refs.current.reminders.map(item => (item.id === id
                    ? { ...markFired(item, occ, at), snoozes: [...item.snoozes.filter(s => s.occ !== occ), { occ, at: at + (action.minutes ?? 10) * MINUTE }] }
                    : item)));
            } else if (action.action === 'open') {
                if (reminder.checklistTemplateId) {
                    const run = openRunFor(reminder.checklistTemplateId);
                    setOpenRequest(run ? { kind: 'run', id: run.id } : { kind: 'reminder', id });
                } else {
                    setOpenRequest({ kind: 'reminder', id });
                }
                onOpenRef.current();
            }
        });
        return () => off?.();
    }, [commitReminders, commitState, openRunFor]);

    // ---------- Thao tác từ màn Nhắc việc ----------

    const api = useMemo<NhacViecApi>(() => {
        const reminderList = reminders;
        const today = startOfDay(now);
        const overdueReminders = reminderList.filter(reminder => reminderView(reminder, now).state === 'overdue').length;
        const overdueChecklists = templates.filter(template => {
            if (!template.schedule.enabled || !template.schedule.days.includes(new Date(now).getDay())) return false;
            const due = new Date(today);
            const [h, m] = template.schedule.due.split(':').map(Number);
            due.setHours(h || 0, m || 0);
            return now > due.getTime() && !runs.some(run => run.templateId === template.id && run.date === dateKey(now) && run.finishedAt);
        }).length;
        return {
            loaded,
            now,
            reminders,
            templates,
            runs,
            performer: state.performer,
            setPerformer: name => commitState({ ...refs.current.state, performer: name }),
            saveReminder: reminder => {
                const list = refs.current.reminders;
                commitReminders(list.some(item => item.id === reminder.id) ? list.map(item => (item.id === reminder.id ? reminder : item)) : [reminder, ...list]);
                collectMedia();
            },
            deleteReminder: id => {
                commitReminders(refs.current.reminders.filter(item => item.id !== id));
                collectMedia();
            },
            completeReminder: (id, occ) => {
                commitReminders(refs.current.reminders.map(item => (item.id === id ? markDone(item, occ, clockNow()) : item)));
                void desktop()?.closePopup(`${id}@${occ}`);
            },
            saveTemplate: template => {
                const list = refs.current.templates;
                commitTemplates(list.some(item => item.id === template.id) ? list.map(item => (item.id === template.id ? template : item)) : [...list, template]);
            },
            deleteTemplate: id => {
                commitTemplates(refs.current.templates.filter(item => item.id !== id));
                commitReminders(refs.current.reminders.map(item => (item.checklistTemplateId === id ? { ...item, checklistTemplateId: undefined } : item)));
            },
            openRunFor,
            saveRun: run => {
                const list = refs.current.runs;
                commitRuns(list.some(item => item.id === run.id) ? list.map(item => (item.id === run.id ? run : item)) : [run, ...list]);
                if (run.finishedAt) void desktop()?.closePopup(`cl:${run.templateId}@${run.date}`);
                collectMedia();
            },
            deleteRun: id => {
                commitRuns(refs.current.runs.filter(item => item.id !== id));
                collectMedia();
            },
            addMedia: async entry => {
                const id = newId('m');
                commitMedia({ ...refs.current.media, [id]: { ...entry, createdAt: Date.now() } });
                return id;
            },
            getMedia: id => media[id] ?? null,
            openRequest,
            clearOpenRequest: () => setOpenRequest(null),
            badge: overdueReminders + overdueChecklists,
        };
    }, [loaded, now, reminders, templates, runs, state.performer, media, openRequest, commitReminders, commitTemplates, commitRuns, commitState, commitMedia, collectMedia, openRunFor]);

    return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
};

const atTimeOf = (alert: ChecklistAlert) => alert.at;

export { timeOfDay };
