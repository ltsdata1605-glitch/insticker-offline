import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { getSetting, saveSetting } from '../sticker-event/services/dbService';
import type { BridgeResponse, ReminderPopupData, SheetFetchResult } from '../../../electron/contract';
import { toast } from '../../components/shared/ui/toast';
import type { SheetReadResult, SheetTable } from './sheetTasks';
import { SYNC_EVERY, checklistIdFor, mergeSheetChecklists, mergeSheetTasks, readSheetTables, sheetIdFromUrl } from './sheetTasks';
import type { BridgeResult, DoneEntry, NewOp, OutboxOp, SheetEvent } from './sheetBridge';
import {
    BRIDGE_SYNC_EVERY, BRIDGE_V2, adoptTemplate, applyDoneLog, applyEvents, applyResults, bridgeLinkFrom, buildOps, doneToday, enqueue, localReminders, localTemplates,
    opHasPhotos,
} from './sheetBridge';
import type { ChecklistAlert, ChecklistRun, ChecklistTemplate, MachineRole, OccEvent, Reminder } from './nhacViecModel';
import {
    DAY, DEFAULT_DEPARTMENTS, MINUTE, OVERDUE_ALERT_AFTER, applyTemplateToRun, atTime, checklistAlerts, dateKey, dayOfKey, defaultSpeech, dropLeftoverRuns, markDone, markFired,
    newId, pendingAlerts, pruneReminder, reminderView, ringsHere, runOfDay, runProgress, sameName, shownHere, startRun, startOfDay, timeOfDay, watchedHere,
} from './nhacViecModel';

export const KEYS = {
    reminders: 'nhacViecReminders',
    templates: 'nhacViecTemplates',
    runs: 'nhacViecRuns',
    media: 'nhacViecMedia',
    state: 'nhacViecState',
} as const;

const MAX_RUNS = 1000;
/** Kiểm tra nhắc đến giờ mỗi 5 giây: nhắc trễ tối đa vài giây */
const TICK_EVERY = 5_000;

export interface MediaEntry {
    dataUrl: string;
    name: string;
    kind: 'audio' | 'image';
    createdAt: number;
}

/** File Google Sheet nhận việc */
export interface SheetConfig {
    /** Link chia sẻ của file (chỉ đọc) hoặc Link kết nối của cầu nối (đồng bộ hai chiều) */
    url: string;
    /** Không ghi là chỉ đọc (bản trước 1.4.2) */
    mode?: 'view' | 'bridge';
    connectedAt: number;
    /** Đồng bộ hai chiều: tên file, link mở file, dấu phiên bản lần đọc trước, danh sách người ở trang Danh mục */
    title?: string;
    sheetUrl?: string;
    version?: string;
    staff?: string[];
    assigners?: string[];
    lastSyncAt?: number;
    lastOk?: boolean;
    /** Lý do lần đồng bộ cuối không được */
    lastMessage?: string;
    /** Số việc đang giao trong file */
    taskCount?: number;
    /** Số checklist đang dùng trong file */
    checklistCount?: number;
    /** Dòng ghi sai, app bỏ qua */
    skipped?: { row: number; reason: string; sheet?: string }[];
    /** Phiên bản script cầu nối trong file (1: bản cũ chưa có Đã nhận, Cần hỗ trợ, ảnh, checklist từ app) */
    scriptVersion?: number;
}

interface NhacViecState {
    /** Lần nhắc checklist đã hiện */
    checklistFired: Record<string, number>;
    /** Hoãn nhắc checklist: khoá cửa sổ → lúc nhắc lại */
    checklistSnoozes: Record<string, number>;
    /** Người thực hiện, nhớ cho lần sau */
    performer: string;
    sheet?: SheetConfig;
    /** Thay đổi chờ gửi lên Google Sheet (đồng bộ hai chiều): mất mạng thì giữ lại, có mạng gửi tiếp */
    outbox?: OutboxOp[];
    /** Bộ phận của máy (Kho, Thu ngân, Quản lý…): chỉ nhắc việc của bộ phận và việc chung. Trống là nhận mọi việc. */
    department?: string;
    /** Đã báo quản lý, người giao: việc quá hạn, lần cần hỗ trợ (khoá → lúc báo) */
    watchSeen?: Record<string, number>;
}

const SHEET_ERRORS: Record<Exclude<SheetFetchResult, { ok: true }>['reason'], string> = {
    'invalid-url': 'Link không phải link Google Sheet. Hãy sao chép link từ nút Chia sẻ của file.',
    'not-shared': 'File chưa chia sẻ cho người có link. Mở file, bấm Chia sẻ, chọn Bất kỳ ai có đường liên kết.',
    'not-found': 'Không tìm thấy file: link sai hoặc file đã bị xoá.',
    'offline': 'Không có mạng hoặc Google không trả lời. App sẽ tự thử lại.',
    'error': 'Không đọc được file. App sẽ tự thử lại.',
};

type BridgeFailure = Exclude<BridgeResponse, { ok: true }>['reason'] | 'key' | 'mau';

const BRIDGE_ERRORS: Record<BridgeFailure, string> = {
    'invalid-url': 'Link kết nối không đúng. Trong file, menu Nhắc việc → Bật đồng bộ hai chiều → Sao chép Link kết nối.',
    'not-public': 'Cầu nối chưa cho máy khác dùng. Trong Apps Script: Triển khai → Quản lý bản triển khai → bút chì, chọn Người có quyền truy cập: Bất kỳ ai.',
    'not-found': 'Không tìm thấy cầu nối: link không trỏ tới bản đã triển khai. Quản lý mở file, menu Nhắc việc → Bật đồng bộ hai chiều → Dán lại URL ứng dụng web, rồi gửi lại Link kết nối.',
    'offline': 'Không có mạng hoặc Google không trả lời. App giữ lại thay đổi và tự gửi khi có mạng.',
    'error': 'Cầu nối báo lỗi. App sẽ tự thử lại.',
    'key': 'Link kết nối đã đổi mã. Xin quản lý Link kết nối mới rồi dán lại.',
    'mau': 'File không đúng mẫu: không thấy trang Nhắc việc. Đừng đổi tên các trang của file mẫu.',
};

