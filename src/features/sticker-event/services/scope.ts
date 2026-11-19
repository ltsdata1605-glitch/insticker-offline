import { createContext, useContext } from 'react';

/**
 * Hai tab dùng chung màn danh sách sản phẩm: Event lấy giá từ bảng giá ERP, Sticker lấy từ file mẫu người dùng tự điền.
 * Danh sách, sản phẩm nhập tay và danh sách đã lưu của mỗi tab là riêng; tên người in và cài đặt tem dùng chung.
 */
export type StickerScope = 'event' | 'sticker';

/** Khoá lưu trên máy của từng tab. Tab Event giữ tên khoá cũ để không mất dữ liệu đã lưu từ các bản trước. */
export const scopedKey = (scope: StickerScope, key: string): string => (scope === 'event' ? key : `sticker.${key}`);

export const StickerScopeContext = createContext<StickerScope>('event');

export const useStickerScope = (): StickerScope => useContext(StickerScopeContext);
