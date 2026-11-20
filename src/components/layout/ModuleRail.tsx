import React from 'react';
import { AppIcon } from '../shared/ui/icon/AppIcon';
import type { IconName } from '../shared/ui/icon';
import type { AppModule } from '../../contexts/LayoutContext';

export interface RailItem {
    id: AppModule;
    label: string;
    icon: IconName;
}

export const RAIL_ITEMS: readonly RailItem[] = [
    { id: 'tools-print-sticker', label: 'In sticker', icon: 'print' },
    { id: 'tools-kiem-hang', label: 'Kiểm hàng', icon: 'checklist' },
];

/** Thanh chức năng bên trái, nằm ngay dưới logo. Chỉ hiện khi có từ hai chức năng đang bật. */
export const ModuleRail: React.FC<{ items: readonly RailItem[]; current: AppModule; onSelect: (id: AppModule) => void }> = ({ items, current, onSelect }) => (
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
                        className={`w-11 h-11 rounded-[12px] flex items-center justify-center transition-colors ${
                            active ? 'bg-sky-600 text-white shadow-md shadow-sky-300/40' : 'bg-white border border-slate-200 group-hover:border-sky-300 group-hover:text-sky-600'
                        }`}
                    >
                        <AppIcon name={item.icon} size="lg" />
                    </span>
                    <span className={`text-[11px] leading-tight text-center ${active ? 'font-bold' : 'font-medium'}`}>{item.label}</span>
                </button>
            );
        })}
    </nav>
);
