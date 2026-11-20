import { getSetting, saveSetting } from '../sticker-event/services/dbService';
import type { KiemHangSession } from './kiemHangData';

/** Phiên đang kiểm: lưu lại sau mỗi lần quét, mở lại app vẫn kiểm tiếp được. */
export const CURRENT_KEY = 'kiemHangCurrent';
/** Các phiên đã kết thúc, mới nhất trước. */
export const HISTORY_KEY = 'kiemHangHistory';
export const MAX_HISTORY = 50;

/** Dữ liệu đọc từ máy hoặc từ file sao lưu: thiếu phần nào thì bù phần đó, sai hẳn thì bỏ. */
export const asSession = (value: unknown): KiemHangSession | null => {
    if (!value || typeof value !== 'object') return null;
    const raw = value as Partial<KiemHangSession>;
    if (typeof raw.id !== 'string' || !Array.isArray(raw.lines) || !Array.isArray(raw.invoices)) return null;
    return {
        id: raw.id,
        createdAt: Number(raw.createdAt) || Date.now(),
        updatedAt: Number(raw.updatedAt) || Date.now(),
        finishedAt: raw.finishedAt ? Number(raw.finishedAt) : undefined,
        invoices: raw.invoices,
        lines: raw.lines,
        received: raw.received && typeof raw.received === 'object' ? raw.received : {},
        unknown: Array.isArray(raw.unknown) ? raw.unknown : [],
        log: Array.isArray(raw.log) ? raw.log : [],
    };
};

export const loadCurrent = async (): Promise<KiemHangSession | null> => asSession(await getSetting<unknown>(CURRENT_KEY));

export const loadHistory = async (): Promise<KiemHangSession[]> => {
    const value = await getSetting<unknown>(HISTORY_KEY);
    return Array.isArray(value) ? value.map(asSession).filter((item): item is KiemHangSession => item !== null) : [];
};

// Ghi lần lượt: lần quét sau không ghi đè lên dữ liệu cũ hơn đang ghi dở
let queue: Promise<void> = Promise.resolve();
const enqueue = (work: () => Promise<void>): Promise<void> => {
    queue = queue.then(work).catch(error => console.error('[Kiểm hàng] Không lưu được', error));
    return queue;
};

export const saveCurrent = (session: KiemHangSession | null): Promise<void> => enqueue(() => saveSetting(CURRENT_KEY, session));

export const saveHistory = (history: KiemHangSession[]): Promise<void> => enqueue(() => saveSetting(HISTORY_KEY, history.slice(0, MAX_HISTORY)));
