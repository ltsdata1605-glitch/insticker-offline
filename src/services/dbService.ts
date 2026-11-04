// Lưu phông chữ giao diện, cùng khoá 'globalFont' như bản web.
import { getSetting, saveSetting } from '../features/sticker-event/services/dbService';

export const saveGlobalFont = (font: string): Promise<void> => saveSetting('globalFont', font);
export const getGlobalFont = (): Promise<string | null> => getSetting<string>('globalFont');
