import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { toast } from '../../../components/shared/ui/toast';
import { saveSetting, getSetting } from '../services/dbService';
import { openPrintPreview } from '../../../platform/printPreview';
import { buildAppStyledDocument } from '../../../platform/printDocument';
import { StickerPage, SavedStickerList, PrintHistoryEntry, BatchItem, TicketDrawData } from '../stickerprinter/types';
import { ghostTagPreview, stickerPageToTagProduct } from '../stickerprinter/tagProducts';
import { formatPriceChangePercent, normalizeTagQuantity } from '../utils/format';
import { getHiddenTabs, resolveVisibleSub } from '../tabAccess';
import type { Product } from '../types';
import { resolvePagePrices, resolveQueuePage, tagQueueContext, generatePageHtml, isHistoryDuplicate, generateDrawPagesHtml, autoListName } from '../stickerprinter/pageHtmlUtils';
import { parsePercentValue, downloadStickerTemplate, parseTemplateExcelData } from '../stickerprinter/excelParsers';
import { looksLikeErpPriceSheet, parseErpPriceRows } from '../services/erpPriceRows';
import { mergeErpProductsIntoPages } from '../stickerprinter/erpStickerImport';
import { getStickerPreviewStyles } from '../stickerprinter/stickerPreviewStyles';
import { PRINT_SKIP_ATTR } from '../stickerprinter/BarcodeField';
import { buildStickerSheets, normalizeStickersPerPage, STICKERS_PER_PAGE_KEY } from '../stickerprinter/stickerSheets';
import type { StickersPerPage } from '../stickerprinter/stickerSheets';
import {
    DEFAULT_FIELD_SIZES,
    DRAW_FIELDS,
    TEM_FIELDS,
    FIELD_SIZE_EVENT,
    detectFieldName,
    resetFieldFormatting,
    resetFieldHtml,
} from '../stickerprinter/fieldFontSizes';
import type { FieldSizeChange, StickerFieldName } from '../stickerprinter/fieldFontSizes';
import {
    getDefaultBgImageForType,
    isValidBgImageForType,
    resolveEffectiveBgImage,
    getDefaultHeaderForType,
    getDefaultSubHeaderForType,
    getDefaultActiveFieldForType,
    GIO_VANG_DEFAULT_BG,
    GIA_SOC_DEFAULT_BG,
    DRAW_DMX_DEFAULT_BG,
    StickerType,
} from '../stickerprinter/stickerBackgroundHelpers';

const STICKER_DB_KEY = 'stickerPrinterState';
const STICKER_HISTORY_KEY = 'stickerPrintHistory';
const STICKER_SAVED_LISTS_KEY = 'stickerSavedLists';
const STICKER_LAST_SUB_KEY = 'sticker_last_sub';
// 'sticker' là tab Sticker in từ file mẫu, 'event' là tab Event (trước đây tên là Sticker) in từ bảng giá ERP
const STICKER_SUBS = ['draw', 'gia-soc', 'gio-vang', 'sticker', 'event'];
function readLastStickerSub(): string {
    try {
        const v = localStorage.getItem(STICKER_LAST_SUB_KEY);
        return v && STICKER_SUBS.includes(v) ? v : 'draw';
    } catch {
        return 'draw';
    }
}

/** Bản sao khung xem trước không có các phần chỉ để thao tác trên màn hình (ô nhập mã vạch, chỗ bấm để nhập). */
function withoutScreenOnlyParts(el: HTMLElement): HTMLElement {
    const copy = el.cloneNode(true) as HTMLElement;
    copy.querySelectorAll(`[${PRINT_SKIP_ATTR}]`).forEach(part => part.remove());
    return copy;
}

/** Số bản in của một sticker trong danh sách (không có là 1). */
const pageQuantity = (page: StickerPage): number => normalizeTagQuantity(page.quantity ?? 1);

/** Ghi tab con lên địa chỉ trang để mở lại đúng tab. */
function writeSubQueryParam(sub: string) {
    try {
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.set('sub', sub);
        window.history.replaceState(null, '', newUrl.toString());
    } catch (e) {
        console.error("Failed to sync sub-tab to URL:", e);
    }
}

/** ID cố định cho entry lịch sử mặc định — không xoá được. */
export const DEFAULT_HISTORY_ID = '__default_draw_template__';

/** Nội dung phiếu rút thăm mặc định — dùng làm giá trị khởi tạo và entry lịch sử cố định. */
const DEFAULT_DRAW_TICKET_TEMPLATE: TicketDrawData = {
    id: '1',
    title: 'PHIẾU RÚT THĂM TRÚNG THƯỞNG 19 & 26/9',
    code: '1',
    footer: 'ĐIỆN MÁY XANH',
    contentTop: '<div style="font-size: 4.5cqw; line-height: 1.1;"><b>RÚT THĂM 19H</b></div><div style="font-size: 3.5cqw; line-height: 1.1;"><b>MIỄN PHÍ 370 SUẤT:</b></div>',
    contentTopRight: '<div style="font-size: 8cqw; line-height: 1.5; font-weight: normal;">MIỄN PHÍ</div>',
    contentBottom: '<div style="font-size: 2.9cqw; line-height: 1.4;"><b>- 150 Bộ 3 hộp</b> <span style="font-weight: normal;">(75 Suất/ngày)</span></div><div style="font-size: 2.9cqw; line-height: 1.4;"><b>- 8 Tủ sấy quần áo</b> <span style="font-weight: normal;">(4 Suất/ngày)</span></div><div style="font-size: 2.9cqw; line-height: 1.4;"><b>- 8 Nồi cơm</b> <span style="font-weight: normal;">(4 Suất/ngày)</span></div>',
    contentBottomRight: '<div style="font-size: 7.6cqw; line-height: 1.2;"><b>2 MÁY GIẶT</b></div>',
    contentBottomRightSub: '<div style="font-size: 3cqw; line-height: 1.4;">(1 suất/ ngày)</div>',
};

/** Entry lịch sử mặc định — luôn hiển thị cố định ở trên cùng tab Lịch sử, không thể xoá. */
export const DEFAULT_DRAW_HISTORY_ENTRY: PrintHistoryEntry = {
    id: DEFAULT_HISTORY_ID,
    timestamp: 0, // epoch 0 → luôn nằm cuối khi sort theo thời gian
    label: 'Phiếu Rút Thăm — Mẫu mặc định',
    pageCount: 1000,
    stickerType: 'draw',
    bgImage: '/frame/bg_phieu.png',
    headerTextSize: 8,
    subHeaderTextSize: 13,
    percentTextSize: 36.9,
    oldPriceTextSize: 14.2,
    nameTextSize: 3.6,
    newPriceTextSize: 26.5,
    footerTextSize: 3.2,
    batchItems: [],
    headerTextContent: '',
    subHeaderTextContent: '',
    footerTextContent: '',
    manualPages: [],
    drawTickets: [
        { ...DEFAULT_DRAW_TICKET_TEMPLATE, id: '1', code: '1' },
        { ...DEFAULT_DRAW_TICKET_TEMPLATE, id: '2', code: '2' },
        { ...DEFAULT_DRAW_TICKET_TEMPLATE, id: '3', code: '3' },
        { ...DEFAULT_DRAW_TICKET_TEMPLATE, id: '4', code: '4' },
    ],
    drawStartNumber: 1,
    drawTotalTickets: 4000,
    drawAutoIncrement: true,
    drawContentTopLeftSize: 4.5,
    drawContentTopRightSize: 8,
    drawContentBottomLeftSize: 2.9,
    drawContentBottomRightSize: 7.6,
    drawContentBottomRightSubSize: 3.0,
    drawTitleSize: 4.3,
    drawCodeSize: 3.8,
    drawFooterSize: 3.8,
};

