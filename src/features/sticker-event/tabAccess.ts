import { useSyncExternalStore } from 'react';

/**
 * Bật tắt các tab Giá Sốc, Giờ Vàng, Sticker, Phiếu, Event của In sticker và các chức năng Kiểm hàng, Kiểm quỹ, Nhắc việc, Tạo mã. Tab Event mặc định tắt;
 * luôn phải còn ít nhất một tab. Tắt hết các tab In sticker thì thanh bên trái chỉ còn Kiểm hàng. Bảng điều khiển mở bằng cách
 * bấm 7 lần vào logo rồi nhập mật khẩu, mặc định 12345.
 *
 * Lưu trên máy (localStorage, nằm trong thư mục dữ liệu của app) và cố ý không đưa vào file sao lưu: khôi phục file sao lưu
 * không đổi được tab hay mật khẩu. Mật khẩu chỉ lưu dạng băm nên không có cách đọc lại; quên thì phải xoá app cùng dữ liệu
 * của app rồi cài lại, khi đó mật khẩu và các tab về mặc định.
 */
export type LockableTab = 'gia-soc' | 'gio-vang' | 'sticker' | 'draw' | 'event' | 'kiem-hang' | 'nhac-viec' | 'tao-ma' | 'kiem-quy';

export const LOCKABLE_TABS: readonly { id: LockableTab; label: string }[] = [
    { id: 'gia-soc', label: 'Giá Sốc' },
    { id: 'gio-vang', label: 'Giờ Vàng' },
    { id: 'sticker', label: 'Sticker' },
    { id: 'draw', label: 'Phiếu' },
    { id: 'event', label: 'Event' },
    { id: 'kiem-hang', label: 'Kiểm hàng' },
    { id: 'kiem-quy', label: 'Kiểm quỹ' },
    { id: 'nhac-viec', label: 'Nhắc việc' },
    { id: 'tao-ma', label: 'Tạo mã' },
];

/** Các tab thuộc In sticker. Tắt hết các tab này thì ẩn In sticker khỏi thanh bên trái. */
export const STICKER_TABS: readonly LockableTab[] = ['gia-soc', 'gio-vang', 'sticker', 'draw', 'event'];

export const isStickerModuleVisible = (hiddenTabs: readonly string[]): boolean => STICKER_TABS.some(id => !hiddenTabs.includes(id));

/** Chưa từng chỉnh trong bảng bật tắt tab thì tab Event tắt. */
const DEFAULT_HIDDEN: LockableTab[] = ['event'];

export const DEFAULT_TAB_PASSWORD = '12345';
export const MIN_TAB_PASSWORD_LENGTH = 4;

const HIDDEN_KEY = 'tabAccess.hidden';
const PASSWORD_KEY = 'tabAccess.password';

/** Thứ tự tab trên thanh chọn. Tab đang mở bị tắt thì chuyển sang tab bật đầu tiên. */
const SUB_ORDER = ['gia-soc', 'gio-vang', 'sticker', 'draw', 'event'];

export const resolveVisibleSub = (sub: string, hiddenTabs: readonly string[]): string =>
    hiddenTabs.includes(sub) ? (SUB_ORDER.find(id => !hiddenTabs.includes(id)) ?? sub) : sub;

/** Danh sách tab tắt hợp lệ: chỉ gồm tên tab đã biết, và không bao giờ tắt hết. */
export const normalizeHiddenTabs = (value: unknown): LockableTab[] => {
    if (!Array.isArray(value)) return [...DEFAULT_HIDDEN];
    const hiddenTabs = LOCKABLE_TABS.map(tab => tab.id).filter(id => value.includes(id));
    return hiddenTabs.length === LOCKABLE_TABS.length ? hiddenTabs.filter(id => id !== 'gia-soc') : hiddenTabs;
};

const readHidden = (): LockableTab[] => {
    try {
        const raw = localStorage.getItem(HIDDEN_KEY);
        return normalizeHiddenTabs(raw === null ? undefined : JSON.parse(raw));
    } catch {
        return [...DEFAULT_HIDDEN];
    }
};

let hidden: LockableTab[] = readHidden();
const listeners = new Set<() => void>();

export const getHiddenTabs = (): LockableTab[] => hidden;

const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};

export const useHiddenTabs = (): LockableTab[] => useSyncExternalStore(subscribe, getHiddenTabs);

export const setTabHidden = (tab: LockableTab, isHidden: boolean): void => {
    const next = LOCKABLE_TABS.map(item => item.id).filter(id => (id === tab ? isHidden : hidden.includes(id)));
    // Phải còn ít nhất một tab
    if (next.length === LOCKABLE_TABS.length) return;
    hidden = next;
    try {
        localStorage.setItem(HIDDEN_KEY, JSON.stringify(next));
    } catch {
        // Không ghi được thì vẫn áp dụng cho lần mở này
    }
    listeners.forEach(listener => listener());
};

const toHex = (bytes: ArrayBuffer | Uint8Array) =>
    Array.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');

export const hashTabPassword = async (password: string, salt: string): Promise<string> =>
    toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${password}`)));

interface StoredPassword {
    salt: string;
    hash: string;
}

const readStoredPassword = (): StoredPassword | null => {
    try {
        const parsed = JSON.parse(localStorage.getItem(PASSWORD_KEY) ?? 'null') as Partial<StoredPassword> | null;
        return parsed && typeof parsed.salt === 'string' && typeof parsed.hash === 'string' ? { salt: parsed.salt, hash: parsed.hash } : null;
    } catch {
        return null;
    }
};

export const checkTabPassword = async (password: string): Promise<boolean> => {
    const stored = readStoredPassword();
    if (!stored) return password === DEFAULT_TAB_PASSWORD;
    return (await hashTabPassword(password, stored.salt)) === stored.hash;
};

export const changeTabPassword = async (password: string): Promise<void> => {
    const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
    const stored: StoredPassword = { salt, hash: await hashTabPassword(password, salt) };
    localStorage.setItem(PASSWORD_KEY, JSON.stringify(stored));
};