/** Dữ liệu cầu nối trả về */
interface BridgeData {
    ok?: boolean;
    error?: string;
    message?: string;
    unchanged?: boolean;
    version?: string;
    title?: string;
    sheetUrl?: string;
    tables?: SheetTable[];
    doneLog?: DoneEntry[];
    /** Script bản 2: mọi dòng Nhật ký gần đây (Đã nhận, Cần hỗ trợ, Xong) */
    events?: SheetEvent[];
    staff?: string[];
    assigners?: string[];
    results?: BridgeResult[];
    /** Phiên bản script */
    v?: number;
}

const bridgeError = (data: BridgeData | null | undefined): string =>
    data?.error === 'key' ? BRIDGE_ERRORS.key : data?.error === 'mau' ? BRIDGE_ERRORS.mau : `Cầu nối báo lỗi${data?.message ? `: ${data.message}` : ''}. App sẽ tự thử lại.`;

const EMPTY_STATE: NhacViecState = { checklistFired: {}, checklistSnoozes: {}, performer: '' };

const roleOf = (state: NhacViecState): MachineRole => ({ department: state.department ?? '', performer: state.performer });
const isBridgeV2 = (state: NhacViecState): boolean => state.sheet?.mode === 'bridge' && (state.sheet.scriptVersion ?? 1) >= BRIDGE_V2;
/** Tên ghi vào file khi máy chưa đặt tên */
const byOf = (state: NhacViecState): string => state.performer.trim() || 'Máy chưa đặt tên';

export type OpenRequest =
    | { kind: 'today' }
    | { kind: 'reminder'; id: string }
    | { kind: 'run'; id: string }
    /** Bấm Đã xong trên cửa sổ nhắc mà việc cần kèm ghi chú, ảnh; bấm Cần hỗ trợ */
    | { kind: 'done'; id: string; occ: number }
    | { kind: 'help'; id: string; occ: number };

/** Ghi chú, ảnh (data URL) kèm khi bấm Đã xong hay Cần hỗ trợ */
export interface OccExtra {
    note?: string;
    photos?: string[];
}

