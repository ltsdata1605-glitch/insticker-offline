import { getSetting, saveSetting } from '../sticker-event/services/dbService';
import type { CashCount } from './kiemQuyModel';
import { asCount } from './kiemQuyModel';

/** Lần đang đếm: ghi sau mỗi lần sửa, tắt app mở lại vẫn còn dù chưa lưu vào lịch sử */
export const CURRENT_KEY = 'kiemQuyCurrent';
/** Các lần đã lưu, mới nhất trước */
export const HISTORY_KEY = 'kiemQuyHistory';

export const loadCurrent = async (): Promise<CashCount | null> => asCount(await getSetting<unknown>(CURRENT_KEY));

export const loadHistory = async (): Promise<CashCount[]> => {
    const value = await getSetting<unknown>(HISTORY_KEY);
    return Array.isArray(value) ? value.map(asCount).filter((item): item is CashCount => item !== null) : [];
};

// Ghi lần lượt: lần gõ sau không bị lần ghi cũ hơn đè lên
let queue: Promise<void> = Promise.resolve();
const enqueue = (work: () => Promise<void>): Promise<void> => {
    queue = queue.then(work).catch(error => console.error('[Kiểm quỹ] Không lưu được', error));
    return queue;
};

export const saveCurrent = (count: CashCount): Promise<void> => enqueue(() => saveSetting(CURRENT_KEY, count));
export const saveHistory = (history: CashCount[]): Promise<void> => enqueue(() => saveSetting(HISTORY_KEY, history));
