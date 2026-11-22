import React from 'react';
import { AppIcon } from '../shared/ui/icon/AppIcon';
import type { IconName } from '../shared/ui/icon';
import type { AppModule } from '../../contexts/LayoutContext';

export interface RailItem {
    id: AppModule;
    label: string;
    icon: IconName;
}

/** Thứ tự trên thanh bên trái; Nhắc việc đứng đầu và mở sẵn khi mở app */
export const RAIL_ITEMS: readonly RailItem[] = [
    { id: 'tools-nhac-viec', label: 'Nhắc việc', icon: 'notification' },
    { id: 'tools-kiem-quy', label: 'Kiểm quỹ', icon: 'cash' },
    { id: 'tools-kiem-hang', label: 'Kiểm hàng', icon: 'checklist' },
    { id: 'tools-tao-ma', label: 'Tạo mã', icon: 'qrCode' },
    { id: 'tools-in-nhan', label: 'In nhãn', icon: 'tag' },
    { id: 'tools-print-sticker', label: 'In sticker', icon: 'print' },
];

/** Thanh chức năng bên trái, nằm ngay dưới logo. Chỉ hiện khi có từ hai chức năng đang bật. */
export const ModuleRail: React.FC<{
    items: readonly RailItem[];
    current: AppModule;
    onSelect: (id: AppModule) => void;
    /** Số đỏ trên biểu tượng, ví dụ số việc quá hạn của Nhắc việc */
    badges?: Partial<Record<AppModule, number>>;
}> = ({ items, current, onSelect, badges }) => (
    <nav aria-label="Chức năng" className="no-print w-20 shrink-0 flex flex-col items-center gap-2 pt-4 border-r border-slate-200/60 bg-slate-50/60">
        {items.map(item => {
            const active = item.id === current;
            return (
                <button
                    key={item.id}
                    type="button"
                    aria-current={active ? 'page' : undefined}
                    onClick={() => onSelect(item.id)}
                    className={`group w-16 flex flex-col items-center gap-1 rounded-control py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${active ? 'text-sky-700' : 'text-slate-500 hover:text-slate-800'}`}
                >
                    <span
                        className={`relative w-11 h-11 rounded-[12px] flex items-center justify-center transition-colors ${
                            active ? 'bg-sky-600 text-white shadow-md shadow-sky-300/40' : 'bg-white border border-slate-200 group-hover:border-sky-300 group-hover:text-sky-600'
                        }`}
                    >
                        <AppIcon name={item.icon} size="lg" />
                        {Boolean(badges?.[item.id]) && (
                            <span data-testid={`so-do-${item.id}`} className="absolute -right-1.5 -top-1.5 min-w-5 h-5 px-1 rounded-full bg-rose-600 text-white text-[11px] font-black leading-5 text-center ring-2 ring-white">
                                {badges![item.id]! > 99 ? '99+' : badges![item.id]}
                            </span>
                        )}
                    </span>
                    <span className={`text-[11px] leading-tight text-center ${active ? 'font-bold' : 'font-medium'}`}>{item.label}</span>
                </button>
            );
        })}
    </nav>
);