interface NhacViecApi {
    loaded: boolean;
    /** Giờ hiện tại, cập nhật mỗi 30 giây để danh sách tự đổi trạng thái */
    now: number;
    reminders: Reminder[];
    templates: ChecklistTemplate[];
    runs: ChecklistRun[];
    performer: string;
    setPerformer: (name: string) => void;
    /** Bộ phận và tên của máy này */
    role: MachineRole;
    /** Đổi bộ phận của máy (giao diện hỏi mật khẩu quản lý trước) */
    setDepartment: (department: string) => void;
    /** Các bộ phận để chọn: có sẵn và bộ phận ghi trong file */
    departments: string[];
    /** Việc, checklist hiện trên máy này (máy quản lý thấy hết; máy bộ phận chỉ thấy việc của bộ phận và việc chung) */
    visibleReminders: Reminder[];
    visibleTemplates: ChecklistTemplate[];
    /** Đồng bộ hai chiều với script bản mới: có Đã nhận, Cần hỗ trợ, ảnh, checklist từ app */
    bridgeV2: boolean;
    /** Đang đồng bộ hai chiều thì mọi việc lưu đều ghi lên Google Sheet */
    saveReminder: (reminder: Reminder) => void;
    deleteReminder: (id: string) => void;
    /** Đã xong, có thể kèm ghi chú và ảnh */
    completeReminder: (id: string, occ: number, extra?: OccExtra) => void;
    /** Đã nhận việc (lần hạn `occ`) */
    ackReminder: (id: string, occ: number) => void;
    /** Cần hỗ trợ: lý do, ảnh */
    requestHelp: (id: string, occ: number, extra: OccExtra) => void;
    saveTemplate: (template: ChecklistTemplate) => void;
    deleteTemplate: (id: string) => void;
    /** Lượt hôm nay của mẫu: đang làm dở, hoặc đã hoàn tất (mở ra xem, không làm lại từ đầu); chưa có thì bắt đầu lượt mới */
    openRunFor: (templateId: string) => ChecklistRun | null;
    /** Bắt đầu thêm một lượt mới của mẫu dù hôm nay đã làm */
    startNewRun: (templateId: string) => ChecklistRun | null;
    saveRun: (run: ChecklistRun) => void;
    deleteRun: (id: string) => void;
    addMedia: (entry: Omit<MediaEntry, 'createdAt'>) => Promise<string>;
    getMedia: (id: string) => MediaEntry | null;
    openRequest: OpenRequest | null;
    clearOpenRequest: () => void;
    /** Số việc quá hạn, hiện trên thanh bên trái */
    badge: number;
    sheet: SheetConfig | null;
    /** Đang đồng bộ hai chiều qua cầu nối */
    bridge: boolean;
    /** Số thay đổi chưa gửi lên Google Sheet */
    pendingCount: number;
    /** Người xử lý ở trang Danh mục của file */
    staff: string[];
    syncing: boolean;
    /** Kết nối bằng Link kết nối (đồng bộ hai chiều) hoặc link chia sẻ file (chỉ đọc): đọc thử, đúng mẫu thì lưu và nhận việc ngay */
    connectSheet: (url: string) => Promise<{ ok: boolean; message: string }>;
    disconnectSheet: () => void;
    syncSheet: () => Promise<void>;
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
    const [syncing, setSyncing] = useState(false);
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
            const runList = Array.isArray(savedRuns) ? savedRuns : [];
            const cleaned = dropLeftoverRuns(runList);
            if (cleaned.length !== runList.length) void saveSetting(KEYS.runs, cleaned);
            setRuns(cleaned);
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
        for (const reminder of refs.current.reminders) {
            if (reminder.sound.kind === 'file') used.add(reminder.sound.mediaId);
            for (const info of [...Object.values(reminder.doneInfo ?? {}), ...Object.values(reminder.helps ?? {})]) info.photos?.forEach(id => used.add(id));
        }
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
        // Hạn thật của checklist trong ngày (nhắc lúc bắt đầu cũng ghi hạn, không ghi giờ bắt đầu)
        const due = template.schedule.due ? atTime(dayOfKey(alert.date), template.schedule.due) : at;
        const content = alert.kind === 'start'
            ? `Đến giờ làm checklist (${template.items.length} việc), bắt đầu ${template.schedule.start}. Hạn ${template.schedule.due}.`
            : alert.kind === 'due' ? `Còn ${left} việc chưa xong, hạn ${template.schedule.due}.` : `Đã quá hạn ${template.schedule.due}, còn ${left} việc chưa xong.`;
        return {
            key: `cl:${template.id}@${alert.date}`,
            kind: 'checklist',
            title: `Checklist: ${template.name}`,
            content,
            deadline: due,
            priority: alert.kind === 'late' ? 'urgent' : 'important',
            sound: { kind: 'preset', preset: alert.kind === 'late' ? 'coi' : 'chuong' },
            speech: `Checklist ${template.name}. ${content}`,
            hasChecklist: true,
        };
    }, []);

    const lastNow = useRef(0);
    /** Cửa sổ báo việc mới → các việc trong đó (bấm Đã nhận là nhận hết) */
    const newBatches = useRef(new Map<string, string[]>());
    const tick = useCallback(() => {
        if (!enabled) return;
        const at = clockNow();
        // Đổi giờ trên màn mỗi 15 giây là đủ, kiểm tra nhắc thì dày hơn
        if (Math.abs(at - lastNow.current) >= 15_000) {
            lastNow.current = at;
            setNow(at);
        }
        const { reminders: list, templates: tpls, runs: runList, state: st } = refs.current;
        // Máy có bộ phận: chỉ nhắc việc của bộ phận, việc chung và việc giao đích danh cho người dùng máy
        const role = roleOf(st);
        const { due, missed } = pendingAlerts(list.filter(reminder => ringsHere(reminder, role)), at);
        const checklist = checklistAlerts(tpls.filter(template => ringsHere(template, role)), runList, st.checklistFired, at);
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
                assignee: reminder.assignee,
                assigner: reminder.assigner,
                department: reminder.department,
                proof: reminder.proof,
                canAck: isBridgeV2(st) && !reminder.acks?.[String(alert.occ)],
                canHelp: isBridgeV2(st),
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
        // Máy quản lý, người giao: việc của người khác quá hạn 15 phút chưa xong thì báo một lần (chỉ khi vừa đồng bộ được với file,
        // để không báo nhầm việc đã xong ở máy khác)
        const watchSeen = { ...(st.watchSeen ?? {}) };
        const lateLines: { title: string; at: number; note?: string }[] = [];
        if (st.sheet?.mode === 'bridge' && st.sheet.lastOk !== false && (st.sheet.lastSyncAt ?? 0) > at - 5 * MINUTE) {
            for (const reminder of list) {
                if (reminder.stopped || !watchedHere(reminder, role)) continue;
                const view = reminderView(reminder, at);
                if (view.state !== 'overdue' || view.occ === null) continue;
                const late = at - view.occ;
                if (late < OVERDUE_ALERT_AFTER || late > DAY || view.occ < reminder.createdAt) continue;
                const key = `q:${reminder.id}@${view.occ}`;
                if (watchSeen[key]) continue;
                watchSeen[key] = at;
                const acked = reminder.acks?.[String(view.occ)];
                lateLines.push({
                    title: reminder.title,
                    at: view.occ,
                    note: [reminder.department, reminder.assignee && `Giao cho ${reminder.assignee}`, acked ? `Đã nhận: ${acked.by}` : 'Chưa ai bấm Đã nhận'].filter(Boolean).join(' · '),
                });
            }
        }
        if (lateLines.length > 0) {
            showPopup({
                key: `alert@q${at}`,
                kind: 'alert',
                title: `${lateLines.length} việc quá hạn chưa xong`,
                content: 'Việc của bộ phận khác hoặc việc bạn giao đã quá hạn 15 phút mà chưa ai bấm Đã xong.',
                priority: 'urgent',
                sound: { kind: 'preset', preset: 'chuong-cua' },
                speech: `Có ${lateLines.length} việc quá hạn chưa xong.`,
                missed: lateLines,
            });
        }
        if (nextReminders !== list) commitReminders(nextReminders.map(reminder => pruneReminder(reminder, at)));
        if (stateChanged || lateLines.length > 0) {
            // Bỏ dấu đã hiện cũ hơn 7 ngày
            const keep = at - 7 * DAY;
            const recent = (map: Record<string, number>) => Object.fromEntries(Object.entries(map).filter(([, time]) => time >= keep));
            commitState({ ...refs.current.state, checklistFired: recent(fired), checklistSnoozes: snoozes, watchSeen: recent(watchSeen) });
        }
    }, [enabled, showPopup, checklistPopup, commitReminders, commitState]);

    useEffect(() => {
        if (!loaded || !enabled) return;
        tick();
        const timer = window.setInterval(tick, TICK_EVERY);
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

    // ---------- Nhận việc từ Google Sheet ----------

    /** Ghép việc và checklist đọc được từ file, báo việc mới. Dùng chung cho link chia sẻ và cầu nối. */
    const applySheetData = useCallback((parsed: SheetReadResult, at: number) => {
        // Checklist trước, để việc gắn checklist tìm được mẫu
        const mergedChecklists = mergeSheetChecklists(refs.current.templates, parsed.checklists, at);
        if (mergedChecklists.changed) commitTemplates(mergedChecklists.templates);
        const merged = mergeSheetTasks(refs.current.reminders, parsed.tasks, at, refs.current.templates);
        if (merged.added.length || merged.updated || merged.removed) commitReminders(merged.reminders);
        const taskCount = parsed.tasks.filter(task => task.status !== 'cancelled').length;
        const checklistCount = parsed.checklists.filter(item => !item.stopped).length;
        // Chỉ báo việc mới của máy này (bộ phận của máy, việc chung, việc giao cho mình)
        const mine = merged.added.filter(item => ringsHere(item, roleOf(refs.current.state)));
        if (mine.length > 0) {
            const count = mine.length;
            newBatches.current.set(`new@${at}`, mine.map(item => item.id));
            showPopup({
                key: `new@${at}`,
                kind: 'new',
                title: `Có ${count} công việc mới`,
                content: 'Việc mới giao qua Google Sheet.',
                priority: mine.some(item => item.priority === 'urgent') ? 'urgent' : 'important',
                sound: { kind: 'preset', preset: 'chuong-cua' },
                speech: `Có ${count} công việc mới.`,
                missed: mine.map(item => ({ title: item.title, at: item.deadline, note: [item.department, item.assignee && `Giao cho ${item.assignee}`].filter(Boolean).join(' · ') || undefined })),
                canAck: isBridgeV2(refs.current.state),
            });
            toast.success(`Có ${count} công việc mới từ Google Sheet`);
        }
        const changes = [merged.added.length && `${merged.added.length} việc mới`, merged.updated && `${merged.updated} việc thay đổi`, merged.removed && `${merged.removed} việc đã huỷ`].filter(Boolean).join(', ');
        return { taskCount, checklistCount, message: `Đọc được ${taskCount} công việc, ${checklistCount} checklist${changes ? `: ${changes}` : ''}.` };
    }, [commitReminders, commitTemplates, showPopup]);

    /** Link chia sẻ (chỉ đọc): tải cả file, ghép việc. `url` khác file đang nối khi đang kết nối file mới. */
    const runSheetSync = useCallback(async (url: string, connecting: boolean): Promise<{ ok: boolean; message: string }> => {
        const api = desktop();
        if (!api) return { ok: false, message: 'Chỉ dùng được trong app.' };
        setSyncing(true);
        try {
            const result = await api.fetchSheet(url);
            const at = clockNow();
            const st = refs.current.state;
            const base: SheetConfig = connecting ? { url, mode: 'view', connectedAt: at } : (st.sheet ?? { url, connectedAt: at });
            if (!result.ok) {
                const message = SHEET_ERRORS[result.reason];
                if (!connecting) commitState({ ...st, sheet: { ...base, lastSyncAt: at, lastOk: false, lastMessage: message } });
                return { ok: false, message };
            }
            // Cả file dạng .xlsx: đọc trang Nhắc việc và trang Checklist
            const XLSX = await import('xlsx');
            const workbook = XLSX.read(result.base64, { type: 'base64' });
            const parsed = readSheetTables(workbook.SheetNames.map(name => ({
                name,
                rows: XLSX.utils.sheet_to_json<string[]>(workbook.Sheets[name], { header: 1, raw: false, defval: '' }),
            })));
            if (parsed.badHeader) {
                const message = 'File không đúng mẫu: không thấy trang Nhắc việc. Hãy tạo file bằng nút Tạo file nhắc việc.';
                if (!connecting) commitState({ ...st, sheet: { ...base, lastSyncAt: at, lastOk: false, lastMessage: message } });
                return { ok: false, message };
            }
            const { taskCount, checklistCount, message } = applySheetData(parsed, at);
            commitState({ ...refs.current.state, sheet: { ...base, lastSyncAt: at, lastOk: true, lastMessage: undefined, taskCount, checklistCount, skipped: parsed.skipped } });
            return { ok: true, message };
        } catch (error) {
            console.error('[Nhắc việc] Không đọc được file Google Sheet', error);
            return { ok: false, message: 'Không đọc được nội dung file. Hãy tạo file bằng nút Tạo file nhắc việc.' };
        } finally {
            setSyncing(false);
        }
    }, [applySheetData, commitState]);

    /**
     * Máy quản lý, người giao: nhân viên vừa bấm Cần hỗ trợ (đọc từ Nhật ký) thì bật bảng báo, mỗi lần một lần. Lần cũ hơn `since`
     * (trước khi kết nối, quá một ngày) thì bỏ qua.
     */
    const alertHelps = useCallback((since: number, at: number) => {
        const st = refs.current.state;
        const role = roleOf(st);
        const seen = { ...(st.watchSeen ?? {}) };
        const lines: { title: string; at: number; note?: string }[] = [];
        for (const reminder of refs.current.reminders) {
            if (!watchedHere(reminder, role)) continue;
            for (const [occ, help] of Object.entries(reminder.helps ?? {})) {
                if (help.at < since || sameName(help.by, role.performer) || reminder.done[occ]) continue;
                const key = `h:${reminder.id}@${occ}@${help.at}`;
                if (seen[key]) continue;
                seen[key] = at;
                lines.push({ title: reminder.title, at: help.at, note: `${help.by}${help.note ? `: ${help.note}` : ''}` });
            }
        }
        if (lines.length === 0) return;
        commitState({ ...refs.current.state, watchSeen: seen });
        showPopup({
            key: `alert@h${at}`,
            kind: 'alert',
            title: lines.length > 1 ? `${lines.length} việc cần hỗ trợ` : `Cần hỗ trợ: ${lines[0].title}`,
            content: 'Nhân viên bấm Cần hỗ trợ trong app.',
            priority: 'urgent',
            sound: { kind: 'preset', preset: 'chuong-cua' },
            speech: lines.length > 1 ? `Có ${lines.length} việc cần hỗ trợ.` : `Cần hỗ trợ. ${lines[0].title}.`,
            missed: lines,
        });
    }, [commitState, showPopup]);

    /** Gửi hàng chờ lên cầu nối. Gửi được thì bỏ các thao tác đã gửi khỏi hàng chờ, gắn mã việc cho việc mới tạo trên máy. */
    const flushOutbox = useCallback(async (link: string): Promise<{ ok: boolean; message?: string }> => {
        const api = desktop();
        const outbox = refs.current.state.outbox ?? [];
        if (!api || outbox.length === 0) return { ok: true };
        // Thao tác kèm ảnh gửi ít một (mỗi lần tối đa 2), phần còn lại gửi ở lượt sau, giữ đúng thứ tự
        const batch: OutboxOp[] = [];
        let photoOps = 0;
        for (const op of outbox) {
            if (opHasPhotos(op, refs.current.reminders)) {
                if (photoOps >= 2) break;
                photoOps += 1;
            }
            batch.push(op);
        }
        const sent = new Set(batch.map(op => op.id));
        const ops = buildOps(batch, refs.current.reminders, refs.current.runs, refs.current.templates, {
            version: refs.current.state.sheet?.scriptVersion,
            photo: id => refs.current.media[id]?.dataUrl ?? null,
        });
        if (ops.length > 0) {
            const response = await api.bridge(link, { method: 'POST', body: { by: refs.current.state.performer, ops } });
            if (!response.ok) return { ok: false, message: BRIDGE_ERRORS[response.reason] };
            const data = response.data as BridgeData;
            if (!data?.ok) return { ok: false, message: bridgeError(data) };
            const updated = applyResults(refs.current.reminders, data.results ?? []);
            if (updated !== refs.current.reminders) commitReminders(updated);
        }
        commitState({ ...refs.current.state, outbox: (refs.current.state.outbox ?? []).filter(op => !sent.has(op.id)) });
        return { ok: true };
    }, [commitReminders, commitState]);

    /**
     * Cầu nối (đồng bộ hai chiều): gửi thay đổi của máy trước, rồi hỏi file có gì đổi không (theo dấu phiên bản), có thì ghép
     * việc, checklist và các lần xong ở máy khác.
     */
    const runBridgeSync = useCallback(async (link: string, connecting: boolean): Promise<{ ok: boolean; message: string }> => {
        const api = desktop();
        if (!api) return { ok: false, message: 'Chỉ dùng được trong app.' };
        setSyncing(true);
        try {
            const at = clockNow();
            const base: SheetConfig = connecting || refs.current.state.sheet?.mode !== 'bridge'
                ? { url: link, mode: 'bridge', connectedAt: at }
                : refs.current.state.sheet;
            const fail = (message: string) => {
                if (!connecting) commitState({ ...refs.current.state, sheet: { ...base, lastSyncAt: at, lastOk: false, lastMessage: message } });
                return { ok: false, message };
            };
            if (!connecting) {
                const flushed = await flushOutbox(link);
                if (!flushed.ok) return fail(flushed.message ?? BRIDGE_ERRORS.error);
            }
            const response = await api.bridge(link, { method: 'GET', since: connecting ? undefined : base.version });
            if (!response.ok) return fail(BRIDGE_ERRORS[response.reason]);
            const data = response.data as BridgeData;
            if (!data?.ok) return fail(bridgeError(data));
            // Trong lúc đọc, trên máy vừa có thay đổi: bản đọc có thể đã cũ, gửi thay đổi rồi đọc lại
            if ((refs.current.state.outbox ?? []).length > 0) {
                scheduleSyncRef.current();
                return { ok: true, message: 'Đang gửi thay đổi lên Google Sheet.' };
            }
            const current = refs.current.state.sheet;
            const scriptVersion = Number(data.v) || 1;
            if (data.unchanged && current) {
                commitState({ ...refs.current.state, sheet: { ...current, lastSyncAt: at, lastOk: true, lastMessage: undefined, scriptVersion } });
                return { ok: true, message: `Đọc được ${current.taskCount ?? 0} công việc, ${current.checklistCount ?? 0} checklist.` };
            }
            const parsed = readSheetTables(data.tables ?? []);
            if (parsed.badHeader) return fail(BRIDGE_ERRORS.mau);
            const { taskCount, checklistCount, message } = applySheetData(parsed, at);
            const withDone = applyEvents(applyDoneLog(refs.current.reminders, data.doneLog ?? [], at), data.events ?? []);
            if (withDone !== refs.current.reminders) commitReminders(withDone);
            commitState({
                ...refs.current.state,
                sheet: {
                    ...base, mode: 'bridge', lastSyncAt: at, lastOk: true, lastMessage: undefined, taskCount, checklistCount, skipped: parsed.skipped,
                    version: data.version, title: data.title, sheetUrl: data.sheetUrl, staff: data.staff ?? [], assigners: data.assigners ?? [], scriptVersion,
                },
            });
            // Nhật ký ghi giờ đến phút: lùi vài phút để không bỏ sót lần cần hỗ trợ ngay sau khi kết nối
            alertHelps(Math.max(base.connectedAt - 5 * MINUTE, at - DAY), at);
            return { ok: true, message };
        } catch (error) {
            console.error('[Nhắc việc] Không đồng bộ được với Google Sheet', error);
            return { ok: false, message: BRIDGE_ERRORS.error };
        } finally {
            setSyncing(false);
        }
    }, [applySheetData, commitReminders, commitState, flushOutbox, alertHelps]);

    // Một lượt đồng bộ một lúc; có yêu cầu trong lúc đang chạy thì chạy thêm một lượt sau
    const syncBusy = useRef(false);
    const syncAgain = useRef(false);
    const syncSheet = useCallback(async () => {
        if (!enabled || !refs.current.state.sheet) return;
        if (syncBusy.current) {
            syncAgain.current = true;
            return;
        }
        syncBusy.current = true;
        try {
            do {
                syncAgain.current = false;
                const sheet = refs.current.state.sheet;
                if (!sheet) break;
                if (sheet.mode === 'bridge') await runBridgeSync(sheet.url, false);
                else await runSheetSync(sheet.url, false);
            } while (syncAgain.current);
        } finally {
            syncBusy.current = false;
        }
    }, [enabled, runBridgeSync, runSheetSync]);

    // Có thay đổi trên máy: gửi sau một chút, gộp nhiều thay đổi liền nhau thành một lần gửi
    const syncTimer = useRef<number | undefined>(undefined);
    const syncSheetRef = useRef(syncSheet);
    syncSheetRef.current = syncSheet;
    const scheduleSyncRef = useRef(() => {
        window.clearTimeout(syncTimer.current);
        syncTimer.current = window.setTimeout(() => void syncSheetRef.current(), 600);
    });

    /** Thêm thay đổi vào hàng chờ gửi lên Google Sheet (chỉ khi đang đồng bộ hai chiều) */
    const enqueueOps = useCallback((ops: NewOp[]) => {
        const st = refs.current.state;
        if (st.sheet?.mode !== 'bridge' || ops.length === 0) return;
        const taskIdOf = (ref: string) => {
            const reminder = refs.current.reminders.find(item => item.id === ref);
            return reminder?.source?.kind === 'sheet' ? reminder.source.taskId : '';
        };
        let outbox = st.outbox ?? [];
        for (const op of ops) outbox = enqueue(outbox, op, taskIdOf);
        commitState({ ...refs.current.state, outbox });
        scheduleSyncRef.current();
    }, [commitState]);

    // Đọc file lúc mở app, định kỳ (cầu nối mỗi phút, link chia sẻ 5 phút), và khi máy thức dậy
    const sheetUrl = state.sheet?.url;
    const sheetMode = state.sheet?.mode;
    useEffect(() => {
        if (!loaded || !enabled || !sheetUrl) return;
        void syncSheetRef.current();
        const timer = window.setInterval(() => void syncSheetRef.current(), sheetMode === 'bridge' ? BRIDGE_SYNC_EVERY : SYNC_EVERY);
        const offRecheck = desktop()?.onRecheck(() => void syncSheetRef.current());
        return () => {
            window.clearInterval(timer);
            offRecheck?.();
        };
    }, [loaded, enabled, sheetUrl, sheetMode]);

    useEffect(() => () => window.clearTimeout(syncTimer.current), []);

    // Đồng bộ hai chiều: việc chỉ có trên máy này (tạo trước khi kết nối) tự đưa lên file để file và mọi máy cùng thấy. Việc một
    // lần đã xong và việc lặp đã dừng thì để lại trên máy.
    useEffect(() => {
        if (!loaded || !enabled || sheetMode !== 'bridge') return;
        const locals = localReminders(refs.current.reminders);
        if (locals.length === 0) return;
        const at = clockNow();
        const ids = new Set(locals.map(item => item.id));
        const performer = refs.current.state.performer.trim();
        commitReminders(refs.current.reminders.map(item => (ids.has(item.id)
            ? { ...item, source: { kind: 'sheet' as const, taskId: '' }, assigner: item.assigner ?? (performer || undefined) }
            : item)));
        // Lần đã xong hôm nay cũng ghi lên, để máy khác không nhắc lại
        enqueueOps(locals.flatMap(item => [
            { kind: 'upsert' as const, ref: item.id },
            ...doneToday(item, at).map(occ => ({ kind: 'done' as const, ref: item.id, occ, at: item.done[String(occ)] })),
        ]));
    }, [loaded, enabled, sheetMode, reminders, commitReminders, enqueueOps]);

    /**
     * Checklist lên file (đồng bộ hai chiều, script bản 2): mã theo tên như checklist đọc từ file. Đổi mã thì nhắc việc gắn checklist,
     * các lượt (kể cả mã từng việc), hàng chờ và dấu đã nhắc đổi theo.
     */
    const adoptForSheet = useCallback((template: ChecklistTemplate): ChecklistTemplate => {
        const { template: adopted, itemIds } = adoptTemplate(template);
        const oldId = template.id;
        // Trùng tên với checklist khác: để nguyên trên máy, không ghi đè checklist kia trong file
        if (refs.current.templates.some(item => item.id === adopted.id && item.id !== oldId)) return template;
        if (adopted.id === oldId && [...itemIds].every(([from, to]) => from === to)) return adopted;
        commitRuns(refs.current.runs.map(run => (run.templateId !== oldId ? run
            : { ...run, templateId: adopted.id, items: run.items.map(item => ({ ...item, id: itemIds.get(item.id) ?? item.id })) })));
        if (adopted.id !== oldId) {
            commitReminders(refs.current.reminders.map(item => (item.checklistTemplateId === oldId ? { ...item, checklistTemplateId: adopted.id } : item)));
            const st = refs.current.state;
            const renameKeys = (map: Record<string, number>) => Object.fromEntries(Object.entries(map).map(([key, value]) => [key.startsWith(`cl:${oldId}@`) ? `cl:${adopted.id}@${key.slice(oldId.length + 4)}` : key, value]));
            commitState({
                ...st,
                outbox: (st.outbox ?? []).map(op => ((op.kind === 'checklist' || op.kind === 'checklist-stop') && op.ref === oldId ? { ...op, ref: adopted.id } : op)),
                checklistFired: renameKeys(st.checklistFired),
                checklistSnoozes: renameKeys(st.checklistSnoozes),
            });
        }
        return adopted;
    }, [commitReminders, commitRuns, commitState]);

    // Checklist chỉ có trên máy này cũng tự lên file (trùng tên với checklist trong file thì để nguyên)
    const bridgeV2Now = isBridgeV2(state);
    useEffect(() => {
        if (!loaded || !enabled || !bridgeV2Now) return;
        const locals = localTemplates(refs.current.templates)
            .filter(template => template.items.length > 0 && !refs.current.templates.some(other => other.id === checklistIdFor(template.name) && other.id !== template.id));
        if (locals.length === 0) return;
        const ops: NewOp[] = [];
        let list = refs.current.templates;
        for (const template of locals) {
            const adopted = adoptForSheet(template);
            if (!adopted.source) continue;
            list = list.map(item => (item.id === template.id ? adopted : item));
            ops.push({ kind: 'checklist', ref: adopted.id });
        }
        commitTemplates(list);
        enqueueOps(ops);
    }, [loaded, enabled, bridgeV2Now, templates, adoptForSheet, commitTemplates, enqueueOps]);

    // ---------- Đã xong, Đã nhận, Cần hỗ trợ ----------

    /** Ảnh (data URL) vào kho ảnh của máy, trả về mã ảnh */
    const storePhotos = useCallback((urls: string[] = []): string[] => {
        if (urls.length === 0) return [];
        const next = { ...refs.current.media };
        const ids = urls.map(dataUrl => {
            const id = newId('m');
            next[id] = { dataUrl, name: 'anh.jpg', kind: 'image', createdAt: Date.now() };
            return id;
        });
        commitMedia(next);
        return ids;
    }, [commitMedia]);

    const isOnSheet = (id: string) => refs.current.reminders.find(item => item.id === id)?.source?.kind === 'sheet';

    const complete = useCallback((id: string, occ: number, extra?: OccExtra) => {
        const at = clockNow();
        const photos = storePhotos(extra?.photos);
        const note = extra?.note?.trim();
        const info: OccEvent = { by: byOf(refs.current.state), at, ...(note ? { note } : {}), ...(photos.length ? { photos } : {}) };
        commitReminders(refs.current.reminders.map(item => (item.id === id ? markDone(item, occ, at, info) : item)));
        void desktop()?.closePopup(`${id}@${occ}`);
        if (isOnSheet(id)) enqueueOps([{ kind: 'done', ref: id, occ, at }]);
    }, [commitReminders, enqueueOps, storePhotos]);

    const ackMany = useCallback((targets: { id: string; occ: number }[]) => {
        const at = clockNow();
        const by = byOf(refs.current.state);
        const fresh = targets.filter(target => {
            const reminder = refs.current.reminders.find(item => item.id === target.id);
            return reminder && !reminder.acks?.[String(target.occ)];
        });
        if (fresh.length === 0) return;
        commitReminders(refs.current.reminders.map(item => {
            const target = fresh.find(entry => entry.id === item.id);
            return target ? { ...item, acks: { ...item.acks, [String(target.occ)]: { by, at } } } : item;
        }));
        enqueueOps(fresh.filter(target => isOnSheet(target.id)).map(target => ({ kind: 'ack' as const, ref: target.id, occ: target.occ, at })));
    }, [commitReminders, enqueueOps]);

    const requestHelp = useCallback((id: string, occ: number, extra: OccExtra) => {
        const at = clockNow();
        const photos = storePhotos(extra.photos);
        const note = extra.note?.trim();
        const info: OccEvent = { by: byOf(refs.current.state), at, ...(note ? { note } : {}), ...(photos.length ? { photos } : {}) };
        commitReminders(refs.current.reminders.map(item => (item.id === id ? { ...item, helps: { ...item.helps, [String(occ)]: info } } : item)));
        if (isOnSheet(id)) enqueueOps([{ kind: 'help', ref: id, occ, at }]);
    }, [commitReminders, enqueueOps, storePhotos]);

    // ---------- Lượt checklist ----------

    const startNewRun = useCallback((templateId: string): ChecklistRun | null => {
        const template = refs.current.templates.find(item => item.id === templateId);
        if (!template) return null;
        const run = startRun(template, clockNow(), refs.current.state.performer);
        commitRuns([run, ...refs.current.runs]);
        return run;
    }, [commitRuns]);

    const openRunFor = useCallback((templateId: string): ChecklistRun | null => {
        if (!refs.current.templates.some(item => item.id === templateId)) return null;
        return runOfDay(refs.current.runs, templateId, dateKey(clockNow())) ?? startNewRun(templateId);
    }, [startNewRun]);

    // ---------- Nút trên cửa sổ nhắc ----------

    useEffect(() => {
        const off = desktop()?.onAction(action => {
            const at = clockNow();
            if (action.key.startsWith('missed@') || action.key.startsWith('new@') || action.key.startsWith('alert@')) {
                // Việc mới: Đã nhận là nhận hết các việc trong bảng (lần hạn sắp tới của mỗi việc)
                if (action.action === 'ack') {
                    ackMany((newBatches.current.get(action.key) ?? []).flatMap(id => {
                        const reminder = refs.current.reminders.find(item => item.id === id);
                        const occ = reminder ? reminderView(reminder, at).occ ?? reminder.deadline : null;
                        return occ === null ? [] : [{ id, occ }];
                    }));
                }
                newBatches.current.delete(action.key);
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
                // Việc phải kèm ghi chú, ảnh: mở app để ghi rồi mới xong
                if (reminder.proof) {
                    setOpenRequest({ kind: 'done', id, occ });
                    onOpenRef.current();
                } else {
                    complete(id, occ);
                }
            } else if (action.action === 'ack') {
                ackMany([{ id, occ }]);
            } else if (action.action === 'help') {
                setOpenRequest({ kind: 'help', id, occ });
                onOpenRef.current();
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
    }, [commitReminders, commitState, openRunFor, complete, ackMany]);

    // ---------- Thao tác từ màn Nhắc việc ----------

    const api = useMemo<NhacViecApi>(() => {
        const role = roleOf(state);
        // Máy có bộ phận: danh sách và số đỏ chỉ tính việc của máy (máy quản lý thấy hết)
        const visibleReminders = reminders.filter(reminder => shownHere(reminder, role));
        const visibleTemplates = templates.filter(template => shownHere(template, role));
        const departments: string[] = [];
        for (const name of [...DEFAULT_DEPARTMENTS, ...reminders.map(item => item.department ?? ''), ...templates.map(item => item.department ?? ''), role.department]) {
            if (name.trim() && !departments.some(item => sameName(item, name))) departments.push(name.trim());
        }
        const today = startOfDay(now);
        const overdueReminders = visibleReminders.filter(reminder => reminderView(reminder, now).state === 'overdue').length;
        const overdueChecklists = visibleTemplates.filter(template => {
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
            role,
            setDepartment: department => commitState({ ...refs.current.state, department: department.trim() || undefined }),
            departments,
            visibleReminders,
            visibleTemplates,
            bridgeV2: isBridgeV2(state),
            saveReminder: reminder => {
                const list = refs.current.reminders;
                const previous = list.find(item => item.id === reminder.id);
                const onSheet = previous?.source?.kind === 'sheet' ? previous.source : reminder.source;
                // Đồng bộ hai chiều: việc nào lưu trong app cũng ghi lên file, mọi máy cùng thấy
                const sync = refs.current.state.sheet?.mode === 'bridge';
                const next: Reminder = onSheet || sync ? { ...reminder, source: { kind: 'sheet', taskId: onSheet?.taskId ?? '' } } : reminder;
                commitReminders(previous ? list.map(item => (item.id === next.id ? next : item)) : [next, ...list]);
                collectMedia();
                if (sync) enqueueOps([{ kind: 'upsert', ref: next.id }]);
            },
            deleteReminder: id => {
                const target = refs.current.reminders.find(item => item.id === id);
                commitReminders(refs.current.reminders.filter(item => item.id !== id));
                collectMedia();
                // Việc trên file: ghi Huỷ (giữ lịch sử trong file), các máy khác tự bỏ việc này
                if (target?.source?.kind === 'sheet') enqueueOps([{ kind: 'cancel', ref: id, taskId: target.source.taskId }]);
            },
            completeReminder: complete,
            ackReminder: (id, occ) => ackMany([{ id, occ }]),
            requestHelp,
            saveTemplate: template => {
                const list = refs.current.templates;
                const previous = list.find(item => item.id === template.id);
                // Đồng bộ hai chiều (script bản 2): checklist lưu trong app ghi lên trang Checklist của file
                const sync = isBridgeV2(refs.current.state);
                const next = sync ? adoptForSheet(template) : template;
                commitTemplates(previous ? list.map(item => (item.id === template.id ? next : item)) : [...list, next]);
                // Lượt hôm nay đang làm dở theo mẫu này nhận ngay tên, danh sách việc và giờ hạn mới (sửa mẫu ngay khi đang làm)
                const today = dateKey(clockNow());
                const runList = refs.current.runs;
                if (runList.some(run => run.templateId === next.id && run.date === today && !run.finishedAt)) {
                    commitRuns(runList.map(run => (run.date === today ? applyTemplateToRun(run, next) : run)));
                    collectMedia();
                }
                if (sync && next.source) enqueueOps([{ kind: 'checklist', ref: next.id, ...(previous?.source?.kind === 'sheet' ? { from: previous.name } : {}) }]);
            },
            deleteTemplate: id => {
                const target = refs.current.templates.find(item => item.id === id);
                commitTemplates(refs.current.templates.filter(item => item.id !== id));
                commitReminders(refs.current.reminders.map(item => (item.checklistTemplateId === id ? { ...item, checklistTemplateId: undefined } : item)));
                // Checklist trong file: ghi Ngưng (giữ lịch sử), các máy khác tự bỏ
                if (target?.source?.kind === 'sheet' && isBridgeV2(refs.current.state)) enqueueOps([{ kind: 'checklist-stop', ref: id, name: target.name }]);
            },
            openRunFor,
            startNewRun,
            saveRun: run => {
                const list = refs.current.runs;
                const before = list.find(item => item.id === run.id);
                commitRuns(before ? list.map(item => (item.id === run.id ? run : item)) : [run, ...list]);
                if (run.finishedAt) void desktop()?.closePopup(`cl:${run.templateId}@${run.date}`);
                collectMedia();
                // Hoàn tất lượt checklist: ghi báo cáo vào trang Báo cáo checklist của file
                if (run.finishedAt && !before?.finishedAt) enqueueOps([{ kind: 'report', ref: run.id }]);
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
            sheet: state.sheet ?? null,
            bridge: state.sheet?.mode === 'bridge',
            pendingCount: state.outbox?.length ?? 0,
            staff: state.sheet?.staff ?? [],
            syncing,
            connectSheet: async url => {
                const link = bridgeLinkFrom(url);
                if (link) return runBridgeSync(link, true);
                if (!sheetIdFromUrl(url)) return { ok: false, message: 'Đây chưa phải Link kết nối hay link Google Sheet. Trong file, menu Nhắc việc → Bật đồng bộ hai chiều → Sao chép Link kết nối.' };
                return runSheetSync(url.trim(), true);
            },
            disconnectSheet: () => {
                // Bỏ các việc và checklist nhận từ file, giữ những gì tự tạo trong app
                commitReminders(refs.current.reminders.filter(item => item.source?.kind !== 'sheet'));
                commitTemplates(refs.current.templates.filter(item => item.source?.kind !== 'sheet'));
                const { sheet: _removed, outbox: _pending, ...rest } = refs.current.state;
                commitState({ ...rest });
            },
            syncSheet,
        };
    }, [loaded, now, reminders, templates, runs, state, syncing, media, openRequest, commitReminders, commitTemplates, commitRuns, commitState, commitMedia, collectMedia, openRunFor,
        startNewRun, runSheetSync, runBridgeSync, syncSheet, enqueueOps, complete, ackMany, requestHelp, adoptForSheet]);

    return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
};

const atTimeOf = (alert: ChecklistAlert) => alert.at;

export { timeOfDay };