export function useStickerPrinterData() {
    // 'sticker': Giá Sốc, Giờ Vàng, Phiếu; 'tag': tab Sticker, cùng màn và danh sách với Giá Sốc nhưng in ra tem giá theo
    // kiểu và bố cục chọn lúc in; 'event': tab Event in từ bảng giá
    const [stickerMode, setStickerMode] = useState<'sticker' | 'event' | 'tag'>('sticker');
    const [eventEverOpened, setEventEverOpened] = useState(false);
    // Tem đang chờ chọn kiểu và bố cục in ở tab Sticker; onPrinted ghi lịch sử in khi đã mở màn xem trước
    const [tagPrint, setTagPrint] = useState<{ products: Product[]; onPrinted: () => void } | null>(null);
    // Giá Sốc, Giờ Vàng: sticker đang chờ chọn số sticker mỗi tờ A4, và cách xếp lần in trước
    const [sheetPrint, setSheetPrint] = useState<{ count: number; print: (perPage: StickersPerPage) => void } | null>(null);
    const [stickersPerPage, setStickersPerPage] = useState<StickersPerPage>(1);
    useEffect(() => {
        getSetting<number>(STICKERS_PER_PAGE_KEY)
            .then(saved => setStickersPerPage(normalizeStickersPerPage(saved)))
            .catch(() => {});
    }, []);
    const chooseStickersPerPage = (perPage: StickersPerPage) => {
        const pending = sheetPrint;
        setSheetPrint(null);
        setStickersPerPage(perPage);
        saveSetting(STICKERS_PER_PAGE_KEY, perPage).catch(() => {});
        pending?.print(perPage);
    };
    const [stickerType, setStickerType] = useState<'gia_soc' | 'gio_vang' | 'draw'>('draw');
    const [bgImage, setBgImage] = useState('/frame/bg_phieu.png');
    const [priceSource, setPriceSource] = useState<'sale' | 'service'>('sale');
    
    // Ticket draw state — khởi tạo từ mẫu mặc định
    const [drawTickets, setDrawTickets] = useState<TicketDrawData[]>([
        { ...DEFAULT_DRAW_TICKET_TEMPLATE, id: '1', code: '1' },
        { ...DEFAULT_DRAW_TICKET_TEMPLATE, id: '2', code: '2' },
        { ...DEFAULT_DRAW_TICKET_TEMPLATE, id: '3', code: '3' },
        { ...DEFAULT_DRAW_TICKET_TEMPLATE, id: '4', code: '4' },
    ]);
    const [drawStartNumber, setDrawStartNumber] = useState<number>(1);
    const [drawTotalTickets, setDrawTotalTickets] = useState<number>(4000);
    const [drawAutoIncrement, setDrawAutoIncrement] = useState<boolean>(true);

    const [drawContentTopLeftSize, setDrawContentTopLeftSize] = useState(4.5);
    const [drawContentTopRightSize, setDrawContentTopRightSize] = useState(8);
    const [drawContentBottomLeftSize, setDrawContentBottomLeftSize] = useState(2.9);
    const [drawContentBottomRightSize, setDrawContentBottomRightSize] = useState(7.6);
    const [drawContentBottomRightSubSize, setDrawContentBottomRightSubSize] = useState(3.0);
    const [drawTitleSize, setDrawTitleSize] = useState(4.3);
    const [drawCodeSize, setDrawCodeSize] = useState(3.8);
    const [drawFooterSize, setDrawFooterSize] = useState(3.8);
    
    // Dynamic Font Sizes and Active Field Trackers
    const [activeField, setActiveField] = useState<string>('drawContentBottomLeft');
    const [headerTextSize, setHeaderTextSize] = useState(8);
    const [subHeaderTextSize, setSubHeaderTextSize] = useState(13);
    const [percentTextSize, setPercentTextSize] = useState(36.9);
    const [oldPriceTextSize, setOldPriceTextSize] = useState(14.2);
    const [nameTextSize, setNameTextSize] = useState(3.6);
    const [newPriceTextSize, setNewPriceTextSize] = useState(26.5);
    const [footerTextSize, setFooterTextSize] = useState(3.2);
    const [discountDisplayMode, setDiscountDisplayMode] = useState<'percent' | 'amount'>('percent');
    const [discountThreshold, setDiscountThreshold] = useState('');
    const [activeQueuePageId, setActiveQueuePageId] = useState<string | null>(null);
    const [activeSubTab, setActiveSubTab] = useState<'data' | 'queue' | 'history'>('data');

    const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
    const [headerTextContent, setHeaderTextContent] = useState('QUẠT ĐIỀU HOÀ');
    const [subHeaderTextContent, setSubHeaderTextContent] = useState('0 SUẤT/NGÀY');
    const [footerTextContent, setFooterTextContent] = useState('Khuyến mãi áp dụng đến hết ngày 3/5/2026');
    const [searchTerm, setSearchTerm] = useState('');
    const [barcodeImei, setBarcodeImei] = useState('123456');
    // Số bản in của sticker đang soạn (chưa thêm vào danh sách); sticker trong danh sách giữ số bản của riêng nó
    const [composeQuantity, setComposeQuantity] = useState(1);
    const [manualPages, setManualPages] = useState<StickerPage[]>([]);
    /** Số bản in hiện ở ô số lượng: của sticker đang mở, hoặc của sticker đang soạn. */
    const editorQuantity = useMemo(() => {
        const active = activeQueuePageId ? manualPages.find(page => page.id === activeQueuePageId) : undefined;
        return active ? pageQuantity(active) : composeQuantity;
    }, [activeQueuePageId, manualPages, composeQuantity]);
    /** Số bản sẽ in khi bấm in, hiện trên nút Bấm để in. */
    const stickerPrintCount = useMemo(() => {
        const listCopies = manualPages.filter(page => page.selected !== false).reduce((sum, page) => sum + pageQuantity(page), 0);
        if (batchItems.length > 0) return batchItems.filter(item => item.selected).length + listCopies;
        return manualPages.length > 0 ? listCopies : editorQuantity;
    }, [manualPages, batchItems, editorQuantity]);
    const [printHistory, setPrintHistory] = useState<PrintHistoryEntry[]>([]);
    const [showHistory, setShowHistory] = useState(false);
    const [savedLists, setSavedLists] = useState<SavedStickerList[]>([]);
    // true = savedLists vừa được cập nhật từ storage (indexeddb-change), không phải người
    // dùng gõ — effect ghi-lại IndexedDB đọc cờ này để không ghi lại y hệt dữ liệu vừa đọc
    // ra (tránh vòng lặp vô hạn với useCloudSync.ts, xem 2 effect bên dưới).
    const skipNextSavedListsSaveRef = useRef(false);
    const [showSavedLists, setShowSavedLists] = useState(false);
    const [previewName, setPreviewName] = useState('Quạt điều hoà Daikiosan DMI03');
    const [previewOldPrice, setPreviewOldPrice] = useState('5.490.000');
    const [previewNewPrice, setPreviewNewPrice] = useState('3.490');

    const [isLoaded, setIsLoaded] = useState(false);
    const [isSaveListModalOpen, setIsSaveListModalOpen] = useState(false);

    useEffect(() => {
        if (stickerType === 'draw' && activeSubTab === 'queue') {
            setActiveSubTab('data');
        }
    }, [stickerType, activeSubTab]);

    const updateBatchItem = (id: string, updates: Partial<BatchItem>) => {
        setBatchItems(prev => prev.map(it => it.id === id ? { ...it, ...updates } : it));
    };

    useEffect(() => {
        if (!isLoaded) return;
        if (stickerType !== 'draw') return;

        setDrawTickets(prev => {
            const firstTicketData = prev[0] || { id: '1', title: '', code: '', footer: '', contentTop: '', contentTopRight: '', contentBottom: '', contentBottomRight: '', contentBottomRightSub: '' };
            const newTickets: TicketDrawData[] = [];
            // Mỗi trang A4 gồm 4 phiếu — luôn sinh đủ số lượng lấp đầy các trang in (tối thiểu 4 phiếu = 1 trang A4)
            const totalTicketsToGenerate = Math.max(4, Math.ceil(drawTotalTickets / 4) * 4);

            for (let i = 0; i < totalTicketsToGenerate; i++) {
                const ticketCode = drawAutoIncrement ? (drawStartNumber + i).toString() : (prev[i]?.code || firstTicketData.code || '1');
                if (i === 0) {
                    newTickets.push({
                        ...firstTicketData,
                        id: '1',
                        code: drawAutoIncrement ? drawStartNumber.toString() : (firstTicketData.code || '1')
                    });
                } else {
                    newTickets.push({
                        id: (i + 1).toString(),
                        title: firstTicketData.title, 
                        footer: firstTicketData.footer,
                        contentTop: firstTicketData.contentTop,
                        contentTopRight: firstTicketData.contentTopRight,
                        contentBottom: firstTicketData.contentBottom,
                        contentBottomRight: firstTicketData.contentBottomRight,
                        contentBottomRightSub: firstTicketData.contentBottomRightSub,
                        code: ticketCode
                    });
                }
            }
            return newTickets;
        });
    }, [drawStartNumber, drawTotalTickets, drawAutoIncrement, stickerType, isLoaded]);

    // Lắng nghe event từ FloatingFormatToolbar khi người dùng điều chỉnh size chữ
    // qua popup (bôi đen text → nhấn +/−). Cập nhật React state tương ứng để
    // ticket #2-#4 (dùng style từ state) cũng thay đổi size đồng bộ.
    const setFieldSize = useCallback((field: StickerFieldName, size: number) => {
        const setters: Record<StickerFieldName, (value: number) => void> = {
            header: setHeaderTextSize,
            subHeader: setSubHeaderTextSize,
            percent: setPercentTextSize,
            oldPrice: setOldPriceTextSize,
            name: setNameTextSize,
            newPrice: setNewPriceTextSize,
            footer: setFooterTextSize,
            drawTitle: setDrawTitleSize,
            drawContentTopLeft: setDrawContentTopLeftSize,
            drawContentTopRight: setDrawContentTopRightSize,
            drawContentBottomLeft: setDrawContentBottomLeftSize,
            drawContentBottomRight: setDrawContentBottomRightSize,
            drawContentBottomRightSub: setDrawContentBottomRightSubSize,
            drawCode: setDrawCodeSize,
            drawFooter: setDrawFooterSize,
        };
        setters[field](size);
    }, []);

    // Thanh định dạng đổi cỡ của cả ô: lưu vào trạng thái để bản in và lần mở sau cũng nhận
    useEffect(() => {
        const handler = (e: Event) => {
            const { field, size } = (e as CustomEvent<FieldSizeChange>).detail;
            setFieldSize(field, size);
        };
        document.addEventListener(FIELD_SIZE_EVENT, handler);
        return () => document.removeEventListener(FIELD_SIZE_EVENT, handler);
    }, [setFieldSize]);

    /** Đưa mọi ô của chế độ đang mở về cỡ chữ và khoảng dòng mặc định, giữ nguyên nội dung. */
    const resetAllFontSizes = useCallback(() => {
        // Ô đang sửa không nhận nội dung từ trạng thái, phải rời ô trước
        (document.activeElement as HTMLElement | null)?.blur?.();
        window.getSelection()?.removeAllRanges();

        if (stickerType === 'draw') {
            DRAW_FIELDS.forEach((field) => setFieldSize(field, DEFAULT_FIELD_SIZES[field]));
            const htmlFields: [keyof TicketDrawData, StickerFieldName][] = [
                ['title', 'drawTitle'],
                ['contentTop', 'drawContentTopLeft'],
                ['contentTopRight', 'drawContentTopRight'],
                ['contentBottom', 'drawContentBottomLeft'],
                ['contentBottomRight', 'drawContentBottomRight'],
                ['contentBottomRightSub', 'drawContentBottomRightSub'],
                ['footer', 'drawFooter'],
            ];
            // Hàng nghìn phiếu dùng chung một nội dung nên chỉ xử lý mỗi nội dung một lần
            const cache = new Map<string, string>();
            const resetOnce = (html: string, field: StickerFieldName): string => {
                const key = `${field}|${html}`;
                let result = cache.get(key);
                if (result === undefined) {
                    result = resetFieldHtml(html, field);
                    cache.set(key, result);
                }
                return result;
            };
            setDrawTickets((prev) => prev.map((ticket) => {
                const next = { ...ticket };
                for (const [key, field] of htmlFields) {
                    const html = ticket[key];
                    if (typeof html === 'string') (next as Record<string, unknown>)[key] = resetOnce(html, field);
                }
                return next;
            }));
        } else {
            TEM_FIELDS.forEach((field) => setFieldSize(field, DEFAULT_FIELD_SIZES[field]));
            document.querySelectorAll<HTMLElement>('#print-section [contenteditable="true"]').forEach((el) => {
                resetFieldFormatting(el, detectFieldName(el));
            });
        }
        toast.success('Đã khôi phục cỡ chữ mặc định');
    }, [stickerType, setFieldSize]);

    useEffect(() => {
        const match = previewName.match(/(?:IMEI|CODE):\s*([A-Za-z0-9]+)/i);
        if (match) {
            setBarcodeImei(match[1]);
        } else {
            const fallbackMatch = previewName.match(/\(([A-Za-z0-9]+)\)/);
            if (fallbackMatch) {
                setBarcodeImei(fallbackMatch[1]);
            }
        }
    }, [previewName]);

    useEffect(() => {
        if (!activeQueuePageId) return;
        const activePage = manualPages.find(p => p.id === activeQueuePageId);
        if (activePage) {
            const { newPrice } = resolvePagePrices(activePage, priceSource);
            setPreviewNewPrice(newPrice);
        }
    }, [priceSource, activeQueuePageId, manualPages]);

    // Helper to switch and apply sub tab correctly without cross-tab leak
    const applySubTab = useCallback((requested: string) => {
        // Tab đã tắt trong bảng bật tắt tab (bấm 7 lần vào logo) thì mở tab còn bật
        const sub = resolveVisibleSub(requested, getHiddenTabs());
        if (sub !== requested) writeSubQueryParam(sub);
        if (STICKER_SUBS.includes(sub)) {
            try { localStorage.setItem(STICKER_LAST_SUB_KEY, sub); } catch { /* chế độ riêng tư */ }
        }
        if (sub === 'gia-soc' || sub === 'sticker') {
            setStickerMode(sub === 'sticker' ? 'tag' : 'sticker');
            setStickerType('gia_soc');
            setBgImage(prev => isValidBgImageForType('gia_soc', prev) ? prev : GIA_SOC_DEFAULT_BG);
            setHeaderTextContent(prev => (prev && !prev.includes('TỪ 00/00')) ? prev : 'QUẠT ĐIỀU HOÀ');
            setActiveField('header');
        } else if (sub === 'gio-vang') {
            setStickerMode('sticker');
            setStickerType('gio_vang');
            setBgImage(GIO_VANG_DEFAULT_BG);
            setHeaderTextContent(prev => (prev && prev.includes('ĐẾN')) ? prev : 'TỪ 00/00 ĐẾN 00/00');
            setSubHeaderTextContent(prev => (prev && prev.includes('SUẤT')) ? prev : '5 SUẤT/NGÀY');
            setActiveField('header');
        } else if (sub === 'draw') {
            setStickerMode('sticker');
            setStickerType('draw');
            setBgImage(prev => isValidBgImageForType('draw', prev) ? prev : DRAW_DMX_DEFAULT_BG);
            setActiveField('drawContentBottomLeft');
        } else if (sub === 'event') {
            setStickerMode('event');
            setEventEverOpened(true);
        }
    }, []);

    // Helper to update sub tab in URL
    const updateSubQueryParam = (sub: string) => writeSubQueryParam(resolveVisibleSub(sub, getHiddenTabs()));

    // Preload StickerEventApp; read initial sub tab from URL
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        let sub = urlParams.get('sub');
        if (!sub) {
            // URL không ghi tab con (mở app từ màn hình chính luôn vào "/") → về tab con lần trước.
            sub = readLastStickerSub();
            updateSubQueryParam(sub);
        }
        applySubTab(sub);
    }, [applySubTab]);

    // Lắng nghe popstate (Back/Forward trình duyệt) để đổi tab đồng bộ
    useEffect(() => {
        const handlePopState = () => {
            const urlParams = new URLSearchParams(window.location.search);
            const sub = urlParams.get('sub') || 'draw';
            applySubTab(sub);
        };
        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, [applySubTab]);

    // Load settings, saved lists, and print history purely from IndexedDB
    useEffect(() => {
        let active = true;
        async function loadAllData() {
            try {
                const savedState = await getSetting<any>(STICKER_DB_KEY);
                
                if (savedState && active) {
                    const urlParams = new URLSearchParams(window.location.search);
                    const currentSub = urlParams.get('sub');
                    
                    let effectiveType: StickerType = 'draw';
                    if (!currentSub) {
                        setStickerMode('sticker');
                        setStickerType('draw');
                        effectiveType = 'draw';
                    } else if (currentSub === 'gia-soc' || currentSub === 'sticker') {
                        setStickerMode(currentSub === 'sticker' ? 'tag' : 'sticker');
                        setStickerType('gia_soc');
                        effectiveType = 'gia_soc';
                    } else if (currentSub === 'gio-vang') {
                        setStickerMode('sticker');
                        setStickerType('gio_vang');
                        effectiveType = 'gio_vang';
                    } else if (currentSub === 'draw') {
                        setStickerMode('sticker');
                        setStickerType('draw');
                        effectiveType = 'draw';
                    } else if (currentSub === 'event') {
                        setStickerMode('event');
                        setEventEverOpened(true);
                    }

                    // STRICT BG IMAGE BINDING: Chỉ khôi phục bgImage nếu nó thuộc đúng loại tem hiện tại
                    const targetBg = isValidBgImageForType(effectiveType, savedState.bgImage)
                        ? savedState.bgImage
                        : getDefaultBgImageForType(effectiveType);
                    setBgImage(targetBg);

                    // Khôi phục headerTextContent có ngữ cảnh loại tem
                    if (savedState.headerTextContent) {
                        if (effectiveType === 'gio_vang') {
                            if (savedState.headerTextContent.includes('ĐẾN') || savedState.headerTextContent.includes('/')) {
                                setHeaderTextContent(savedState.headerTextContent);
                            } else {
                                setHeaderTextContent(getDefaultHeaderForType('gio_vang'));
                            }
                        } else if (effectiveType === 'gia_soc') {
                            if (savedState.headerTextContent.includes('TỪ 00/00') || savedState.headerTextContent.includes('SUẤT/')) {
                                setHeaderTextContent(getDefaultHeaderForType('gia_soc'));
                            } else {
                                setHeaderTextContent(savedState.headerTextContent);
                            }
                        } else {
                            setHeaderTextContent(savedState.headerTextContent);
                        }
                    } else {
                        setHeaderTextContent(getDefaultHeaderForType(effectiveType));
                    }

                    if (effectiveType === 'gio_vang') {
                        if (savedState.subHeaderTextContent && savedState.subHeaderTextContent.includes('SUẤT')) {
                            setSubHeaderTextContent(savedState.subHeaderTextContent);
                        } else {
                            setSubHeaderTextContent(getDefaultSubHeaderForType('gio_vang'));
                        }
                    } else if (savedState.subHeaderTextContent) {
                        setSubHeaderTextContent(savedState.subHeaderTextContent);
                    }

                    setActiveField(getDefaultActiveFieldForType(effectiveType));

                    if (savedState.footerTextContent) setFooterTextContent(savedState.footerTextContent);
                    if (savedState.previewName) setPreviewName(savedState.previewName);
                    if (savedState.previewOldPrice) setPreviewOldPrice(savedState.previewOldPrice);
                    
                    if (savedState.previewNewPrice) {
                        const digits = String(savedState.previewNewPrice).replace(/\D/g, '');
                        if (digits) {
                            let val = Number(digits);
                            if (val >= 100000) {
                                val = Math.floor(val / 1000);
                            }
                            setPreviewNewPrice(val.toLocaleString('vi-VN'));
                        } else {
                            setPreviewNewPrice(savedState.previewNewPrice);
                        }
                    }
                    
                    if (savedState.discountDisplayMode) setDiscountDisplayMode(savedState.discountDisplayMode);
                    if (savedState.barcodeImei) setBarcodeImei(savedState.barcodeImei);
                    if (savedState.discountThreshold != null) setDiscountThreshold(savedState.discountThreshold);
                    if (savedState.searchTerm != null) setSearchTerm(savedState.searchTerm);
                    
                    // Bản trước cho bấm Thêm ở Phiếu nên có thể còn trang phiếu lẫn trong danh sách tem
                    const loadedPages = (savedState.manualPages || []).filter((page: StickerPage) => !page.html?.includes('draw-page')).map((page: StickerPage) => {
                        if (page.newPrice) {
                            const digits = String(page.newPrice).replace(/\D/g, '');
                            if (digits) {
                                let val = Number(digits);
                                if (val >= 100000) {
                                    val = Math.floor(val / 1000);
                                    return { ...page, newPrice: val.toLocaleString('vi-VN') };
                                }
                            }
                        }
                        return page;
                    });
                    
                    const loadedItems = (savedState.batchItems || []).map((item: BatchItem) => {
                        if (item.newPrice) {
                            const digits = String(item.newPrice).replace(/\D/g, '');
                            if (digits) {
                                let val = Number(digits);
                                if (val >= 100000) {
                                    val = Math.floor(val / 1000);
                                    return { ...item, newPrice: val.toLocaleString('vi-VN') };
                                }
                            }
                        }
                        return item;
                    });
                    
                    if (loadedPages.length === 0 && loadedItems.length === 0) {
                        setActiveSubTab('data');
                    } else if (savedState.activeSubTab) {
                        setActiveSubTab(savedState.activeSubTab === 'help' ? 'data' : savedState.activeSubTab);
                    }
                    setManualPages(loadedPages);
                    setBatchItems(loadedItems);
                    if (savedState.priceSource) setPriceSource(savedState.priceSource);
                    
                    if (savedState.headerTextSize != null) setHeaderTextSize(savedState.headerTextSize);
                    if (savedState.subHeaderTextSize != null) setSubHeaderTextSize(savedState.subHeaderTextSize);
                    if (savedState.percentTextSize != null) setPercentTextSize(savedState.percentTextSize);
                    if (savedState.oldPriceTextSize != null) setOldPriceTextSize(savedState.oldPriceTextSize);
                    if (savedState.nameTextSize != null) setNameTextSize(savedState.nameTextSize);
                    if (savedState.newPriceTextSize != null) setNewPriceTextSize(savedState.newPriceTextSize);
                    if (savedState.footerTextSize != null) setFooterTextSize(savedState.footerTextSize);

                    if (savedState.drawTickets && Array.isArray(savedState.drawTickets) && savedState.drawTickets.length > 0) {
                        // Tự động nâng cấp CHỈ KHI dữ liệu cũ là mẫu thử nghiệm 12/9 của bản sơ khai
                        const isOldSample12_9 = savedState.drawTickets[0]?.title?.includes('12/9') ||
                                                savedState.drawTickets[0]?.contentTop?.includes('420 SUẤT');
                        if (isOldSample12_9) {
                            setDrawTickets([
                                { ...DEFAULT_DRAW_TICKET_TEMPLATE, id: '1', code: '1' },
                                { ...DEFAULT_DRAW_TICKET_TEMPLATE, id: '2', code: '2' },
                                { ...DEFAULT_DRAW_TICKET_TEMPLATE, id: '3', code: '3' },
                                { ...DEFAULT_DRAW_TICKET_TEMPLATE, id: '4', code: '4' },
                            ]);
                            setDrawContentTopLeftSize(4.5);
                            setDrawContentTopRightSize(8);
                            setDrawContentBottomLeftSize(2.9);
                            setDrawContentBottomRightSize(7.6);
                            setDrawContentBottomRightSubSize(3.0);
                            setDrawTitleSize(4.3);
                        } else {
                            // Giữ nguyên 100% dữ liệu phiếu đã lưu của người dùng
                            setDrawTickets(savedState.drawTickets);
                            if (savedState.drawContentTopLeftSize != null) setDrawContentTopLeftSize(savedState.drawContentTopLeftSize);
                            if (savedState.drawContentTopRightSize != null) setDrawContentTopRightSize(savedState.drawContentTopRightSize);
                            if (savedState.drawContentBottomLeftSize != null) setDrawContentBottomLeftSize(savedState.drawContentBottomLeftSize);
                            if (savedState.drawContentBottomRightSize != null) setDrawContentBottomRightSize(savedState.drawContentBottomRightSize);
                            if (savedState.drawContentBottomRightSubSize != null) setDrawContentBottomRightSubSize(savedState.drawContentBottomRightSubSize);
                            if (savedState.drawTitleSize != null) setDrawTitleSize(savedState.drawTitleSize);
                        }
                    }
                    if (savedState.drawStartNumber != null) setDrawStartNumber(savedState.drawStartNumber);
                    if (savedState.drawTotalTickets != null) {
                        // Nâng cấp CHỈ dữ liệu đời cũ (mặc định cũ là 4 phiếu, nay 4000) — dữ liệu lưu từ 2026-10-29 mang dấu
                        // `drawTotalTicketsV` nên người dùng cố ý đặt 4 phiếu (1 trang A4) không bị đổi thành 4000 mỗi lần mở lại.
                        const laDuLieuCu = savedState.drawTotalTicketsV == null;
                        setDrawTotalTickets(laDuLieuCu && savedState.drawTotalTickets === 4 ? 4000 : savedState.drawTotalTickets);
                    } else {
                        setDrawTotalTickets(4000);
                    }
                    if (savedState.drawAutoIncrement != null) {
                        setDrawAutoIncrement(Boolean(savedState.drawAutoIncrement));
                    } else {
                        setDrawAutoIncrement(true);
                    }
                    if (savedState.drawCodeSize != null) setDrawCodeSize(savedState.drawCodeSize);
                    if (savedState.drawFooterSize != null) setDrawFooterSize(savedState.drawFooterSize);
                }

                const savedListsData = await getSetting<SavedStickerList[]>(STICKER_SAVED_LISTS_KEY);
                if (savedListsData && active) {
                    setSavedLists(savedListsData);
                }

                const printHistoryData = await getSetting<PrintHistoryEntry[]>(STICKER_HISTORY_KEY);
                if (printHistoryData && active) {
                    setPrintHistory(printHistoryData);
                }
            } catch (err) {
                console.error("Error loading sticker data:", err);
            } finally {
                if (active) {
                    setIsLoaded(true);
                }
            }
        }
        loadAllData();
        return () => {
            active = false;
        };
    }, []);

    // Sync savedLists từ cloud sync — đánh dấu lần cập nhật này KHÔNG phải do
    // người dùng gõ, để effect "Sync savedLists to IndexedDB" bên dưới bỏ qua
    // đúng 1 lần, tránh ghi lại y hệt dữ liệu vừa đọc từ storage (xem giải
    // thích vòng lặp ở skipNextSavedListsSaveRef).
    useEffect(() => {
        const handleDbChange = (event: Event) => {
            const detailKey = (event as CustomEvent<{ key?: string; source?: string }>).detail?.key;
            if (detailKey === STICKER_SAVED_LISTS_KEY) {
                getSetting<SavedStickerList[]>(STICKER_SAVED_LISTS_KEY).then(data => {
                    if (data) {
                        skipNextSavedListsSaveRef.current = true;
                        setSavedLists(data);
                    }
                });
            } else if (detailKey === STICKER_HISTORY_KEY) {
                getSetting<PrintHistoryEntry[]>(STICKER_HISTORY_KEY).then(data => {
                    if (data) {
                        setPrintHistory(data);
                    }
                });
            } else if (detailKey === STICKER_DB_KEY) {
                getSetting<any>(STICKER_DB_KEY).then(savedState => {
                    if (savedState) {
                        if (Array.isArray(savedState.drawTickets) && savedState.drawTickets.length > 0) {
                            setDrawTickets(savedState.drawTickets);
                        }
                        if (savedState.drawStartNumber != null) setDrawStartNumber(savedState.drawStartNumber);
                        if (savedState.drawTotalTickets != null) setDrawTotalTickets(savedState.drawTotalTickets);
                        if (savedState.drawAutoIncrement != null) {
                            setDrawAutoIncrement(Boolean(savedState.drawAutoIncrement));
                        } else {
                            setDrawAutoIncrement(true);
                        }
                    }
                });
            }
        };
        window.addEventListener('indexeddb-change', handleDbChange);
        return () => window.removeEventListener('indexeddb-change', handleDbChange);
    }, []);

    // Save state to IndexedDB (debounced)
    useEffect(() => {
        if (!isLoaded) return;
        const timer = setTimeout(async () => {
            const dataToSave = {
                stickerMode,
                stickerType,
                bgImage,
                headerTextContent,
                subHeaderTextContent,
                footerTextContent,
                previewName,
                previewOldPrice,
                previewNewPrice,
                discountDisplayMode,
                headerTextSize,
                subHeaderTextSize,
                percentTextSize,
                oldPriceTextSize,
                nameTextSize,
                newPriceTextSize,
                footerTextSize,
                barcodeImei,
                discountThreshold,
                searchTerm,
                activeQueuePageId,
                activeSubTab,
                manualPages,
                batchItems,
                priceSource,
                drawTickets,
                drawStartNumber,
                drawTotalTickets,
                drawTotalTicketsV: 2,
                drawAutoIncrement,
                drawContentTopLeftSize,
                drawContentTopRightSize,
                drawContentBottomLeftSize,
                drawContentBottomRightSize,
                drawContentBottomRightSubSize,
                drawTitleSize,
                drawCodeSize,
                drawFooterSize,
                updatedAt: new Date().toISOString()
            };
            
            try {
                await saveSetting(STICKER_DB_KEY, dataToSave);
            } catch (e) {
                console.error("IndexedDB save failed", e);
            }
        }, 500);

        // Emergency immediate save on tab unload or hide
        const handleFlushSave = () => {
            const dataToSave = {
                stickerMode,
                stickerType,
                bgImage,
                headerTextContent,
                subHeaderTextContent,
                footerTextContent,
                previewName,
                previewOldPrice,
                previewNewPrice,
                discountDisplayMode,
                headerTextSize,
                subHeaderTextSize,
                percentTextSize,
                oldPriceTextSize,
                nameTextSize,
                newPriceTextSize,
                footerTextSize,
                barcodeImei,
                discountThreshold,
                searchTerm,
                activeQueuePageId,
                activeSubTab,
                manualPages,
                batchItems,
                priceSource,
                drawTickets,
                drawStartNumber,
                drawTotalTickets,
                drawTotalTicketsV: 2,
                drawAutoIncrement,
                drawContentTopLeftSize,
                drawContentTopRightSize,
                drawContentBottomLeftSize,
                drawContentBottomRightSize,
                drawContentBottomRightSubSize,
                drawTitleSize,
                drawCodeSize,
                drawFooterSize,
                updatedAt: new Date().toISOString()
            };
            saveSetting(STICKER_DB_KEY, dataToSave).catch(e => console.error("Flush save failed", e));
        };

        const handleVisibility = () => {
            if (document.visibilityState === 'hidden') {
                handleFlushSave();
            }
        };

        window.addEventListener('beforeunload', handleFlushSave);
        window.addEventListener('visibilitychange', handleVisibility);

        return () => {
            clearTimeout(timer);
            window.removeEventListener('beforeunload', handleFlushSave);
            window.removeEventListener('visibilitychange', handleVisibility);
        };
    }, [
        isLoaded, stickerMode, stickerType, bgImage, headerTextContent, subHeaderTextContent,
        footerTextContent, previewName, previewOldPrice, previewNewPrice,
        headerTextSize, subHeaderTextSize, percentTextSize, oldPriceTextSize, nameTextSize,
        newPriceTextSize, footerTextSize, discountDisplayMode, barcodeImei, discountThreshold,
        searchTerm, activeQueuePageId, activeSubTab, manualPages, batchItems, priceSource,
        drawTickets, drawStartNumber, drawTotalTickets, drawAutoIncrement, drawContentTopLeftSize,
        drawContentTopRightSize, drawContentBottomLeftSize, drawContentBottomRightSize,
        drawContentBottomRightSubSize, drawTitleSize, drawCodeSize, drawFooterSize
    ]);

    // Sync savedLists to IndexedDB — bỏ qua nếu thay đổi này vừa đến từ chính
    // storage (xem handleDbChange ở trên). Nếu không bỏ qua: đọc từ cloud →
    // setSavedLists → effect này ghi lại y hệt dữ liệu đó → bắn lại
    // 'ycx-setting-changed' → useCloudSync.ts (hooks/) coi là sửa đổi mới của
    // user → đồng bộ lên Firestore lần nữa → cloud "mới hơn" → quay lại đầu →
    // vòng lặp vô hạn ghi/đọc mỗi ~2.5s (đã xác nhận bằng log thật 2026-07-18).
    useEffect(() => {
        if (!isLoaded) return;
        if (skipNextSavedListsSaveRef.current) {
            skipNextSavedListsSaveRef.current = false;
            return;
        }
        const timer = setTimeout(async () => {
            try {
                await saveSetting(STICKER_SAVED_LISTS_KEY, savedLists);
            } catch (e) {
                console.error("IndexedDB save savedLists failed", e);
            }
        }, 500);
        return () => clearTimeout(timer);
    }, [isLoaded, savedLists]);

    // Sync printHistory to IndexedDB
    useEffect(() => {
        if (!isLoaded) return;
        const timer = setTimeout(async () => {
            try {
                await saveSetting(STICKER_HISTORY_KEY, printHistory);
            } catch (e) {
                console.error("IndexedDB save printHistory failed", e);
            }
        }, 500);
        return () => clearTimeout(timer);
    }, [isLoaded, printHistory]);

    const handleDiscountThresholdChange = (val: string) => {
        setDiscountThreshold(val);
        const cleanInput = val.replace(/[^0-9]/g, '');
        const limit = parseInt(cleanInput, 10);
        
        if (isNaN(limit)) {
            setManualPages(prev => prev.map(p => ({ ...p, selected: true })));
            setBatchItems(prev => prev.map(i => ({ ...i, selected: true })));
        } else {
            setManualPages(prev => prev.map(p => {
                const pct = parsePercentValue(p.percent);
                return { ...p, selected: pct >= limit };
            }));
            setBatchItems(prev => prev.map(i => {
                const pct = parsePercentValue(i.percent);
                return { ...i, selected: pct >= limit };
            }));
        }
    };

    const downloadTemplate = () => downloadStickerTemplate(stickerType);

    const loadPageToEditor = (page: StickerPage) => {
        if (page.label) setPreviewName(page.label);
        // Sticker không có giá cũ thì ô giá cũ phải trống, không giữ giá của sticker đang mở trước đó
        setPreviewOldPrice(page.oldPrice || '');
        // Mã vạch luôn hiện, nên sticker không có mã thì không được giữ mã của sticker đang mở trước đó
        setBarcodeImei(page.code || '');
        if (page.header != null) setHeaderTextContent(page.header);
        if (page.footer != null) setFooterTextContent(page.footer);
        if (page.subHeader != null) setSubHeaderTextContent(page.subHeader);

        const { newPrice } = resolvePagePrices(page, priceSource);
        setPreviewNewPrice(newPrice);

        if (!page.label && page.html) {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = page.html;
            const sticker = tempDiv.querySelector('.sticker-container') as HTMLElement;
            if (sticker) {
                const headerText = sticker.querySelector('.header-text')?.textContent || headerTextContent;
                const nameText = sticker.querySelector('.name')?.textContent || '';
                const oldPriceText = sticker.querySelector('.old')?.textContent || '';
                const newPriceText = sticker.querySelector('.extra2 span')?.textContent || sticker.querySelector('.extra2')?.textContent || '';
                const footerText = sticker.querySelector('.footer-text')?.textContent || footerTextContent;
                const subHeader = sticker.querySelector('.sub-header')?.textContent || subHeaderTextContent;

                setHeaderTextContent(headerText);
                setSubHeaderTextContent(subHeader);
                setFooterTextContent(footerText);
                setPreviewOldPrice(oldPriceText);
                setPreviewNewPrice(newPriceText);

                const barcodeImg = sticker.querySelector('.barcode img');
                const barcodeVal = barcodeImg?.getAttribute('alt') || '';
                if (barcodeVal) {
                    setBarcodeImei(barcodeVal);
                }
                setPreviewName(nameText);
            }
        }
        setBatchItems([]);
    };

    /**
     * Nhập file mẫu (chọn được nhiều file). Ở tab Sticker còn nhận file bảng giá ERP của tab Event: mỗi sản phẩm trong file
     * thành một sticker, không phải tìm từng mã như tab Event.
     */
    const importTemplateFiles = async (files: File[]) => {
        const XLSX = await import('xlsx');
        const templatePages: StickerPage[] = [];
        const erpProducts: Product[] = [];
        let header = headerTextContent;
        let subHeader = subHeaderTextContent;
        let footer = footerTextContent;
        for (const file of files) {
            try {
                const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
                const ws = wb.Sheets[wb.SheetNames[0]];
                const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

                if (looksLikeErpPriceSheet(data)) {
                    if (stickerMode !== 'tag') {
                        toast.error(`${file.name} là file bảng giá ERP. Nhập ở tab Sticker để tạo sticker cho mọi sản phẩm.`);
                        continue;
                    }
                    const { products } = parseErpPriceRows(data);
                    if (products.length === 0) toast.error(`Không thấy sản phẩm nào trong ${file.name}`);
                    erpProducts.push(...products);
                    continue;
                }

                const parsed = parseTemplateExcelData(data, {
                    stickerType, bgImage, headerTextContent: header, subHeaderTextContent: subHeader, footerTextContent: footer, discountThreshold,
                });
                if (parsed.error) {
                    toast.error(files.length > 1 ? `${file.name}: ${parsed.error}` : parsed.error);
                    continue;
                }
                header = parsed.headerTextContent;
                subHeader = parsed.subHeaderTextContent;
                footer = parsed.footerTextContent;
                templatePages.push(...parsed.pages);
            } catch (err) {
                toast.error(files.length > 1 ? `Lỗi đọc file ${file.name}` : 'Lỗi đọc file Excel');
            }
        }

        if (header !== headerTextContent) setHeaderTextContent(header);
        if (subHeader !== subHeaderTextContent) setSubHeaderTextContent(subHeader);
        if (footer !== footerTextContent) setFooterTextContent(footer);

        const merged = erpProducts.length > 0
            ? mergeErpProductsIntoPages(manualPages, erpProducts, { header, subHeader, discountThreshold })
            : null;
        const firstNew = merged?.added[0] ?? templatePages[0];
        if (!merged && templatePages.length === 0) return;
        setManualPages([...(merged ? merged.pages : manualPages), ...templatePages]);
        setActiveSubTab('queue');
        // Không có sticker mới mà sticker đang mở vừa được cập nhật giá: mở lại để các ô sửa hiện giá mới
        const reopened = firstNew ?? merged?.pages.find(page => page.id === activeQueuePageId);
        if (reopened) selectQueuePage(reopened);

        if (templatePages.length > 0) toast.success(`Đã thêm ${templatePages.length} sticker vào hàng đợi in`);
        if (merged) {
            const parts = [
                merged.added.length > 0 ? `tạo ${merged.added.length} sticker` : '',
                merged.updated > 0 ? `cập nhật giá ${merged.updated} sticker đã có` : '',
            ].filter(Boolean);
            toast.success(`Bảng giá: ${parts.join(', ')}`);
        }
    };

    const handleTemplateUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files ?? []);
        e.target.value = '';
        if (files.length > 0) void importTemplateFiles(files);
    };

    const toggleItemSelection = (id: string) => {
        setBatchItems(prev => prev.map(it => it.id === id ? { ...it, selected: !it.selected } : it));
    };

    const toggleAllSelection = (select: boolean) => {
        setBatchItems(prev => prev.map(it => ({ ...it, selected: select })));
    };

    /** Mở một sticker trong danh sách lên khung xem trước để sửa. */
    const selectQueuePage = (page: StickerPage) => {
        setActiveQueuePageId(page.id);
        loadPageToEditor(page);
    };

    /** Thêm sticker đang hiện vào danh sách. Trả về false khi không thêm. */
    const addCurrentPage = (): boolean => {
        // Phiếu in theo số lượng, không có danh sách nên không có gì để thêm
        if (stickerType === 'draw') return false;
        let html = '';
        let label: string;
        let oldPrice: string;
        let newPrice: string;
        let percent: string;
        if (stickerMode === 'tag') {
            // Tab Sticker không có sticker Giá Sốc trên màn: lấy từ các ô sửa
            if (!previewName.trim() && !/\d/.test(previewOldPrice) && !/\d/.test(previewNewPrice)) {
                toast.error('Nhập tên sản phẩm hoặc giá trước khi thêm');
                return false;
            }
            label = previewName.trim() || 'Sticker';
            oldPrice = previewOldPrice;
            newPrice = previewNewPrice;
            percent = formatPriceChangePercent(oldPrice, newPrice);
        } else {
            const firstSticker = document.querySelector('#print-section .sticker-container') as HTMLElement | null;
            if (!firstSticker) return false;
            html = withoutScreenOnlyParts(firstSticker).outerHTML;
            label = firstSticker.querySelector('.name')?.textContent || 'Sticker';
            oldPrice = firstSticker.querySelector('.old')?.textContent || '';
            newPrice = firstSticker.querySelector('.extra2')?.textContent || '';
            percent = firstSticker.querySelector('.extra1')?.textContent || '';
        }
        const cleanInput = discountThreshold.replace(/[^0-9]/g, '');
        const limit = parseInt(cleanInput, 10);
        const isSelected = isNaN(limit) ? true : parsePercentValue(percent) >= limit;

        const page: StickerPage = {
            id: `page_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            html,
            label,
            oldPrice,
            newPrice,
            percent,
            timestamp: Date.now(),
            code: barcodeImei,
            selected: isSelected,
            quantity: editorQuantity,
            salePrice: newPrice,
            header: headerTextContent,
            footer: footerTextContent,
            subHeader: subHeaderTextContent,
        };
        setManualPages(prev => [...prev, page]);
        // Khung xem trước thành sticker mới để soạn tiếp: sửa tiếp không làm đổi sticker vừa thêm
        setActiveQueuePageId(null);
        setComposeQuantity(1);
        // Tab Sticker: các ô để trống cho sticker tiếp theo
        if (stickerMode === 'tag') {
            setPreviewName('');
            setBarcodeImei('');
            setPreviewOldPrice('');
            setPreviewNewPrice('');
            setFooterTextContent('');
        }
        const total = manualPages.length + 1;
        if (isSelected) {
            toast.success(`Đã thêm vào danh sách, hiện có ${total} sticker`);
        } else {
            toast.warning(`Đã thêm vào danh sách nhưng chưa chọn in vì % giảm thấp hơn mức lọc ${limit}%`);
        }
        return true;
    };

    // Sửa chữ trên bản xem trước khi đang mở một sticker của danh sách: ghi thẳng vào sticker đó, nếu không bản in vẫn ra nội dung cũ.
    // Chỉ các hàm edit* này nhận thao tác của người dùng, còn khi mở sticker thì gọi set* trực tiếp nên không ghi ngược lại.
    const patchActivePage = (patch: (page: StickerPage) => Partial<StickerPage>) => {
        if (!activeQueuePageId) return;
        setManualPages(prev => prev.map(page => (page.id === activeQueuePageId ? { ...page, ...patch(page) } : page)));
    };
    const editPreviewName = (value: string) => {
        setPreviewName(value);
        patchActivePage(() => ({ label: value }));
    };
    const editPreviewOldPrice = (value: string) => {
        setPreviewOldPrice(value);
        // Có giá giảm riêng thì % giảm mới được tính lại theo giá cũ vừa sửa
        patchActivePage(page => ({ oldPrice: value, salePrice: page.salePrice ?? page.newPrice }));
    };
    const editPreviewNewPrice = (value: string) => {
        setPreviewNewPrice(value);
        patchActivePage(() => (priceSource === 'service' ? { servicePrice: value } : { salePrice: value, newPrice: value }));
    };
    const editHeaderText = (value: string) => {
        setHeaderTextContent(value);
        patchActivePage(() => ({ header: value }));
    };
    const editSubHeaderText = (value: string) => {
        setSubHeaderTextContent(value);
        patchActivePage(() => ({ subHeader: value }));
    };
    const editFooterText = (value: string) => {
        setFooterTextContent(value);
        patchActivePage(() => ({ footer: value }));
    };
    const editBarcode = (value: string) => {
        setBarcodeImei(value);
        patchActivePage(() => ({ code: value }));
    };

    /** Đổi số bản in của một sticker trong danh sách. */
    const setPageQuantity = (id: string, quantity: number) => {
        const next = normalizeTagQuantity(quantity);
        setManualPages(prev => prev.map(page => (page.id === id ? { ...page, quantity: next } : page)));
    };
    /** Ô số lượng ở khung sửa: sticker đang mở thì đổi chính sticker đó, đang soạn mới thì nhớ cho lúc bấm Thêm. */
    const setEditorQuantity = (quantity: number) => {
        if (activeQueuePageId) setPageQuantity(activeQueuePageId, quantity);
        else setComposeQuantity(normalizeTagQuantity(quantity));
    };

    const removeManualPage = (id: string) => {
        setManualPages(prev => prev.filter(p => p.id !== id));
        if (activeQueuePageId === id) {
            setActiveQueuePageId(null);
        }
    };

    const clearManualPages = () => {
        setManualPages([]);
        setActiveQueuePageId(null);
    };

    const togglePageSelection = (id: string) => {
        setManualPages(prev => prev.map(p => p.id === id ? { ...p, selected: p.selected === false ? true : false } : p));
    };

    const toggleAllPagesSelection = (select: boolean) => {
        setManualPages(prev => prev.map(p => ({ ...p, selected: select })));
    };

    const saveCurrentList = () => {
        if (manualPages.length === 0) return;
        setIsSaveListModalOpen(true);
    };

    const handleSaveCurrentList = async (name: string) => {
        const list: SavedStickerList = {
            id: `list_${Date.now()}`,
            name,
            pages: manualPages,
            timestamp: Date.now(),
            stickerType,
            headerTextContent,
        };

        setSavedLists(prev => {
            const next = [list, ...prev].slice(0, 50);
            saveSetting(STICKER_SAVED_LISTS_KEY, next).catch(() => {});
            return next;
        });

        setIsSaveListModalOpen(false);
        toast.success(`Đã lưu danh sách "${name}" thành công!`);
    };

    const toggleShowSavedLists = useCallback(() => {
        setShowSavedLists(prev => !prev);
    }, []);

    const loadSavedList = (list: SavedStickerList) => {
        setManualPages(list.pages);
        if (list.stickerType) setStickerType(list.stickerType);
        if (list.headerTextContent) setHeaderTextContent(list.headerTextContent);
        setShowSavedLists(false);
        setActiveQueuePageId(null);
    };

    const deleteSavedList = (list: SavedStickerList) => {
        setSavedLists(prev => {
            const next = prev.filter(l => l.id !== list.id);
            saveSetting(STICKER_SAVED_LISTS_KEY, next).catch(() => {});
            return next;
        });
    };

    const restoreHistory = (entry: PrintHistoryEntry) => {
        setStickerType(entry.stickerType);
        setBgImage(entry.bgImage);
        setHeaderTextSize(entry.headerTextSize);
        if (entry.subHeaderTextSize != null) setSubHeaderTextSize(entry.subHeaderTextSize);
        if (entry.percentTextSize != null) setPercentTextSize(entry.percentTextSize);
        if (entry.oldPriceTextSize != null) setOldPriceTextSize(entry.oldPriceTextSize);
        if (entry.nameTextSize != null) setNameTextSize(entry.nameTextSize);
        if (entry.newPriceTextSize != null) setNewPriceTextSize(entry.newPriceTextSize);
        if (entry.footerTextSize != null) setFooterTextSize(entry.footerTextSize);
        setBatchItems(entry.batchItems);
        setHeaderTextContent(entry.headerTextContent);
        setSubHeaderTextContent(entry.subHeaderTextContent);
        setFooterTextContent(entry.footerTextContent);
        setManualPages(entry.manualPages || []);
        if (entry.discountDisplayMode) setDiscountDisplayMode(entry.discountDisplayMode);
        setShowHistory(false);
        setActiveQueuePageId(null);

        // Khôi phục theo từng loại sticker
        if (entry.stickerType === 'draw') {
            if (entry.drawTickets && entry.drawTickets.length > 0) {
                setDrawTickets(JSON.parse(JSON.stringify(entry.drawTickets)));
            } else if (entry.id === DEFAULT_HISTORY_ID) {
                setDrawTickets([
                    { ...DEFAULT_DRAW_TICKET_TEMPLATE, id: '1', code: '1' },
                    { ...DEFAULT_DRAW_TICKET_TEMPLATE, id: '2', code: '2' },
                    { ...DEFAULT_DRAW_TICKET_TEMPLATE, id: '3', code: '3' },
                    { ...DEFAULT_DRAW_TICKET_TEMPLATE, id: '4', code: '4' },
                ]);
            }
            if (entry.drawStartNumber != null) setDrawStartNumber(entry.drawStartNumber);
            if (entry.drawTotalTickets != null) setDrawTotalTickets(entry.drawTotalTickets);
            if (entry.drawAutoIncrement != null) {
                setDrawAutoIncrement(Boolean(entry.drawAutoIncrement));
            } else {
                setDrawAutoIncrement(true);
            }
            if (entry.drawContentTopLeftSize != null) setDrawContentTopLeftSize(entry.drawContentTopLeftSize);
            if (entry.drawContentTopRightSize != null) setDrawContentTopRightSize(entry.drawContentTopRightSize);
            if (entry.drawContentBottomLeftSize != null) setDrawContentBottomLeftSize(entry.drawContentBottomLeftSize);
            if (entry.drawContentBottomRightSize != null) setDrawContentBottomRightSize(entry.drawContentBottomRightSize);
            if (entry.drawContentBottomRightSubSize != null) setDrawContentBottomRightSubSize(entry.drawContentBottomRightSubSize);
            if (entry.drawTitleSize != null) setDrawTitleSize(entry.drawTitleSize);
            if (entry.drawCodeSize != null) setDrawCodeSize(entry.drawCodeSize);
            if (entry.drawFooterSize != null) setDrawFooterSize(entry.drawFooterSize);

            toast.success(`Đã khôi phục: ${entry.label}`);
        } else {
            setBatchItems(entry.batchItems || []);
            setManualPages(entry.manualPages || []);
            toast.success(`Đã khôi phục: ${entry.label}`);
        }
    };

    const deleteHistory = (id: string) => {
        // Không cho xoá entry mặc định
        if (id === DEFAULT_HISTORY_ID) return;
        setPrintHistory(prev => {
            const next = prev.filter(h => h.id !== id);
            saveSetting(STICKER_HISTORY_KEY, next).catch(() => {});
            return next;
        });
    };

    const handleReset = () => {
        setBatchItems([]);
        setSearchTerm('');
        setHeaderTextContent('HÀNG TRƯNG BÀY');
        setFooterTextContent('Khuyến mãi áp dụng đến hết ngày 3/5/2026');
        setHeaderTextSize(8);
        setActiveQueuePageId(null);
        // Khi reset ở chế độ draw, khôi phục phiếu mẫu mặc định
        if (stickerType === 'draw') {
            setDrawTickets([
                { ...DEFAULT_DRAW_TICKET_TEMPLATE, id: '1', code: '1' },
                { ...DEFAULT_DRAW_TICKET_TEMPLATE, id: '2', code: '2' },
                { ...DEFAULT_DRAW_TICKET_TEMPLATE, id: '3', code: '3' },
                { ...DEFAULT_DRAW_TICKET_TEMPLATE, id: '4', code: '4' },
            ]);
            setDrawStartNumber(1);
            setDrawTotalTickets(4000);
            setDrawAutoIncrement(true);
            setDrawContentTopLeftSize(4.5);
            setDrawContentTopRightSize(8);
            setDrawContentBottomLeftSize(2.9);
            setDrawContentBottomRightSize(7.6);
            setDrawContentBottomRightSubSize(3.0);
            setDrawTitleSize(4.3);
            setDrawCodeSize(3.8);
            setDrawFooterSize(3.8);
        }
    };

    // Sticker có mã thì luôn in mã: mã vạch ở Giá Sốc và Giờ Vàng, mã QR ở tab Sticker
    /** Một dòng của file giá thành sticker, theo đầu và chân đang dùng. */
    const batchItemToPage = useCallback((item: BatchItem): StickerPage => ({
        id: item.id,
        html: '',
        label: item.name,
        oldPrice: item.oldPrice,
        newPrice: item.newPrice,
        percent: item.percent,
        timestamp: Date.now(),
        code: item.imei,
        header: headerTextContent,
        subHeader: subHeaderTextContent,
        footer: footerTextContent,
    }), [headerTextContent, subHeaderTextContent, footerTextContent]);

    /** Sticker đang hiện trên khung xem trước (đang soạn, hoặc sticker của danh sách đang mở). */
    const editorPage = useMemo((): StickerPage => ({
        id: activeQueuePageId ?? 'preview',
        html: '',
        label: previewName,
        oldPrice: previewOldPrice,
        newPrice: previewNewPrice,
        percent: '',
        timestamp: 0,
        code: barcodeImei,
        header: headerTextContent,
        subHeader: subHeaderTextContent,
        footer: footerTextContent,
        quantity: editorQuantity,
    }), [activeQueuePageId, previewName, previewOldPrice, previewNewPrice, barcodeImei, headerTextContent, subHeaderTextContent, footerTextContent, editorQuantity]);

    // Tab Sticker: khung xem trước hiện tem của sticker đang soạn, hoặc tối đa 20 dòng đang chọn của file giá như Giá Sốc
    // Sticker đang soạn còn ô trống thì hiện khung xương mờ: ô trống lấy nội dung mẫu, tagPreviewGhost để biết phần nào là mẫu
    const { tagPreviewProducts, tagPreviewGhost } = useMemo((): { tagPreviewProducts: Product[]; tagPreviewGhost?: Product[] } => {
        if (stickerMode !== 'tag') return { tagPreviewProducts: [] };
        if (batchItems.length > 0) {
            return { tagPreviewProducts: batchItems.filter(i => i.selected).slice(0, 20).map(item => stickerPageToTagProduct(batchItemToPage(item), priceSource)) };
        }
        const ghost = ghostTagPreview(editorPage, priceSource);
        return ghost
            ? { tagPreviewProducts: [ghost.product], tagPreviewGhost: [ghost.alternative] }
            : { tagPreviewProducts: [stickerPageToTagProduct(editorPage, priceSource)] };
    }, [stickerMode, batchItems, batchItemToPage, editorPage, priceSource]);

    const handlePrint = () => {
        if (stickerType === 'draw') {
            const totalPages = Math.ceil((drawTickets?.length || 0) / 4);
            if (totalPages === 0) {
                toast.error("Không có phiếu rút thăm nào để in!");
                return;
            }

            const effectiveBg = resolveEffectiveBgImage(stickerType, bgImage);
            const hostStyle = `
                <style>
                    #print-host .header-text { font-size: ${headerTextSize}cqi !important; }
                    #print-host .sub-header { font-size: ${subHeaderTextSize}cqi !important; }
                    #print-host .extra1 { font-size: ${percentTextSize}cqi !important; }
                    #print-host .old { font-size: ${oldPriceTextSize}cqi !important; }
                    #print-host .name { font-size: ${nameTextSize}cqi !important; }
                    #print-host .extra2 { font-size: ${newPriceTextSize}cqi !important; }
                    #print-host .footer-text { font-size: ${footerTextSize}cqi !important; }
                    #print-host .sticker-container {
                        outline: none !important;
                    }
                    ${getStickerPreviewStyles({
                        stickerType,
                        bgImage: effectiveBg,
                        headerTextSize,
                        subHeaderTextSize,
                        percentTextSize,
                        oldPriceTextSize,
                        nameTextSize,
                        newPriceTextSize,
                        footerTextSize
                    })}
                </style>
            `;

            const drawTitleClean = drawTickets[0]?.title?.replace(/<[^>]*>/g, '').trim() || 'Phiếu Rút Thăm';
            const historyEntry: PrintHistoryEntry = {
                id: `history_${Date.now()}`,
                timestamp: Date.now(),
                label: drawTitleClean.length > 50 ? drawTitleClean.slice(0, 50) + '...' : drawTitleClean,
                pageCount: totalPages,
                stickerType,
                bgImage: effectiveBg,
                headerTextSize,
                subHeaderTextSize,
                percentTextSize,
                oldPriceTextSize,
                nameTextSize,
                newPriceTextSize,
                footerTextSize,
                batchItems: [],
                headerTextContent,
                subHeaderTextContent,
                footerTextContent,
                manualPages: [],
                discountDisplayMode,
                drawTickets: JSON.parse(JSON.stringify(drawTickets)),
                drawStartNumber,
                drawTotalTickets,
                drawAutoIncrement,
                drawContentTopLeftSize,
                drawContentTopRightSize,
                drawContentBottomLeftSize,
                drawContentBottomRightSize,
                drawContentBottomRightSubSize,
                drawTitleSize,
                drawCodeSize,
                drawFooterSize,
            };

            setPrintHistory(prev => {
                const dupIdx = prev.findIndex(entry => isHistoryDuplicate(entry, historyEntry));
                let next;
                if (dupIdx !== -1) {
                    const matched = { ...prev[dupIdx], ...historyEntry, timestamp: Date.now() };
                    const filtered = prev.filter((_, idx) => idx !== dupIdx);
                    next = [matched, ...filtered];
                } else {
                    next = [historyEntry, ...prev];
                }
                const sliced = next.slice(0, 30);
                saveSetting(STICKER_HISTORY_KEY, sliced).catch(() => {});
                return sliced;
            });

            // Lưu tức thì trạng thái phiếu vào IndexedDB và kích hoạt đồng bộ Firebase
            const stateToSave = {
                stickerMode,
                stickerType,
                bgImage,
                headerTextContent,
                subHeaderTextContent,
                footerTextContent,
                previewName,
                previewOldPrice,
                previewNewPrice,
                discountDisplayMode,
                headerTextSize,
                subHeaderTextSize,
                percentTextSize,
                oldPriceTextSize,
                nameTextSize,
                newPriceTextSize,
                footerTextSize,
                barcodeImei,
                discountThreshold,
                searchTerm,
                activeQueuePageId,
                activeSubTab,
                manualPages,
                batchItems,
                priceSource,
                drawTickets,
                drawStartNumber,
                drawTotalTickets,
                drawTotalTicketsV: 2,
                drawAutoIncrement,
                drawContentTopLeftSize,
                drawContentTopRightSize,
                drawContentBottomLeftSize,
                drawContentBottomRightSize,
                drawContentBottomRightSubSize,
                drawTitleSize,
                drawCodeSize,
                drawFooterSize,
                updatedAt: new Date().toISOString()
            };
            saveSetting(STICKER_DB_KEY, stateToSave).catch(() => {});

            openPrintPreview({
                title: drawTitleClean,
                paper: { kind: 'a4', landscape: false },
                // Lô lớn tốn vài giây: dựng sau khi màn chờ đã hiện. Preview chỉ render 1 trang nên in phải sinh lại đủ trang.
                buildHtml: () => {
                    const allPagesHtml = generateDrawPagesHtml({
                        drawTickets,
                        bgImage: effectiveBg,
                        drawTitleSize: drawTitleSize,
                        drawCodeSize: drawCodeSize,
                        drawFooterSize: drawFooterSize,
                        drawContentTopLeftSize: drawContentTopLeftSize,
                        drawContentTopRightSize: drawContentTopRightSize,
                        drawContentBottomLeftSize: drawContentBottomLeftSize,
                        drawContentBottomRightSize: drawContentBottomRightSize,
                        drawContentBottomRightSubSize: drawContentBottomRightSubSize,
                        isAutoIncrement: drawAutoIncrement,
                    });
                    return buildAppStyledDocument(`<div id="print-host">${hostStyle}${allPagesHtml}</div>`, drawTitleClean);
                },
            });

            return;
        }

        // Mỗi sticker in đúng số bản của nó; sticker đang soạn (danh sách trống) in theo ô số lượng
        const previewPageCount = batchItems.length > 0 ? batchItems.filter(i => i.selected).length : (manualPages.length === 0 ? editorQuantity : 0);
        const selectedManualPages = manualPages.filter(p => p.selected !== false);
        const totalPages = previewPageCount + selectedManualPages.reduce((sum, page) => sum + pageQuantity(page), 0);

        if (totalPages === 0) {
            toast.error("Không có trang nào để in!");
            return;
        }

        const effectiveBg = resolveEffectiveBgImage(stickerType, bgImage);
        const queueContext = { stickerType, headerTextContent, subHeaderTextContent, footerTextContent };
        const queuePage = (page: StickerPage): StickerPage => resolveQueuePage(page, queueContext);

        // Mỗi lần in tự lưu danh sách vào tab Lịch sử, tên tự đặt theo tên sản phẩm
        const recordHistory = () => {
            // Chỉ in sticker đang soạn (danh sách trống): lưu chính sticker đó vào lịch sử, mở lại là có đúng sticker đã in
            const savedPages = batchItems.length === 0 && manualPages.length === 0
                ? [{
                    ...editorPage,
                    id: `page_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                    timestamp: Date.now(),
                    percent: formatPriceChangePercent(editorPage.oldPrice, editorPage.newPrice),
                    salePrice: editorPage.newPrice,
                    selected: true,
                    quantity: editorQuantity,
                }]
                : manualPages;
            const historyEntry: PrintHistoryEntry = {
                id: `history_${Date.now()}`,
                timestamp: Date.now(),
                label: autoListName([...batchItems.filter(item => item.selected).map(item => item.name), ...savedPages.map(page => page.label)], headerTextContent),
                printedAs: stickerMode === 'tag' ? 'tag' : undefined,
                pageCount: totalPages,
                stickerType,
                bgImage: effectiveBg,
                headerTextSize,
                subHeaderTextSize,
                percentTextSize,
                oldPriceTextSize,
                nameTextSize,
                newPriceTextSize,
                footerTextSize,
                batchItems,
                headerTextContent,
                subHeaderTextContent,
                footerTextContent,
                manualPages: savedPages,
                discountDisplayMode,
            };
            setPrintHistory(prev => {
                // In lại đúng danh sách đã có trong Lịch sử: không lưu thêm, chỉ đưa mục cũ lên đầu (giữ tên cũ)
                const dupIdx = prev.findIndex(entry => isHistoryDuplicate(entry, historyEntry));
                let next;
                if (dupIdx !== -1) {
                    const matched = { ...prev[dupIdx], timestamp: Date.now(), printedAs: historyEntry.printedAs };
                    const filtered = prev.filter((_, idx) => idx !== dupIdx);
                    next = [matched, ...filtered];
                } else {
                    next = [historyEntry, ...prev];
                }
                const sliced = next.slice(0, 20);
                saveSetting(STICKER_HISTORY_KEY, sliced).catch(() => {});
                return sliced;
            });
        };

        // Tab Sticker: in đúng các sticker như tab Giá Sốc, nhưng ra tem giá theo kiểu và bố cục chọn trong hộp chọn bố cục
        if (stickerMode === 'tag') {
            const pages = [
                ...(batchItems.length > 0
                    ? batchItems.filter(i => i.selected).map(batchItemToPage)
                    : (manualPages.length === 0 ? [editorPage] : [])),
                ...selectedManualPages.map(page => resolveQueuePage(page, tagQueueContext(queueContext))),
            ];
            setTagPrint({ products: pages.map(page => stickerPageToTagProduct(page, priceSource)), onPrinted: recordHistory });
            return;
        }

        const hostStyle = `
                ${getStickerPreviewStyles({
                    stickerType,
                    bgImage: effectiveBg,
                    headerTextSize,
                    subHeaderTextSize,
                    percentTextSize,
                    oldPriceTextSize,
                    nameTextSize,
                    newPriceTextSize,
                    footerTextSize
                })}
                #print-host .header-text { font-size: ${headerTextSize}cqi !important; }
                #print-host .sub-header { font-size: ${subHeaderTextSize}cqi !important; }
                #print-host .extra1 { font-size: ${percentTextSize}cqi !important; }
                #print-host .old { font-size: ${oldPriceTextSize}cqi !important; }
                #print-host .name { font-size: ${nameTextSize}cqi !important; }
                #print-host .extra2 { font-size: ${newPriceTextSize}cqi !important; }
                #print-host .footer-text { font-size: ${footerTextSize}cqi !important; }
                #print-host .sticker-container {
                    outline: 1.5px dashed #6366f1;
                    outline-offset: 1px;
                }
        `;

        // Lấy nội dung ngay lúc bấm in (sticker đang soạn chép từ khung xem trước), rồi mới hỏi số sticker mỗi tờ
        const stickers: string[] = [];
        if (batchItems.length > 0) {
            batchItems.filter(i => i.selected).forEach(item => {
                stickers.push(generatePageHtml(batchItemToPage(item), priceSource, stickerType, effectiveBg, discountDisplayMode));
            });
        } else if (manualPages.length === 0) {
            const printSection = document.getElementById('print-section');
            if (printSection) {
                const html = withoutScreenOnlyParts(printSection).innerHTML;
                for (let copy = 0; copy < editorQuantity; copy++) stickers.push(html);
            }
        }
        selectedManualPages.forEach(page => {
            const html = generatePageHtml(queuePage(page), priceSource, stickerType, effectiveBg, discountDisplayMode);
            for (let copy = 0; copy < pageQuantity(page); copy++) stickers.push(html);
        });

        const printTitle = headerTextContent || 'Sticker';
        setSheetPrint({
            count: stickers.length,
            print: (perPage) => {
                recordHistory();
                const sheets = buildStickerSheets(stickers, perPage);
                openPrintPreview({
                    title: printTitle,
                    paper: { kind: 'a4', landscape: sheets.landscape },
                    note: perPage > 1 ? `${stickers.length} sticker, ${perPage} sticker / trang A4.` : undefined,
                    buildHtml: () => buildAppStyledDocument(
                        `<div id="print-host"><style>${hostStyle}${sheets.css}</style>${sheets.html}</div>`,
                        printTitle,
                    ),
                });
            },
        });
    };

    const [activeDrawPage, setActiveDrawPage] = useState(0);
    const totalDrawPages = useMemo(() => Math.ceil((drawTickets?.length || 0) / 4), [drawTickets?.length]);

    return {
        stickerMode, setStickerMode,
        eventEverOpened, setEventEverOpened,
        tagPrint,
        closeTagPrint: () => setTagPrint(null),
        sheetPrint,
        closeSheetPrint: () => setSheetPrint(null),
        stickersPerPage,
        chooseStickersPerPage,
        tagPreviewProducts,
        tagPreviewGhost,
        stickerType, setStickerType,
        bgImage, setBgImage,
        priceSource, setPriceSource,
        drawTickets, setDrawTickets,
        drawStartNumber, setDrawStartNumber,
        drawTotalTickets, setDrawTotalTickets,
        drawAutoIncrement, setDrawAutoIncrement,
        drawContentTopLeftSize, setDrawContentTopLeftSize,
        drawContentTopRightSize, setDrawContentTopRightSize,
        drawContentBottomLeftSize, setDrawContentBottomLeftSize,
        drawContentBottomRightSize, setDrawContentBottomRightSize,
        drawContentBottomRightSubSize, setDrawContentBottomRightSubSize,
        drawTitleSize, setDrawTitleSize,
        drawCodeSize, setDrawCodeSize,
        drawFooterSize, setDrawFooterSize,
        activeField, setActiveField,
        headerTextSize, setHeaderTextSize,
        subHeaderTextSize, setSubHeaderTextSize,
        percentTextSize, setPercentTextSize,
        oldPriceTextSize, setOldPriceTextSize,
        nameTextSize, setNameTextSize,
        newPriceTextSize, setNewPriceTextSize,
        footerTextSize, setFooterTextSize,
        discountDisplayMode, setDiscountDisplayMode,
        discountThreshold, setDiscountThreshold,
        activeQueuePageId, setActiveQueuePageId,
        activeSubTab, setActiveSubTab,
        batchItems, setBatchItems,
        headerTextContent, setHeaderTextContent,
        subHeaderTextContent, setSubHeaderTextContent,
        footerTextContent, setFooterTextContent,
        searchTerm, setSearchTerm,
        barcodeImei, setBarcodeImei,
        manualPages, setManualPages,
        printHistory, setPrintHistory,
        editorQuantity, setEditorQuantity, setPageQuantity, stickerPrintCount,
        showHistory, setShowHistory,
        savedLists, setSavedLists,
        showSavedLists, setShowSavedLists: toggleShowSavedLists,
        previewName, setPreviewName,
        previewOldPrice, setPreviewOldPrice,
        previewNewPrice, setPreviewNewPrice,
        isLoaded, setIsLoaded,
        isSaveListModalOpen, setIsSaveListModalOpen,
        activeDrawPage, setActiveDrawPage,
        totalDrawPages,
        updateBatchItem,
        updateSubQueryParam,
        applySubTab,
        handleDiscountThresholdChange,
        resetAllFontSizes,
        downloadTemplate,
        loadPageToEditor,
        handleTemplateUpload,
        toggleItemSelection,
        toggleAllSelection,
        addCurrentPage,
        selectQueuePage,
        editPreviewName,
        editPreviewOldPrice,
        editPreviewNewPrice,
        editHeaderText,
        editSubHeaderText,
        editFooterText,
        editBarcode,
        removeManualPage,
        clearManualPages,
        togglePageSelection,
        toggleAllPagesSelection,
        saveCurrentList,
        handleSaveCurrentList,
        loadSavedList,
        deleteSavedList,
        restoreHistory,
        deleteHistory,
        handleReset,
        handlePrint,
    };
}
