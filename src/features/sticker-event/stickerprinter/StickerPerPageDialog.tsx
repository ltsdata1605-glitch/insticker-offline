import React, { useState } from 'react';
import { Modal } from '../../../components/shared/ui/Modal';
import { STICKER_SHEET_LAYOUTS, stickerSizeMm } from './stickerSheets';
import type { StickerSheetLayout, StickersPerPage } from './stickerSheets';
import { ListNameField } from './ListNameField';

const cm = (mm: number) => (Math.round(mm) / 10).toLocaleString('vi-VN', { maximumFractionDigits: 1 });

/** Hình tờ giấy thu nhỏ, chia ô đúng như khi in. */
const SheetSketch: React.FC<{ layout: StickerSheetLayout }> = ({ layout }) => (
    <div
        aria-hidden="true"
        className={`shrink-0 grid gap-[2px] p-[3px] bg-white border border-slate-300 rounded-[3px] ${layout.landscape ? 'w-14 h-10' : 'w-10 h-14'}`}
        style={{ gridTemplateColumns: `repeat(${layout.cols}, 1fr)`, gridTemplateRows: `repeat(${layout.rows}, 1fr)` }}
    >
        {Array.from({ length: layout.perPage }, (_, index) => (
            <span key={index} className="rounded-[1px] bg-sky-200" />
        ))}
    </div>
);

interface StickerPerPageDialogProps {
    /** Số sticker sắp in, để báo mỗi cách xếp ra bao nhiêu tờ. */
    count: number;
    /** Cách xếp lần in trước, được chọn sẵn: bấm Enter là in luôn. */
    current: StickersPerPage;
    /** Tên các lần in trước, để chọn lại nhanh. */
    nameSuggestions: string[];
    onSelect: (perPage: StickersPerPage, listName: string) => void;
    onClose: () => void;
}

/** Giá Sốc và Giờ Vàng: bấm in thì đặt tên danh sách và chọn số sticker trên một tờ A4. */
export const StickerPerPageDialog: React.FC<StickerPerPageDialogProps> = ({ count, current, nameSuggestions, onSelect, onClose }) => {
    const [listName, setListName] = useState('');
    const named = listName.trim().length > 0;
    return (
    <Modal isOpen={true} onClose={onClose} title="Chọn số sticker trên 1 trang A4" maxWidth="lg">
        <div className="mb-4">
            <ListNameField value={listName} onChange={setListName} suggestions={nameSuggestions} onSubmit={() => onSelect(current, listName.trim())} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {STICKER_SHEET_LAYOUTS.map(layout => {
                const { width, height } = stickerSizeMm(layout);
                const pages = Math.ceil(count / layout.perPage);
                const chosen = layout.perPage === current;
                return (
                    <button
                        key={layout.perPage}
                        type="button"
                        aria-pressed={chosen}
                        disabled={!named}
                        onClick={() => onSelect(layout.perPage, listName.trim())}
                        className={`flex items-center gap-4 w-full p-4 text-left rounded-card border transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:opacity-50 disabled:cursor-not-allowed ${
                            chosen ? 'bg-sky-50 border-sky-400' : 'bg-slate-50 border-slate-200 hover:bg-sky-50 hover:border-sky-300'
                        }`}
                    >
                        <SheetSketch layout={layout} />
                        <span className="min-w-0">
                            <span className="block font-bold text-[17px] leading-7 text-slate-800">
                                {layout.perPage} sticker / trang
                            </span>
                            <span className="block text-sm text-slate-600">
                                A4 {layout.landscape ? 'ngang' : 'dọc'}, sticker {cm(width)} x {cm(height)} cm
                            </span>
                            <span className="block text-sm text-slate-500">
                                {pages} trang{chosen ? ', lần in trước' : ''}
                            </span>
                        </span>
                    </button>
                );
            })}
        </div>
    </Modal>
    );
};
