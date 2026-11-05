import React, { useState, useEffect } from 'react';
import { AppIcon } from '../../../components/shared/ui/icon/AppIcon';
import { useActiveTab } from '../../../contexts/LayoutContext';
import { Button } from '../../../components/shared/ui/Button';
import { TopBarActions } from '../../../components/shared/ui/TopBarActions';
import { Tabs } from '../../../components/shared/ui/Tabs';

interface StickerModeToolbarProps {
    stickerMode: 'sticker' | 'event';
    stickerType: 'gia_soc' | 'gio_vang' | 'draw';
    onSelectGiaSoc: () => void;
    onSelectGioVang: () => void;
    onSelectDraw: () => void;
    onSelectEvent: () => void;
}

export const StickerModeToolbar: React.FC<StickerModeToolbarProps> = ({
    stickerMode, stickerType, onSelectGiaSoc, onSelectGioVang, onSelectDraw, onSelectEvent,
}) => {
    const { activeTab } = useActiveTab();
    const [mounted, setMounted] = useState(false);
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 1024);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    if (!mounted || activeTab !== 'tools-print-sticker') return null;

    // iPhone / iPad (GĐ7, KE_HOACH_GIAO_DIEN_APPLE.md): KHÔNG nhét dải chế độ vào thanh trên nữa (trước: thanh 470px nhét vào
    // khe ~250px, phải vuốt ngang mới thấy "Sticker" và ô cỡ chữ — apple-tuong-thich đỏ ở mọi khung cảm ứng). Nay là HÀNG
    // THỨ HAI ngay dưới thanh trên: segmented 4 chế độ chia đều + hàng cỡ chữ (chỉ ở chế độ tem) với nút −/+ 44px.
    if (isMobile) {
        const activeId = stickerMode === 'event' ? 'event' : stickerType;
        const chon: Record<string, () => void> = { gia_soc: onSelectGiaSoc, gio_vang: onSelectGioVang, draw: onSelectDraw, event: onSelectEvent };
        return (
            <div data-testid="sticker-mode-bar" className="no-print shrink-0 bg-slate-50/95 border-b border-slate-200 px-3 sm:px-4 pt-2 pb-2">
                <div className="space-y-1.5 sm:max-w-lg sm:mx-auto">
                <Tabs
                    variant="segment"
                    size="sm"
                    fullWidth
                    activeId={activeId}
                    onChange={id => chon[id]?.()}
                    items={[
                        { id: 'gia_soc', label: 'Giá sốc' },
                        { id: 'gio_vang', label: 'Giờ vàng' },
                        { id: 'draw', label: 'Phiếu' },
                        { id: 'event', label: 'Sticker' },
                    ]}
                />
                </div>
            </div>
        );
    }

    const stickerTabs = [
        { id: 'gia_soc', label: 'Giá Sốc', icon: 'quick' as const, color: 'sky', onClick: onSelectGiaSoc, isActive: stickerMode === 'sticker' && stickerType === 'gia_soc' },
        { id: 'gio_vang', label: 'Giờ Vàng', icon: 'clock' as const, color: 'amber', onClick: onSelectGioVang, isActive: stickerMode === 'sticker' && stickerType === 'gio_vang' },
        { id: 'draw', label: 'Phiếu', icon: 'coupon' as const, color: 'rose', onClick: onSelectDraw, isActive: stickerMode === 'sticker' && stickerType === 'draw' },
        { id: 'event', label: 'Sticker', icon: 'product' as const, color: 'emerald', onClick: onSelectEvent, isActive: stickerMode === 'event' },
    ];

    const getModeColorClasses = (color: string, isActive: boolean) => {
        if (!isActive) return 'text-slate-500 hover:text-slate-700 hover:bg-slate-50 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800/50';
        switch (color) {
            case 'emerald': return 'bg-emerald-50/80 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:hover:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400 font-semibold';
            case 'amber': return 'bg-amber-50/80 hover:bg-amber-100 dark:bg-amber-900/30 dark:hover:bg-amber-900/50 text-amber-700 dark:text-amber-400 font-semibold';
            case 'rose': return 'bg-rose-50/80 hover:bg-rose-100 dark:bg-rose-900/30 dark:hover:bg-rose-900/50 text-rose-700 dark:text-rose-400 font-semibold';
            case 'sky': return 'bg-sky-50/80 hover:bg-sky-100 dark:bg-sky-900/30 dark:hover:bg-sky-900/50 text-sky-700 dark:text-sky-400 font-semibold';
            default: return 'bg-sky-50/80 hover:bg-sky-100 dark:bg-sky-900/30 dark:hover:bg-sky-900/50 text-sky-700 dark:text-sky-400 font-semibold';
        }
    };

    return (
        <TopBarActions enabled={activeTab === 'tools-print-sticker'}>
            {/* Nhóm chọn chế độ in — Chuẩn 100% theo Hình 1 / Report BI */}
            <TopBarActions.Group>
                {stickerTabs.map((tab, idx) => (
                    <Button
                        variant="tab"
                        size="none"
                        key={tab.id}
                        onClick={tab.onClick}
                        className={`flex items-center justify-center gap-2 px-4 py-2 text-base font-medium shrink-0 focus:outline-none ${idx > 0 ? 'border-l border-slate-100 dark:border-slate-700' : ''} ${getModeColorClasses(tab.color, tab.isActive)}`}
                        title={tab.label}
                    >
                        <AppIcon name={tab.icon} size="md" />
                        <span>{tab.label}</span>
                    </Button>
                ))}
            </TopBarActions.Group>
        </TopBarActions>
    );
};
