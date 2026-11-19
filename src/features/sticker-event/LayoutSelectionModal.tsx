import React, { useMemo, useState } from 'react';
import { PrintSettings, ModernLayoutPositions } from './services/printService';
import { Button } from '../../components/shared/ui/Button';
import { Modal } from '../../components/shared/ui/Modal';
import { Tabs } from '../../components/shared/ui/Tabs';
import type { Product, TagLayout } from './types';
import { DEFAULT_TAG_LAYOUT, TAG_LAYOUTS, groupByLayout } from './services/tagLayouts';
import { normalizeTagQuantity } from './utils/format';

/** Tab Sticker: mỗi sản phẩm một bố cục, sửa được ngay trong hộp này trước khi in. */
interface PerProductLayout {
    products: Product[];
    onSetLayout: (msp: string, layout: TagLayout) => void;
    onPrint: (layoutByMsp: Record<string, TagLayout>) => void;
}

interface LayoutSelectionModalProps {
    onSelect: (tagsPerPage: PrintSettings['tagsPerPage']) => void;
    onClose: () => void;
    stickerStyle: 'default' | 'modern';
    onStickerStyleChange: (style: 'default' | 'modern') => void;
    modernPositions?: ModernLayoutPositions;
    onModernPositionsChange: (positions: ModernLayoutPositions) => void;
    perProduct?: PerProductLayout;
}

const LayoutOptionButton: React.FC<{
    value: PrintSettings['tagsPerPage'];
    label: string;
    description: string;
    onSelect: (value: PrintSettings['tagsPerPage']) => void;
    compact?: boolean;
}> = ({ value, label, description, onSelect, compact }) => (
    <Button
        variant="card"
        size="none"
        onClick={() => onSelect(value)}
        className={`justify-start w-full rounded-card bg-slate-50 hover:bg-sky-50 border border-slate-200 hover:border-sky-300 duration-200 ${compact ? 'p-2.5' : 'p-4'}`}
    >
        <div>
            <p className={`font-bold text-slate-800 ${compact ? 'text-sm leading-5' : 'text-[17px] leading-7'}`}>{label}</p>
            {description && <p className={`text-slate-600 ${compact ? 'text-xs' : 'text-sm'}`}>{description}</p>}
        </div>
    </Button>
);

const ALL_OPTIONS: { value: PrintSettings['tagsPerPage']; label: string; description: string }[] = [
    ...TAG_LAYOUTS,
    { value: 80, label: 'Máy in bill (80mm)', description: 'Khổ giấy in nhiệt K80mm' },
];

const PerProductSection: React.FC<{ perProduct: PerProductLayout }> = ({ perProduct }) => {
    // Sửa trong hộp này cũng ghi vào danh sách; giữ bản riêng để in đúng cả khi in từ màn nhập tay
    const [layouts, setLayouts] = useState<Record<string, TagLayout>>(() =>
        Object.fromEntries(perProduct.products.map((p) => [p.msp, p.layout ?? DEFAULT_TAG_LAYOUT])));
    const products = useMemo(
        () => perProduct.products.map((p) => ({ ...p, layout: layouts[p.msp] ?? p.layout ?? DEFAULT_TAG_LAYOUT })),
        [perProduct.products, layouts],
    );
    const groups = useMemo(() => groupByLayout(products), [products]);

    const change = (msp: string, layout: TagLayout) => {
        setLayouts((current) => ({ ...current, [msp]: layout }));
        perProduct.onSetLayout(msp, layout);
    };

    return (
        <div className="space-y-3 pt-2" data-testid="per-product-layouts">
            <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">2. Bố cục từng sản phẩm</h3>
            <div className="max-h-[38dvh] overflow-y-auto rounded-card border border-slate-200 divide-y divide-slate-100">
                {products.map((p) => (
                    <div key={p.msp} className="flex items-center gap-3 px-3 py-2">
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-slate-800 truncate" title={p.sanPham}>{p.sanPham}</p>
                            <p className="text-xs text-slate-500 tabular-nums">{p.msp} · {normalizeTagQuantity(p.quantity)} tem</p>
                        </div>
                        <select
                            aria-label={`Bố cục in ${p.msp}`}
                            value={p.layout}
                            onChange={(e) => change(p.msp, Number(e.target.value) as TagLayout)}
                            className="h-8 rounded-control border border-slate-200 bg-white px-2 text-sm font-bold text-slate-700 tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                        >
                            {TAG_LAYOUTS.map((layout) => (
                                <option key={layout.value} value={layout.value}>{layout.value} sticker/trang</option>
                            ))}
                        </select>
                    </div>
                ))}
            </div>
            <ul className="flex flex-wrap gap-1.5" aria-label="Các lượt in">
                {groups.map((group) => {
                    const tags = group.items.reduce((sum, p) => sum + normalizeTagQuantity(p.quantity), 0);
                    return (
                        <li key={group.layout} className="text-xs font-semibold text-sky-800 bg-sky-50 border border-sky-100 rounded-full px-2.5 py-1 tabular-nums">
                            {group.layout}/trang: {group.items.length} SP, {tags} tem, {Math.ceil(tags / group.layout)} trang
                        </li>
                    );
                })}
            </ul>
            <Button
                variant="primary"
                size="none"
                onClick={() => perProduct.onPrint(layouts)}
                disabled={products.length === 0}
                className="w-full h-11 rounded-popup text-sm font-bold"
            >
                In theo bố cục từng sản phẩm ({groups.length} lượt in)
            </Button>
            {groups.length > 1 && (
                <p className="text-xs text-slate-500 leading-relaxed">
                    Mỗi bố cục in trên khổ giấy riêng (ngang hoặc dọc) nên in thành từng lượt. In xong hoặc đóng màn xem trước thì lượt sau tự mở.
                </p>
            )}
        </div>
    );
};

const LayoutSelectionModal: React.FC<LayoutSelectionModalProps> = ({ onSelect, onClose, stickerStyle, onStickerStyleChange, perProduct }) => {
    return (
        <Modal
            isOpen={true}
            onClose={onClose}
            title="Chọn Kiểu & Bố Cục In"
            titleColorClass="text-slate-900"
            maxWidth="lg"
        >
            <div className="space-y-4">
                <div className="py-2">
                    <h3 className="text-sm font-semibold text-slate-700 mb-2 uppercase tracking-wide">1. Chọn Kiểu Sticker</h3>
                    <Tabs
                        variant="segment"
                        fullWidth
                        activeId={stickerStyle}
                        onChange={(id) => onStickerStyleChange(id as 'default' | 'modern')}
                        items={[
                            { id: 'default', label: 'Kiểu có sẵn' },
                            { id: 'modern', label: 'Kiểu hiện đại' },
                        ]}
                    />
                </div>

                {perProduct && <PerProductSection perProduct={perProduct} />}

                <div className="space-y-3 pt-2">
                    <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
                        {perProduct ? 'Hoặc in tất cả theo một bố cục' : '2. Chọn Bố Cục Trang In'}
                    </h3>
                    <div className={`grid gap-3 ${perProduct ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-1 sm:grid-cols-2'}`}>
                        {ALL_OPTIONS.map(option => (
                            <LayoutOptionButton
                                key={option.value}
                                value={option.value}
                                label={perProduct ? (option.value === 80 ? 'Bill 80mm' : `${option.value}/trang`) : option.label}
                                description={perProduct ? '' : option.description}
                                onSelect={onSelect}
                                compact={Boolean(perProduct)}
                            />
                        ))}
                    </div>
                </div>
            </div>
        </Modal>
    );
};

export default LayoutSelectionModal;
