import React, { useId, useMemo, useRef } from 'react';
import { Button, Input, SectionCard } from '../../../components/shared/ui';
import { StickerStylePicker } from './StickerStylePicker';
import { QuantityStepper } from './QuantityStepper';
import type { PrintSettings } from '../services/printService';
import type { Product } from '../types';
import { TagRender } from './TagRender';

/** Nội dung sticker đang soạn: sửa ở đây thì tem xem trước và sticker trong danh sách đổi theo. */
export interface TagEditorFields {
    name: string;
    oldPrice: string;
    newPrice: string;
    promotion: string;
    /** Mã sản phẩm, in thành mã QR trên tem. Để trống thì tem không có QR. */
    code: string;
    onName: (value: string) => void;
    onOldPrice: (value: string) => void;
    onNewPrice: (value: string) => void;
    onPromotion: (value: string) => void;
    onCode: (value: string) => void;
    /** Thêm sticker đang soạn vào danh sách rồi để trống các ô. Trả về false khi chưa thêm được. */
    onAdd: () => boolean;
    /** Số bản in của sticker này. */
    quantity: number;
    onQuantity: (quantity: number) => void;
}

interface TagPreviewPanelProps {
    /** Tem cần hiện: sticker đang soạn, hoặc các dòng đang chọn của file giá. Truyền mảng đã ghi nhớ để không dựng lại mỗi lần vẽ. */
    products: Product[];
    settings: PrintSettings;
    employeeName: string;
    /** Người in của tab Sticker, in ở góc tem. */
    onEmployeeNameChange: (name: string) => void;
    onStickerStyleChange: (style: PrintSettings['stickerStyle']) => void;
    /** Khung xương mờ khi sticker đang soạn còn ô trống: xem TagRender. */
    ghostAlternative?: Product[];
    /** Không có khi đang xem các dòng của file giá: các dòng này sửa ở file, không sửa từng tem. */
    editor?: TagEditorFields;
    footer?: React.ReactNode;
}

const digitsOnly = (value: string) => value.replace(/\D/g, '');
const groupThousands = (digits: string) => (digits ? Number(digits).toLocaleString('vi-VN') : '');

/** Giá cũ ghi đủ số. Giá mới ghi theo nghìn đồng như sticker Giá Sốc; gõ đủ số (từ 100.000 trở lên) thì tự đổi ra nghìn. */
const normalizeOldPrice = (value: string) => groupThousands(digitsOnly(value));
const normalizeNewPrice = (value: string) => {
    const digits = digitsOnly(value);
    if (!digits) return '';
    const amount = Number(digits);
    return (amount >= 100000 ? Math.floor(amount / 1000) : amount).toLocaleString('vi-VN');
};

const layoutCaption = (tagsPerPage: PrintSettings['tagsPerPage']) =>
    tagsPerPage === 80 ? 'máy in bill 80mm' : `${tagsPerPage} sticker / trang`;

