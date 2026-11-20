import React, { useEffect, useRef, useState } from 'react';
import BarcodeCanvas from './BarcodeCanvas';

interface BarcodeFieldProps {
    value: string;
    onChange: (value: string) => void;
}

/** Phần chỉ để thao tác trên màn hình. Bản in chép nội dung khung xem trước nên phải bỏ các phần có thuộc tính này. */
export const PRINT_SKIP_ATTR = 'data-print-skip';

const SLOT_STYLE: React.CSSProperties = {
    position: 'absolute',
    top: '0.4%',
    left: '15%',
    width: '70%',
    height: '3.4%',
    zIndex: 5,
};

/**
 * Dòng mã vạch trên sticker Giá Sốc, Giờ Vàng: bấm vào để gõ mã, Enter hoặc bấm ra ngoài là xong, Esc để thôi.
 * Chưa có mã thì hiện chỗ trống để bấm (không in ra).
 */
export const BarcodeField: React.FC<BarcodeFieldProps> = ({ value, onChange }) => {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(value);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (editing) inputRef.current?.select();
    }, [editing]);

    const start = () => {
        setDraft(value);
        setEditing(true);
    };
    const finish = (save: boolean) => {
        setEditing(false);
        const next = draft.trim();
        if (save && next !== value) onChange(next);
    };

    if (editing) {
        return (
            <label {...{ [PRINT_SKIP_ATTR]: '' }} style={SLOT_STYLE} className="flex items-center">
                <span className="sr-only">Mã vạch</span>
                <input
                    ref={inputRef}
                    aria-label="Mã vạch"
                    value={draft}
                    maxLength={40}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={() => finish(true)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            finish(true);
                        } else if (e.key === 'Escape') {
                            e.preventDefault();
                            e.stopPropagation();
                            finish(false);
                        }
                    }}
                    placeholder="Gõ mã sản phẩm, Enter để xong"
                    className="w-full h-full min-h-7 rounded-control border border-sky-500 bg-white px-2 text-center text-sm text-slate-900 shadow-md outline-none ring-2 ring-sky-200"
                />
            </label>
        );
    }

    if (!value) {
        return (
            <button
                type="button"
                {...{ [PRINT_SKIP_ATTR]: '' }}
                onClick={start}
                style={SLOT_STYLE}
                className="flex items-center justify-center rounded-sm border border-dashed border-sky-400 bg-sky-50/80 text-[11px] font-semibold text-sky-700 hover:bg-sky-100"
                title="Bấm để nhập mã vạch"
            >
                Bấm để nhập mã vạch
            </button>
        );
    }

    return (
        <div
            className="barcode cursor-pointer hover:outline hover:outline-2 hover:outline-offset-2 hover:outline-sky-400"
            role="button"
            tabIndex={0}
            aria-label={`Mã vạch ${value}. Bấm để sửa`}
            title="Bấm để sửa mã vạch"
            onClick={start}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    start();
                }
            }}
        >
            <BarcodeCanvas value={value} />
        </div>
    );
};
