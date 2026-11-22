import React from 'react';
import { Modal } from '../../../components/shared/ui/Modal';
import { STICKER_SHEET_LAYOUTS, stickerSizeMm } from './stickerSheets';
import type { StickerSheetLayout, StickersPerPage } from './stickerSheets';

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
    onSelect: (perPage: StickersPerPage) => void;
    onClose: () => void;
}

/** Giá Sốc và Giờ Vàng: bấm in thì chọn số sticker trên một tờ A4. Danh sách tự lưu vào Lịch sử, không phải đặt tên. */
export const StickerPerPageDialog: React.FC<StickerPerPageDialogProps> = ({ count, current, onSelect, onClose }) => (
    <Modal isOpen={true} onClose={onClose} title="Chọn số sticker trên 1 trang A4" maxWidth="lg">
        <p className="mb-3 text-xs text-slate-500">Danh sách tự lưu vào tab Lịch sử để tra cứu lại; in lại đúng danh sách cũ thì không lưu thêm.</p>
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
                        // Cách xếp lần trước được chọn sẵn: bấm Enter là in luôn
                        autoFocus={chosen}
                        onClick={() => onSelect(layout.perPage)}
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
