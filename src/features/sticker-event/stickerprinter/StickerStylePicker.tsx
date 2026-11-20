import React from 'react';
import { STICKER_STYLES } from '../services/printService';
import type { StickerStyle } from '../services/printService';

interface StickerStylePickerProps {
    value: StickerStyle;
    onChange: (style: StickerStyle) => void;
    /** Hộp in rộng hơn khung xem trước nên chữ to hơn. */
    size?: 'sm' | 'md';
}

/** Ô chọn kiểu tem: tám kiểu xếp 4 cột 2 hàng, kiểu đang chọn được tô nổi. */
export const StickerStylePicker: React.FC<StickerStylePickerProps> = ({ value, onChange, size = 'sm' }) => (
    <div role="group" aria-label="Kiểu sticker" className="grid grid-cols-4 gap-1 rounded-control bg-slate-100 p-1">
        {STICKER_STYLES.map((style) => {
            const active = style.id === value;
            return (
                <button
                    key={style.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => onChange(style.id)}
                    className={`rounded-[7px] px-1.5 leading-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
                        size === 'md' ? 'min-h-10 text-sm' : 'min-h-8 text-xs'
                    } ${active ? 'bg-white text-slate-900 font-bold shadow-sm' : 'text-slate-600 hover:bg-white/60 hover:text-slate-800'}`}
                >
                    {style.label}
                </button>
            );
        })}
    </div>
);