/** Khung xem trước của tab Sticker: tem giá theo kiểu đang chọn, không dùng nền Giá Sốc, kèm các ô sửa nội dung. */
export const TagPreviewPanel: React.FC<TagPreviewPanelProps> = ({
    products, settings, employeeName, onEmployeeNameChange, onStickerStyleChange, ghostAlternative, editor, footer,
}) => {
    const id = useId();
    // Tem tab Sticker không in thưởng
    const tagSettings = useMemo(() => ({ ...settings, showBonus: false }), [settings]);
    const nameRef = useRef<HTMLInputElement>(null);
    // Thêm xong thì các ô đã trống: đưa con trỏ về ô tên để gõ ngay sticker tiếp theo
    const add = () => {
        if (editor?.onAdd()) nameRef.current?.focus();
    };
    return (
        // Màn rộng: thẻ cao bằng cột, tem tự thu nhỏ cho vừa phần còn lại nên không phải cuộn
        <SectionCard className="w-full p-3 lg:p-4 flex flex-col gap-2.5 no-print lg:flex-1 lg:min-h-0" data-testid="tag-preview">
            {/* Tám kiểu cần cả bề ngang, nên ô Người in nằm trên cùng hàng với nhãn Kiểu sticker */}
            <div className="shrink-0 flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-3">
                    <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Kiểu sticker</span>
                    <label className="flex items-center gap-2" htmlFor={`${id}-employee`}>
                        <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider whitespace-nowrap">Người in</span>
                        <Input
                            id={`${id}-employee`}
                            value={employeeName}
                            maxLength={40}
                            onChange={(e) => onEmployeeNameChange(e.target.value)}
                            placeholder="Mã hoặc tên"
                            title="In ở góc tem, cạnh giờ in. Để trống thì không in tên."
                            className="!h-8 w-36 text-xs"
                        />
                    </label>
                </div>
                <StickerStylePicker value={settings.stickerStyle} onChange={onStickerStyleChange} />
            </div>

            <TagRender
                products={products}
                settings={tagSettings}
                employeeName={employeeName}
                ghostAlternative={ghostAlternative}
                fit={editor ? 'contain' : 'width'}
                className={`w-full flex-1 min-h-0 ${editor ? 'overflow-hidden' : 'overflow-y-auto'}`}
            />
            <div className="shrink-0 flex items-center gap-3">
                <p className="flex-1 text-[11px] leading-snug text-slate-500">
                    {ghostAlternative ? 'Phần mờ là chỗ chưa nhập, chỉ để thấy bố cục, không được in. ' : ''}
                    Xem trước theo bố cục lần in trước ({layoutCaption(settings.tagsPerPage)}). Bấm in để chọn bố cục.
                </p>
                {editor && (
                    <Button
                        size="sm"
                        icon="add"
                        onClick={add}
                        className="shrink-0 !bg-sky-600 hover:!bg-sky-700 !text-white font-bold border-transparent"
                        title="Thêm sticker này vào danh sách in, rồi để trống các ô cho sticker tiếp theo"
                    >
                        Thêm
                    </Button>
                )}
            </div>

            {editor && (
                <div className="shrink-0 grid grid-cols-2 gap-x-3 gap-y-1.5" data-testid="tag-editor">
                    <label className="flex flex-col gap-0.5" htmlFor={`${id}-name`}>
                        <span className="text-xs font-semibold text-slate-600">Tên sản phẩm</span>
                        <Input ref={nameRef} id={`${id}-name`} value={editor.name} onChange={(e) => editor.onName(e.target.value)} placeholder="VD: Quạt điều hoà Daikiosan" />
                    </label>
                    <label className="flex flex-col gap-0.5" htmlFor={`${id}-code`}>
                        <span className="text-xs font-semibold text-slate-600">Mã QR</span>
                        <Input id={`${id}-code`} value={editor.code} onChange={(e) => editor.onCode(e.target.value.trim())} placeholder="Mã sản phẩm" />
                    </label>
                    <label className="flex flex-col gap-0.5" htmlFor={`${id}-old`}>
                        <span className="text-xs font-semibold text-slate-600">Giá cũ</span>
                        <Input
                            id={`${id}-old`}
                            inputMode="numeric"
                            value={editor.oldPrice}
                            onChange={(e) => editor.onOldPrice(e.target.value)}
                            placeholder="VD: 5.490.000"
                            onBlur={(e) => {
                                const next = normalizeOldPrice(e.target.value);
                                if (next !== editor.oldPrice) editor.onOldPrice(next);
                            }}
                        />
                    </label>
                    <label className="flex flex-col gap-0.5" htmlFor={`${id}-new`}>
                        <span className="text-xs font-semibold text-slate-600">Giá mới (nghìn đồng)</span>
                        <div className="relative">
                            <Input
                                id={`${id}-new`}
                                inputMode="numeric"
                                value={editor.newPrice}
                                onChange={(e) => editor.onNewPrice(e.target.value)}
                                placeholder="VD: 3.490"
                                onBlur={(e) => {
                                    const next = normalizeNewPrice(e.target.value);
                                    if (next !== editor.newPrice) editor.onNewPrice(next);
                                }}
                                className="pr-14"
                            />
                            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">.000 ₫</span>
                        </div>
                    </label>
                    <div className="col-span-2 flex items-end gap-3">
                        <label className="flex-1 min-w-0 flex flex-col gap-0.5" htmlFor={`${id}-promo`}>
                            <span className="text-xs font-semibold text-slate-600">Khuyến mãi</span>
                            <Input id={`${id}-promo`} value={editor.promotion} onChange={(e) => editor.onPromotion(e.target.value)} placeholder="VD: Tặng quạt mini" />
                        </label>
                        <div className="shrink-0 flex flex-col gap-0.5">
                            <span className="text-xs font-semibold text-slate-600">Số bản in</span>
                            <QuantityStepper value={editor.quantity} onChange={editor.onQuantity} label="Số bản in" size="md" />
                        </div>
                    </div>
                </div>
            )}
            {footer}
        </SectionCard>
    );
};
