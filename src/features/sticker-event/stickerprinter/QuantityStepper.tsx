import React, { useEffect, useState } from 'react';
import { MAX_TAGS_PER_PRODUCT, normalizeTagQuantity } from '../utils/format';

interface QuantityStepperProps {
    value: number;
    onChange: (value: number) => void;
    /** Tên đọc cho trình đọc màn hình, ví dụ "Số bản in của sticker 2". */
    label: string;
    /** 'xs' đặt trên ảnh nhỏ và dòng danh sách, 'md' ở ô sửa. */
    size?: 'xs' | 'md';
    className?: string;
}

/** Ô số lượng in có nút bớt và thêm. Bấm vào không mở sticker (không lan ra dòng hay ảnh chứa nó). */
export const QuantityStepper: React.FC<QuantityStepperProps> = ({ value, onChange, label, size = 'xs', className = '' }) => {
    const [draft, setDraft] = useState(String(value));
    useEffect(() => setDraft(String(value)), [value]);
    const commit = (raw: unknown) => {
        const next = normalizeTagQuantity(raw);
        setDraft(String(next));
        if (next !== value) onChange(next);
    };
    const xs = size === 'xs';
    const button = `flex items-center justify-center font-bold text-slate-700 hover:bg-sky-50 hover:text-sky-700 disabled:opacity-40 disabled:hover:bg-transparent ${
        xs ? 'w-4 h-full text-[11px]' : 'w-9 h-full text-base'
    }`;
    const stop = (e: React.SyntheticEvent) => e.stopPropagation();
    return (
        <div
            role="group"
            aria-label={label}
            onClick={stop}
            onKeyDown={stop}
            className={`inline-flex items-stretch rounded-control border border-slate-300 bg-white/95 shadow-sm overflow-hidden ${xs ? 'h-[18px]' : 'h-[var(--input-height)]'} ${className}`}
        >
            <button type="button" className={button} onClick={() => commit(value - 1)} disabled={value <= 1} aria-label="Bớt một bản" title="Bớt một bản">−</button>
            <input
                type="text"
                inputMode="numeric"
                aria-label={label}
                value={draft}
                onChange={(e) => setDraft(e.target.value.replace(/\D/g, '').slice(0, 3))}
                onBlur={() => commit(draft)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') commit(draft);
                    if (e.key === 'ArrowUp') { e.preventDefault(); commit(value + 1); }
                    if (e.key === 'ArrowDown') { e.preventDefault(); commit(value - 1); }
                }}
                onFocus={(e) => e.currentTarget.select()}
                title="Số bản in"
                className={`text-center font-bold text-slate-900 outline-none border-x border-slate-200 focus:bg-sky-50 ${xs ? 'w-6 text-[10px]' : 'w-12 text-sm'}`}
            />
            <button type="button" className={button} onClick={() => commit(value + 1)} disabled={value >= MAX_TAGS_PER_PRODUCT} aria-label="Thêm một bản" title="Thêm một bản">+</button>
        </div>
    );
};
