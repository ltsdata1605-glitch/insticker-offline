import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSetting, saveSetting } from '../services/dbService';
import { DEFAULT_PRINT_SETTINGS, restorePrintSettings } from '../services/printService';
import type { PrintSettings } from '../services/printService';

/** Người in của tab Sticker, riêng với tab Event. Có trong file sao lưu. */
export const STICKER_TAG_EMPLOYEE_KEY = 'stickerTagEmployeeName';

/**
 * Cài đặt tem của tab Sticker: kiểu tem, phông và bố cục lần in trước, lưu chung khoá printSettings với tab Event.
 * Người in nhập ngay ở tab Sticker, không lấy từ tab Event; để trống thì tem không in tên.
 */
export function useTagPrintSettings(active: boolean) {
    const [saved, setSaved] = useState<PrintSettings>(DEFAULT_PRINT_SETTINGS);
    const [employeeName, setEmployeeNameState] = useState('');

    useEffect(() => {
        if (!active) return;
        let alive = true;
        Promise.all([
            getSetting<Partial<PrintSettings>>('printSettings').catch(() => null),
            getSetting<string>(STICKER_TAG_EMPLOYEE_KEY).catch(() => null),
        ]).then(([settings, name]) => {
            if (!alive) return;
            setSaved(restorePrintSettings(settings));
            setEmployeeNameState(typeof name === 'string' ? name : '');
        });
        return () => { alive = false; };
    }, [active]);

    const update = useCallback((patch: Partial<PrintSettings>) => {
        setSaved((current) => {
            const next = { ...current, ...patch };
            saveSetting('printSettings', next).catch(() => {});
            return next;
        });
    }, []);

    // Ô Người in của tab này quyết định có in tên hay không, nên luôn bật tên dù tab Event đang tắt; tem luôn có ngày giờ in.
    // Không ghi vào cài đặt chung.
    const settings = useMemo(() => ({ ...saved, showEmployeeName: true, showPrintTime: true }), [saved]);

    const setEmployeeName = useCallback((name: string) => {
        setEmployeeNameState(name);
        saveSetting(STICKER_TAG_EMPLOYEE_KEY, name.trim()).catch(() => {});
    }, []);

    return {
        settings,
        employeeName,
        setEmployeeName,
        setStickerStyle: useCallback((stickerStyle: PrintSettings['stickerStyle']) => update({ stickerStyle }), [update]),
        /** Bố cục vừa chọn khi in: khung xem trước hiện tem theo bố cục này. */
        setTagsPerPage: useCallback((tagsPerPage: PrintSettings['tagsPerPage']) => update({ tagsPerPage }), [update]),
    };
}
