import type { SavedList, SavedListItem } from '../types';
import { getSetting, saveSetting } from './dbService';

/**
 * Danh sách đã lưu của tab Sticker. Bản web lưu ở Firestore theo mã kho, app offline lưu trên máy.
 */
const SAVED_LISTS_KEY = 'stickerEventSavedLists';

const readAll = async (): Promise<SavedList[]> => (await getSetting<SavedList[]>(SAVED_LISTS_KEY)) ?? [];

export const saveList = async (name: string, items: SavedListItem[]): Promise<string> => {
  const list: SavedList = {
    id: `list_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name,
    createdAt: new Date().toISOString(),
    items,
    totalItems: items.length,
  };
  await saveSetting(SAVED_LISTS_KEY, [list, ...(await readAll())]);
  return list.id;
};

export const fetchSavedLists = async (): Promise<SavedList[]> =>
  (await readAll()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

export const deleteSavedList = async (id: string): Promise<void> => {
  await saveSetting(SAVED_LISTS_KEY, (await readAll()).filter((list) => list.id !== id));
};
