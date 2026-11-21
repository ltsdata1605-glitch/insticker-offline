import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { getSetting, saveSetting } from '../sticker-event/services/dbService';
import type { BridgeResponse, ReminderPopupData, SheetFetchResult } from '../../../electron/contract';
import { toast } from '../../components/shared/ui/toast';
import type { SheetReadResult, SheetTable } from './sheetTasks';
import { SYNC_EVERY, mergeSheetChecklists, mergeSheetTasks, readSheetTables, sheetIdFromUrl } from './sheetTasks';
import type { BridgeResult, DoneEntry, NewOp, OutboxOp } from './sheetBridge';
import { BRIDGE_SYNC_EVERY, applyDoneLog, applyResults, bridgeLinkFrom, buildOps, doneToday, enqueue, localReminders } from './sheetBridge';
import type { ChecklistAlert, ChecklistRun, ChecklistTemplate, Reminder } from './nhacViecModel';
import {
    DAY, MINUTE, atTime, checklistAlerts, dateKey, dayOfKey, defaultSpeech, dropLeftoverRuns, markDone, markFired, newId, pendingAlerts, pruneReminder,
    reminderView, runOfDay, runProgress, startRun, startOfDay, timeOfDay,
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
    'not-found': 'Không tìm thấy cầu nối: link sai hoặc bản triển khai đã bị xoá.',
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
    staff?: string[];
    assigners?: string[];
    results?: BridgeResult[];
}

const bridgeError = (data: BridgeData | null | undefined): string =>
    data?.error === 'key' ? BRIDGE_ERRORS.key : data?.error === 'mau' ? BRIDGE_ERRORS.mau : `Cầu nối báo lỗi${data?.message ? `: ${data.message}` : ''}. App sẽ tự thử lại.`;

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
    /** `sync`: đưa việc tạo trên máy lên Google Sheet (đồng bộ hai chiều). Việc đã ở trên file thì luôn đồng bộ. */
    saveReminder: (reminder: Reminder, options?: { sync?: boolean }) => void;
    deleteReminder: (id: string) => void;
    completeReminder: (id: string, occ: number) => void;
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
    /** Việc chỉ có trên máy này, đưa lên Google Sheet được */
    localCount: number;
    /** Đưa các việc chỉ có trên máy lên Google Sheet, trả về số việc */
    pushLocalReminders: () => number;
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
    const tick = useCallback(() => {
        if (!enabled) return;
        const at = clockNow();
        // Đổi giờ trên màn mỗi 15 giây là đủ, kiểm tra nhắc thì dày hơn
        if (Math.abs(at - lastNow.current) >= 15_000) {
            lastNow.current = at;
            setNow(at);
        }
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
                assignee: reminder.assignee,
                assigner: reminder.assigner,
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
        if (merged.added.length > 0) {
            const count = merged.added.length;
            showPopup({
                key: `new@${at}`,
                kind: 'new',
                title: `Có ${count} công việc mới`,
                content: 'Việc mới giao qua Google Sheet.',
                priority: merged.added.some(item => item.priority === 'urgent') ? 'urgent' : 'important',
                sound: { kind: 'preset', preset: 'chuong-cua' },
                speech: `Có ${count} công việc mới.`,
                missed: merged.added.map(item => ({ title: item.title, at: item.deadline, note: item.assignee ? `Giao cho ${item.assignee}` : undefined })),
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

    /** Gửi hàng chờ lên cầu nối. Gửi được thì bỏ các thao tác đã gửi khỏi hàng chờ, gắn mã việc cho việc mới tạo trên máy. */
    const flushOutbox = useCallback(async (link: string): Promise<{ ok: boolean; message?: string }> => {
        const api = desktop();
        const outbox = refs.current.state.outbox ?? [];
        if (!api || outbox.length === 0) return { ok: true };
        const sent = new Set(outbox.map(op => op.id));
        const ops = buildOps(outbox, refs.current.reminders, refs.current.runs, refs.current.templates);
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
            if (data.unchanged && current) {
                commitState({ ...refs.current.state, sheet: { ...current, lastSyncAt: at, lastOk: true, lastMessage: undefined } });
                return { ok: true, message: `Đọc được ${current.taskCount ?? 0} công việc, ${current.checklistCount ?? 0} checklist.` };
            }
            const parsed = readSheetTables(data.tables ?? []);
            if (parsed.badHeader) return fail(BRIDGE_ERRORS.mau);
            const { taskCount, checklistCount, message } = applySheetData(parsed, at);
            const withDone = applyDoneLog(refs.current.reminders, data.doneLog ?? [], at);
            if (withDone !== refs.current.reminders) commitReminders(withDone);
            commitState({
                ...refs.current.state,
                sheet: {
                    ...base, mode: 'bridge', lastSyncAt: at, lastOk: true, lastMessage: undefined, taskCount, checklistCount, skipped: parsed.skipped,
                    version: data.version, title: data.title, sheetUrl: data.sheetUrl, staff: data.staff ?? [], assigners: data.assigners ?? [],
                },
            });
            return { ok: true, message };
        } catch (error) {
            console.error('[Nhắc việc] Không đồng bộ được với Google Sheet', error);
            return { ok: false, message: BRIDGE_ERRORS.error };
        } finally {
            setSyncing(false);
        }
    }, [applySheetData, commitReminders, commitState, flushOutbox]);

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
            if (action.key.startsWith('missed@') || action.key.startsWith('new@')) {
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
                if (reminder.source?.kind === 'sheet') enqueueOps([{ kind: 'done', ref: id, occ, at }]);
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
    }, [commitReminders, commitState, openRunFor, enqueueOps]);

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
            saveReminder: (reminder, options) => {
                const list = refs.current.reminders;
                const previous = list.find(item => item.id === reminder.id);
                const onSheet = previous?.source?.kind === 'sheet' ? previous.source : reminder.source;
                // Đồng bộ hai chiều: việc đã ở trên file thì luôn ghi lên file; việc tạo trên máy thì theo lựa chọn khi lưu
                const sync = refs.current.state.sheet?.mode === 'bridge' && (Boolean(onSheet) || Boolean(options?.sync));
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
            completeReminder: (id, occ) => {
                const at = clockNow();
                commitReminders(refs.current.reminders.map(item => (item.id === id ? markDone(item, occ, at) : item)));
                void desktop()?.closePopup(`${id}@${occ}`);
                if (refs.current.reminders.find(item => item.id === id)?.source?.kind === 'sheet') enqueueOps([{ kind: 'done', ref: id, occ, at }]);
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
            localCount: state.sheet?.mode === 'bridge' ? localReminders(reminders).length : 0,
            pushLocalReminders: () => {
                const at = clockNow();
                const locals = localReminders(refs.current.reminders);
                if (refs.current.state.sheet?.mode !== 'bridge' || locals.length === 0) return 0;
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
                return locals.length;
            },
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
    }, [loaded, now, reminders, templates, runs, state.performer, state.sheet, state.outbox, syncing, media, openRequest, commitReminders, commitTemplates, commitRuns, commitState, commitMedia, collectMedia, openRunFor, startNewRun, runSheetSync, runBridgeSync, syncSheet, enqueueOps]);

    return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
};

const atTimeOf = (alert: ChecklistAlert) => alert.at;

export { timeOfDay };
