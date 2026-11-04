// Bản web tách IndexedDB theo tài khoản đăng nhập. App offline dùng một kho duy nhất trên máy,
// giữ nguyên tên export để features/sticker-event/services/dbService.ts không phải sửa.
export const BI_HUB_DB_VERSION = 1;
export const SETTINGS_STORE = 'settings';
export const APP_STORE = 'appStorage';

export const biHubDbName = (): string => 'IN_STICKER_OFFLINE';
export const ensureBiHubDbReady = async (_dbName: string): Promise<void> => {};
export const isLightSyncKey = (_key: string): boolean => false;
