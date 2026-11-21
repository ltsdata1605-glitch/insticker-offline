import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

/**
 * Chức năng đang mở, chọn ở thanh bên trái: In sticker, Kiểm hàng, Kiểm quỹ, Nhắc việc hoặc Tạo mã. Giữ tên `activeTab` và giá trị 'tools-print-sticker'
 * như bản dashboard để code sticker chép sang không phải đổi.
 */
export type AppModule = 'tools-print-sticker' | 'tools-kiem-hang' | 'tools-nhac-viec' | 'tools-tao-ma' | 'tools-kiem-quy';

const STORAGE_KEY = 'app.activeModule';

const readStored = (): AppModule => {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        return stored === 'tools-kiem-hang' || stored === 'tools-nhac-viec' || stored === 'tools-tao-ma' || stored === 'tools-kiem-quy' ? stored : 'tools-print-sticker';
    } catch {
        return 'tools-print-sticker';
    }
};

interface ActiveTabValue {
    activeTab: AppModule;
    setActiveTab: (module: AppModule) => void;
}

const ActiveTabContext = createContext<ActiveTabValue>({ activeTab: 'tools-print-sticker', setActiveTab: () => undefined });

export const ActiveTabProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [activeTab, setActive] = useState<AppModule>(readStored);
    const setActiveTab = useCallback((module: AppModule) => {
        setActive(module);
        try {
            localStorage.setItem(STORAGE_KEY, module);
        } catch {
            // Không nhớ được thì lần mở sau về In sticker
        }
    }, []);
    const value = useMemo(() => ({ activeTab, setActiveTab }), [activeTab, setActiveTab]);
    return <ActiveTabContext.Provider value={value}>{children}</ActiveTabContext.Provider>;
};

export const useActiveTab = (): ActiveTabValue => useContext(ActiveTabContext);
