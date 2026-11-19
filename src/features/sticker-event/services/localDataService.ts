import type { SavedList, SavedListItem } from '../types';
import { getSetting, saveSetting } from './dbService';
import type { StickerScope } from './scope';

/**
 * Danh sách đã lưu của tab Event và tab Sticker, mỗi tab một khoá. Bản web lưu ở Firestore theo mã kho, app offline lưu trên máy.
 */
const SAVED_LISTS_KEYS: Record<StickerScope, string> = {
  event: 'stickerEventSavedLists',
  sticker: 'stickerTagSavedLists',
};

const readAll = async (scope: StickerScope): Promise<SavedList[]> => (await getSetting<SavedList[]>(SAVED_LISTS_KEYS[scope])) ?? [];

export const saveList = async (name: string, items: SavedListItem[], scope: StickerScope = 'event'): Promise<string> => {
  const list: SavedList = {
    id: `list_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name,
    createdAt: new Date().toISOString(),
    items,
    totalItems: items.length,
  };
  await saveSetting(SAVED_LISTS_KEYS[scope], [list, ...(await readAll(scope))]);
  return list.id;
};

export const fetchSavedLists = async (scope: StickerScope = 'event'): Promise<SavedList[]> =>
  (await readAll(scope)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

export const deleteSavedList = async (id: string, scope: StickerScope = 'event'): Promise<void> => {
  await saveSetting(SAVED_LISTS_KEYS[scope], (await readAll(scope)).filter((list) => list.id !== id));
};
