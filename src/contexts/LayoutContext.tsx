import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

/**
 * Chức năng đang mở, chọn ở thanh bên trái: Nhắc việc, Kiểm quỹ, Kiểm hàng, Tạo mã, In nhãn hoặc In sticker. Giữ tên `activeTab` và giá trị 'tools-print-sticker'
 * như bản dashboard để code sticker chép sang không phải đổi.
 */
export type AppModule = 'tools-print-sticker' | 'tools-kiem-hang' | 'tools-nhac-viec' | 'tools-tao-ma' | 'tools-kiem-quy' | 'tools-in-nhan';

/** Mở app luôn vào Nhắc việc (tắt Nhắc việc thì vào chức năng đầu tiên còn bật trên thanh bên trái) */
export const START_MODULE: AppModule = 'tools-nhac-viec';
const MODULES: readonly AppModule[] = ['tools-print-sticker', 'tools-kiem-hang', 'tools-nhac-viec', 'tools-tao-ma', 'tools-kiem-quy', 'tools-in-nhan'];
// Nhớ trong phiên (tải lại trang vẫn ở chức năng đang mở), mở lại app thì về Nhắc việc
const SESSION_KEY = 'app.activeModule';

const readSession = (): AppModule => {
    try {
        const stored = sessionStorage.getItem(SESSION_KEY);
        return MODULES.find(module => module === stored) ?? START_MODULE;
    } catch {
        return START_MODULE;
    }
};

interface ActiveTabValue {
    activeTab: AppModule;
    setActiveTab: (module: AppModule) => void;
}

const ActiveTabContext = createContext<ActiveTabValue>({ activeTab: START_MODULE, setActiveTab: () => undefined });

export const ActiveTabProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [activeTab, setActive] = useState<AppModule>(readSession);
    const setActiveTab = useCallback((module: AppModule) => {
        setActive(module);
        try {
            sessionStorage.setItem(SESSION_KEY, module);
        } catch {
            // Không nhớ được thì tải lại trang về Nhắc việc
        }
    }, []);
    const value = useMemo(() => ({ activeTab, setActiveTab }), [activeTab, setActiveTab]);
    return <ActiveTabContext.Provider value={value}>{children}</ActiveTabContext.Provider>;
};

export const useActiveTab = (): ActiveTabValue => useContext(ActiveTabContext);
