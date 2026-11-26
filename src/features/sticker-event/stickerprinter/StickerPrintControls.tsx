import React, { useState, useEffect, useMemo } from 'react';
import { AppIcon } from '../../../components/shared/ui/icon/AppIcon';
import { StickerPage, BatchItem, PrintHistoryEntry, SavedStickerList } from './types';
import { DEFAULT_HISTORY_ID, DEFAULT_DRAW_HISTORY_ENTRY } from '../hooks/useStickerPrinterData';
import { StickerManualQueue } from './StickerManualQueue';
import { searchKey } from './listSearch';
import { Button, Input, Tabs, EmptyState, SectionCard, Switch } from '../../../components/shared/ui';
import type { TabItem } from '../../../components/shared/ui';
import { Checkbox } from '../../../components/shared/ui/Checkbox';
import { cn } from '../../../components/shared/ui/utils';

interface StickerPrintControlsProps {
    manualPages: StickerPage[];
    batchItems: BatchItem[];
    searchTerm: string;
    setSearchTerm: (term: string) => void;
    printHistory: PrintHistoryEntry[];
    showHistory: boolean;
    setShowHistory: (show: boolean) => void;
    /** In sticker đang chọn; `all` thì in cả danh sách. */
    handlePrint: (options?: { all?: boolean }) => void;
    addCurrentPage: () => void;
    handleTemplateUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
    downloadTemplate: () => void;
    handleReset: () => void;
    toggleAllSelection: (select: boolean) => void;
    toggleItemSelection: (id: string) => void;
    clearBatchItems: () => void;
    restoreHistory: (entry: PrintHistoryEntry) => void;
    deleteHistory: (id: string) => void;
    discountDisplayMode: 'percent' | 'amount';
    setDiscountDisplayMode: (mode: 'percent' | 'amount') => void;
    savedLists: SavedStickerList[];
    showSavedLists: boolean;
    setShowSavedLists: (show: boolean) => void;
    saveCurrentList: () => void;
    clearManualPages: () => void;
    loadPageToEditor: (page: StickerPage) => void;
    removeManualPage: (id: string) => void;
    /** Đổi số bản in của một sticker trong danh sách. */
    setPageQuantity: (id: string, quantity: number) => void;
    /** Tổng số bản sẽ in (mỗi sticker nhân số bản của nó). */
    stickerPrintCount: number;
    /** Số bản khi In tất cả (kể cả sticker bỏ chọn). */
    stickerPrintAllCount: number;
    loadSavedList: (list: SavedStickerList) => void;
    deleteSavedList: (list: SavedStickerList) => void;
    togglePageSelection: (id: string) => void;
    toggleAllPagesSelection: (select: boolean) => void;
    discountThreshold: string;
    handleDiscountThresholdChange: (val: string) => void;
    activeQueuePageId: string | null;
    setActiveQueuePageId: (id: string | null) => void;
    activeSubTab: 'data' | 'queue' | 'history';
    setActiveSubTab: (tab: 'data' | 'queue' | 'history') => void;
    priceSource: 'sale' | 'service';
    setPriceSource: (source: 'sale' | 'service') => void;
    stickerType: 'gia_soc' | 'gio_vang' | 'draw';
    drawStartNumber: number;
    setDrawStartNumber: (num: number) => void;
    drawTotalTickets: number;
    setDrawTotalTickets: (num: number) => void;
    drawAutoIncrement: boolean;
    setDrawAutoIncrement: (val: boolean) => void;
    bgImage: string;
    setBgImage: (img: string) => void;
    onResetFontSizes: () => void;
    /** Tab Sticker: bấm in thì chọn kiểu tem và bố cục trang thay cho in A4 một sticker mỗi trang. */
    choosesLayoutOnPrint?: boolean;
    /** Lớp thêm cho khung (đè chiều cao, bề ngang tối thiểu của khung). */
    className?: string;
}

export const StickerPrintControls: React.FC<StickerPrintControlsProps> = ({
    manualPages,
    batchItems,
    discountDisplayMode,
    setDiscountDisplayMode,
    searchTerm,
    setSearchTerm,
    printHistory,
    showHistory,
    setShowHistory,
    handlePrint,
    addCurrentPage,
    handleTemplateUpload,
    downloadTemplate,
    handleReset,
    toggleAllSelection,
    toggleItemSelection,
    clearBatchItems,
    restoreHistory,
    deleteHistory,
    savedLists,
    showSavedLists,
    setShowSavedLists,
    saveCurrentList,
    clearManualPages,
    loadPageToEditor,
    removeManualPage,
    setPageQuantity,
    stickerPrintCount,
    stickerPrintAllCount,
    loadSavedList,
    deleteSavedList,
    togglePageSelection,
    toggleAllPagesSelection,
    discountThreshold,
    handleDiscountThresholdChange,
    activeQueuePageId,
    setActiveQueuePageId,
    activeSubTab,
    setActiveSubTab,
    priceSource,
    setPriceSource,
    stickerType,
    drawStartNumber,
    setDrawStartNumber,
    drawTotalTickets,
    setDrawTotalTickets,
    drawAutoIncrement,
    setDrawAutoIncrement,
    bgImage,
    setBgImage,
    onResetFontSizes,
    choosesLayoutOnPrint = false,
    className,
}) => {
    const selectedCount = batchItems.filter(i => i.selected).length;
    const selectedManualPagesCount = manualPages.filter(p => p.selected !== false).length;
    const filteredItems = batchItems.filter(it => it.name.toLowerCase().includes(searchTerm.toLowerCase()));

    // --- Debounce input: giữ local state cho 2 ô nhập liệu để tránh tạo mới
    // toàn bộ mảng drawTickets (có thể lên tới 1000 phần tử) mỗi phím bấm.
    // Chỉ cập nhật parent state sau khi ngừng gõ 400ms. ---
    const [localStartNumber, setLocalStartNumber] = useState(drawStartNumber);
    const [localTotalTickets, setLocalTotalTickets] = useState(drawTotalTickets);

    // Sync từ parent khi có thay đổi bên ngoài (ví dụ: restore history)
    useEffect(() => { setLocalStartNumber(drawStartNumber); }, [drawStartNumber]);
    useEffect(() => { setLocalTotalTickets(drawTotalTickets); }, [drawTotalTickets]);

    // Debounce: chỉ lan truyền giá trị mới lên parent sau 400ms ngừng gõ
    useEffect(() => {
        const timer = setTimeout(() => {
            if (localStartNumber !== drawStartNumber) setDrawStartNumber(localStartNumber);
        }, 400);
        return () => clearTimeout(timer);
    }, [localStartNumber]);  

    useEffect(() => {
        const timer = setTimeout(() => {
            if (localTotalTickets !== drawTotalTickets) setDrawTotalTickets(localTotalTickets);
        }, 400);
        return () => clearTimeout(timer);
    }, [localTotalTickets]);  

    const [historyQuery, setHistoryQuery] = useState('');
    const filteredHistory = useMemo(() => {
        const userEntries = printHistory.filter(entry => entry.stickerType === stickerType && entry.id !== DEFAULT_HISTORY_ID);
        // Ở chế độ draw, luôn gắn entry mẫu mặc định ở trên cùng danh sách (cố định ở trên)
        if (stickerType === 'draw') {
            return [DEFAULT_DRAW_HISTORY_ENTRY, ...userEntries];
        }
        return userEntries;
    }, [printHistory, stickerType]);

    const shownHistory = useMemo(() => {
        const q = searchKey(historyQuery);
        return q ? filteredHistory.filter(entry => searchKey(entry.label).includes(q)) : filteredHistory;
    }, [filteredHistory, historyQuery]);

    // Gọn để vừa khung ở cửa sổ nhỏ nhất (1100 x 680) mà không có thanh cuộn
    const guideItems: { lead: string; text: React.ReactNode }[] = choosesLayoutOnPrint ? [
        { lead: 'Khi bấm in', text: <>Chọn <strong>kiểu</strong> và <strong>bố cục</strong> (1 đến 24 tem mỗi trang A4 hoặc máy in bill 80mm), xem trước rồi bấm <strong>In ngay</strong>. Danh sách <strong>tự lưu vào Lịch sử</strong>.</> },
        { lead: 'Nhập file giá', text: <><strong>Nhập file mẫu</strong> nhận cả bảng giá ERP mẫu 81 của tab Event (nhiều file một lần): <strong>mọi sản phẩm</strong> thành sticker, mã đã có thì cập nhật giá.</> },
        { lead: 'Tìm và chọn', text: 'Gõ tên hoặc mã ở ô cạnh Kiểu sticker để lọc ảnh bên trái, tick ô dưới ảnh rồi bấm In đã chọn.' },
        { lead: 'Kiểu sticker', text: 'Chọn ngay trên khung xem trước. Kiểu giá to và Kiểu phiếu giảm giá in trắng đen ít tốn mực.' },
        { lead: 'Sửa và thêm', text: 'Sửa ở các ô dưới tem, có mã thì tem in QR. Bấm Thêm để đưa vào danh sách, các ô để trống cho sticker sau.' },
    ] : stickerType === 'draw' ? [
        { lead: 'Khi bấm in', text: <>App tự đặt khổ <strong>A4</strong>, <strong>không lề</strong>, <strong>có in nền</strong>. Xem trước rồi bấm <strong>In ngay</strong>.</> },
        { lead: 'Sửa nhanh', text: 'Sửa chữ ở phiếu số 1, các phiếu còn lại đổi theo.' },
        { lead: 'Cỡ chữ', text: <>Bôi đen chữ trên phiếu để tăng giảm. Nút <strong>Cỡ chữ gốc</strong> đưa về mặc định.</> },
    ] : [
        { lead: 'Khi bấm in', text: <>Chọn <strong>số sticker trên 1 trang A4</strong>: 1, 2, 4, 8 hoặc 16. App tự đặt <strong>không lề</strong> và <strong>có in nền</strong>. Xem trước bản in, chọn máy in rồi bấm <strong>In ngay</strong>. Danh sách <strong>tự lưu vào Lịch sử</strong>, in lại đúng danh sách cũ thì không lưu thêm.</> },
        { lead: 'Cỡ chữ', text: <>Bôi đen chữ trên bản xem trước để tăng giảm. Nút <strong>Cỡ chữ gốc</strong> đưa tất cả về mặc định.</> },
        { lead: 'Sửa nhanh', text: 'Click trực tiếp vào chữ trên sticker ở khung preview.' },
        { lead: 'Tính % tự động', text: 'Chỉ cần nhập Giá cũ & Giá mới.' },
    ];

    const tabItems: TabItem[] = [
        { id: 'data', label: 'Dữ liệu' },
        ...(stickerType !== 'draw' ? [{ id: 'queue', label: 'D.Sách', badge: manualPages.length }] : []),
        { id: 'history', label: 'Lịch sử', badge: filteredHistory.length },
    ];

    const hasList = stickerType !== 'draw' && (manualPages.length > 0 || batchItems.length > 0);
    const printButton = '!bg-amber-400 hover:!bg-amber-500 !text-slate-950 font-bold text-sm py-2 rounded-control flex items-center justify-center gap-1.5 active:scale-95 transition-transform shadow-sm border-transparent';

    return (
        <SectionCard className={cn('w-full max-w-sm lg:max-w-[480px] lg:flex-1 lg:min-w-0 lg:h-[max(556px,82%)] min-h-[460px] p-3 lg:p-6 no-print flex flex-col overflow-hidden', className)}>
            {/* Primary Action Buttons. Hai nút in (có danh sách) chiếm cả hàng; Thêm và Cỡ chữ gốc (Giá Sốc, Giờ Vàng) xuống hàng
                dưới, kẻo tràn khung ở cửa sổ nhỏ. */}
            <div className="flex flex-wrap gap-2 mb-3 shrink-0">
                {/* Vàng = màu nút IN của chủ dự án (giữ); chữ viết như câu thay IN HOA (GĐ7). Có danh sách sticker thì hai nút:
                    In tất cả (cả sticker bỏ chọn) và In đã chọn (chỉ sticker có dấu tick ở dải ảnh hoặc tab D.Sách). */}
                {hasList ? (
                    <div className="flex basis-full gap-2">
                        <Button
                            onClick={() => handlePrint({ all: true })}
                            className={`${printButton} flex-1`}
                            title="In mọi sticker trong danh sách, kể cả sticker đang bỏ chọn"
                            leftIcon={<AppIcon name="print" size="md" />}
                        >
                            In tất cả ({stickerPrintAllCount})
                        </Button>
                        <Button
                            onClick={() => handlePrint()}
                            disabled={stickerPrintCount === 0}
                            className={`${printButton} flex-1 disabled:!opacity-50`}
                            title={stickerPrintCount === 0 ? 'Chưa chọn sticker nào: tick ô dưới ảnh sticker bên trái' : 'Chỉ in các sticker có dấu tick'}
                            leftIcon={<AppIcon name="print" size="md" />}
                        >
                            In đã chọn ({stickerPrintCount})
                        </Button>
                    </div>
                ) : (
                    <Button
                        onClick={() => handlePrint()}
                        className={`${printButton} flex-1`}
                        leftIcon={<AppIcon name="print" size="md" />}
                    >
                        Bấm để in ({stickerType === 'draw' ? Math.ceil(drawTotalTickets / 4) : stickerPrintCount})
                    </Button>
                )}
                {/* Tab Sticker đặt nút Thêm ngay trên các ô sửa ở khung xem trước */}
                {stickerType !== 'draw' && !choosesLayoutOnPrint && (
                    <Button
                        onClick={addCurrentPage}
                        className={`bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs py-2 px-3 rounded-control flex items-center justify-center gap-1 shrink-0 ${hasList ? 'flex-1' : ''}`}
                        title="Thêm sticker đang hiện trên bản xem trước vào danh sách in"
                        leftIcon={<AppIcon name="add" size="md" />}
                    >
                        Thêm
                    </Button>
                )}
                {/* Tab Sticker in tem giá theo mẫu, không chỉnh cỡ chữ trên sticker */}
                {!choosesLayoutOnPrint && <Button
                    variant="secondary"
                    onClick={onResetFontSizes}
                    className="font-bold text-xs py-2 px-3 rounded-control flex items-center justify-center gap-1 shrink-0"
                    title="Đưa mọi ô trên bản xem trước về cỡ chữ và khoảng dòng mặc định. Nội dung giữ nguyên."
                    leftIcon={<AppIcon name="reset" size="md" />}
                >
                    Cỡ chữ gốc
                </Button>}
            </div>

            {/* Tab Navigation */}
            <Tabs
                items={tabItems}
                activeId={activeSubTab}
                onChange={(id) => setActiveSubTab(id as 'data' | 'queue' | 'history')}
                variant="underline"
                size="sm"
                fullWidth
                className="mb-4 shrink-0"
            />

            {/* Tab Content (Scrollable Area) */}
            <div className={`flex-1 pr-1 -mr-1 scrollbar-thin ${activeSubTab === 'queue' ? 'flex flex-col overflow-hidden' : 'overflow-y-auto space-y-2'}`}>
                {activeSubTab === 'data' && (
                    <div className="space-y-2.5 animate-in fade-in duration-200 pb-2">
                        {stickerType === 'draw' ? (
                            /* Cấu hình phiếu rút thăm chuyên nghiệp */
                            <div className="p-3 bg-rose-50 dark:bg-rose-900/10 rounded-popup border border-rose-100 dark:border-rose-800/30 space-y-2.5">
                                <div className="flex items-center justify-between gap-2">
                                    <p className="text-xs font-bold text-rose-700 dark:text-rose-400 flex items-center gap-1.5">
                                        <AppIcon name="settings" size="sm" />
                                        Cấu hình in phiếu rút thăm
                                    </p>
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        icon="reset"
                                        onClick={() => {
                                            setLocalStartNumber(1);
                                            setLocalTotalTickets(4000);
                                            setDrawAutoIncrement(true);
                                            restoreHistory(DEFAULT_DRAW_HISTORY_ENTRY);
                                        }}
                                        className="bg-white hover:bg-rose-100/70 text-rose-700"
                                        title="Khôi phục toàn bộ phiếu và cấu hình về mẫu mặc định"
                                    >
                                        Mặc định
                                    </Button>
                                </div>

                                <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
                                    <label className="flex flex-col gap-1">
                                        <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400">Số bắt đầu</span>
                                        <Input
                                            type="number" inputMode="decimal"
                                            min="1"
                                            value={localStartNumber}
                                            onChange={(e) => setLocalStartNumber(Math.max(1, parseInt(e.target.value) || 1))}
                                            className="text-xs font-semibold"
                                        />
                                    </label>
                                    <label className="flex flex-col gap-1">
                                        <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400">Số lượng cần in</span>
                                        <Input
                                            type="number" inputMode="decimal"
                                            min="1"
                                            value={localTotalTickets}
                                            onChange={(e) => setLocalTotalTickets(Math.max(1, parseInt(e.target.value) || 1))}
                                            className="text-xs font-semibold"
                                        />
                                    </label>
                                    <div className="flex flex-col gap-1">
                                        <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400">Mã số</span>
                                        <div className="flex items-center gap-2 min-h-7">
                                            <Switch checked={drawAutoIncrement ?? true} onChange={setDrawAutoIncrement} aria-labelledby="phieu-tu-nhay-so" />
                                            <span id="phieu-tu-nhay-so" className="text-[13px] font-medium text-slate-700">Tự động nhảy số</span>
                                        </div>
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400">Nền in</span>
                                        <Tabs
                                            variant="segment"
                                            size="sm"
                                            fullWidth
                                            activeId={bgImage}
                                            onChange={setBgImage}
                                            items={[
                                                { id: '/frame/bg_phieu.png', label: 'ĐMX' },
                                                { id: '/frame/bg_phieutgd.png', label: 'TGĐ' },
                                            ]}
                                        />
                                    </div>
                                </div>

                                <p className="text-[11px] leading-snug text-slate-600 dark:text-slate-400">
                                    In <strong className="text-slate-800 dark:text-white">{Math.ceil(localTotalTickets / 4)} trang A4</strong>, mỗi trang 4 phiếu.{' '}
                                    {(drawAutoIncrement ?? true) ? (
                                        <>Mã số từ <strong className="text-slate-800 dark:text-white">{localStartNumber}</strong> đến <strong className="text-slate-800 dark:text-white">{localStartNumber + localTotalTickets - 1}</strong>.</>
                                    ) : (
                                        'Mã số không tự tăng, sửa trực tiếp trên phiếu.'
                                    )}
                                </p>
                            </div>
                        ) : (
                            <>
                                {/* Nhập dữ liệu: nhập file mẫu là nút chính, tải file mẫu và đặt lại là nút phụ, cùng một hàng */}
                                <div className="space-y-1.5">
                                    <p className="text-[12px] font-medium text-slate-500 flex items-center gap-1.5 px-0.5">
                                        <AppIcon name="spreadsheet" size="sm" />
                                        {choosesLayoutOnPrint ? 'Nhập từ file mẫu hoặc file giá ERP' : 'Nhập từ file mẫu'}
                                    </p>
                                    <div className="grid grid-cols-3 gap-2">
                                        <label className="inline-flex items-center justify-center gap-1.5 h-9 max-sm:min-h-11 pointer-coarse:min-h-11 px-2 bg-sky-600 hover:bg-sky-700 text-white rounded-control font-semibold text-xs cursor-pointer transition-colors">
                                            <AppIcon name="upload" size="md" />
                                            Nhập file mẫu
                                            <input type="file" accept=".xlsx, .xls, .csv" multiple onChange={handleTemplateUpload} className="hidden" />
                                        </label>
                                        <Button variant="secondary" size="md" icon="download" onClick={downloadTemplate} className="text-xs px-2">
                                            Tải file mẫu
                                        </Button>
                                        <Button onClick={handleReset} variant="secondary" size="md" className="text-xs px-2" title="Xoá danh sách đã nhập, về mẫu ban đầu">
                                            Đặt lại
                                        </Button>
                                    </div>
                                </div>

                                {/* Batch items list */}
                                {batchItems.length > 0 && (
                                    <div className="mt-4 border-t border-slate-200 dark:border-slate-700 pt-4">
                                        <div className="flex justify-between items-center mb-3">
                                            <h4 className="font-bold text-xs text-slate-800 dark:text-white">
                                                Danh sách in ({selectedCount}/{batchItems.length})
                                            </h4>
                                            <div className="flex gap-2">
                                                <Button variant="link" size="none" onClick={() => toggleAllSelection(true)} className="ycx-hit text-[12px] text-sky-600 hover:text-sky-700 font-semibold">Chọn hết</Button>
                                                <Button variant="link" size="none" onClick={() => toggleAllSelection(false)} className="ycx-hit text-[12px] text-slate-500 hover:text-slate-600 font-semibold">Bỏ chọn</Button>
                                                <Button variant="link" size="none" onClick={clearBatchItems} className="ycx-hit text-[12px] text-rose-600 hover:text-rose-700 font-semibold">Xoá</Button>
                                            </div>
                                        </div>
                                        <Input 
                                            type="text" 
                                            placeholder="Tìm tên sản phẩm hoặc IMEI..." 
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            className="mb-3 bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700"
                                        />
                                        <div className="space-y-2">
                                            {filteredItems.map(item => (
                                                <Checkbox
                                                    key={item.id}
                                                    checked={item.selected}
                                                    onChange={() => toggleItemSelection(item.id)}
                                                    className="mt-0.5"
                                                    wrapperClassName={`flex items-start gap-3 p-3 rounded-control border transition-colors ${item.selected ? 'border-sky-500 bg-sky-50' : 'border-slate-200 bg-slate-50 hover:bg-slate-100'}`}
                                                    labelClassName="flex-1 min-w-0"
                                                    label={
                                                        <>
                                                            <span className="block font-bold text-xs text-slate-800 truncate" title={item.name}>{item.name}</span>
                                                            <span className="flex gap-3 mt-1.5 text-[11px]">
                                                                <span className="font-bold text-rose-600">{item.newPrice}</span>
                                                                <span className="line-through text-slate-400">{item.oldPrice}</span>
                                                                <span className="text-emerald-600 font-bold">{item.percent}</span>
                                                            </span>
                                                        </>
                                                    }
                                                />
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </>
                        )}

                        {/* Hướng dẫn: mỗi ý một dòng, gọn để cột không phải cuộn */}
                        <div className="mt-3 border-t border-slate-100 dark:border-slate-700/60 pt-3 space-y-2">
                            <div className="flex items-center gap-1.5">
                                <AppIcon name="settings" size="sm" className="text-sky-500" />
                                <span className="text-[13px] font-semibold text-slate-800">Hướng dẫn in & sử dụng</span>
                            </div>
                            <ul className="p-2.5 bg-slate-50 dark:bg-slate-900/20 rounded-popup border border-slate-100 dark:border-slate-800/60 space-y-1.5 text-[11px] leading-snug text-slate-600 dark:text-slate-300">
                                {guideItems.map(item => (
                                    <li key={item.lead} className="flex items-start gap-1.5">
                                        <AppIcon name="quick" size="xs" className="mt-0.5 shrink-0 text-amber-600" />
                                        <span><strong>{item.lead}:</strong> {item.text}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                )}

                {activeSubTab === 'queue' && (
                    <div className="flex-1 flex flex-col overflow-hidden animate-in fade-in duration-200 pb-2">
                        <StickerManualQueue
                            manualPages={manualPages}
                            savedLists={savedLists}
                            showSavedLists={showSavedLists}
                            setShowSavedLists={setShowSavedLists}
                            saveCurrentList={saveCurrentList}
                            clearManualPages={clearManualPages}
                            loadPageToEditor={loadPageToEditor}
                            removeManualPage={removeManualPage}
                            setPageQuantity={setPageQuantity}
                            loadSavedList={loadSavedList}
                            deleteSavedList={deleteSavedList}
                            togglePageSelection={togglePageSelection}
                            toggleAllPagesSelection={toggleAllPagesSelection}
                            discountThreshold={discountThreshold}
                            handleDiscountThresholdChange={handleDiscountThresholdChange}
                            activeQueuePageId={activeQueuePageId}
                            setActiveQueuePageId={setActiveQueuePageId}
                            discountDisplayMode={discountDisplayMode}
                            setDiscountDisplayMode={setDiscountDisplayMode}
                            priceSource={priceSource}
                            setPriceSource={setPriceSource}
                        />
                    </div>
                )}

                {activeSubTab === 'history' && (
                    <div className="space-y-2 animate-in fade-in duration-200 pb-2">
                        {/* Tra cứu theo tên danh sách đặt lúc in, không phân biệt dấu và chữ hoa */}
                        {stickerType !== 'draw' && filteredHistory.length > 0 && (
                            <Input
                                type="text"
                                aria-label="Tìm theo tên danh sách"
                                placeholder="Tìm theo tên danh sách..."
                                value={historyQuery}
                                onChange={(e) => setHistoryQuery(e.target.value)}
                                className="h-8 text-xs bg-slate-50 border-slate-200 placeholder-slate-400 text-slate-700"
                                fullWidth={true}
                                rightIcon={historyQuery ? 'x' : undefined}
                                onRightIconClick={historyQuery ? () => setHistoryQuery('') : undefined}
                            />
                        )}
                        {filteredHistory.length === 0 ? (
                            <EmptyState icon={<AppIcon name="history" size="lg" />} title="Chưa có lịch sử in" compact />
                        ) : shownHistory.length === 0 ? (
                            <p className="text-xs text-slate-500 text-center py-4">Không có danh sách nào tên giống "{historyQuery.trim()}".</p>
                        ) : (
                            shownHistory.map(entry => {
                                const isDefault = entry.id === DEFAULT_HISTORY_ID;
                                return (
                                <div 
                                    key={entry.id} 
                                    className={`flex items-center justify-between p-3 rounded-control border group text-left ${
                                        isDefault 
                                            ? 'sticky top-0 z-10 bg-amber-50/95 dark:bg-amber-950/90 backdrop-blur-xs border-amber-300 dark:border-amber-700/60 shadow-xs' 
                                            : 'bg-slate-50 dark:bg-slate-900/50 border-slate-100 dark:border-slate-700'
                                    }`}
                                >
                                    <div className="min-w-0 flex-1">
                                        <p className="text-xs font-bold text-slate-800 dark:text-white truncate flex items-center gap-1.5">
                                            {isDefault && <span className="inline-flex items-center shrink-0 px-1.5 py-0.5 text-[11px] font-black uppercase tracking-wider bg-amber-100 dark:bg-amber-800/40 text-amber-700 dark:text-amber-300 rounded"><AppIcon name="star" size="xs" className="mr-0.5" />Mặc định</span>}
                                            {entry.label}
                                        </p>
                                        <div className="flex gap-1.5 mt-1 text-[11px] text-slate-400">
                                            {!isDefault && (
                                                <>
                                                    <span>{new Date(entry.timestamp).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                                                    <span>•</span>
                                                </>
                                            )}
                                            <span>{entry.pageCount} trang</span>
                                            <span>•</span>
                                            <span>
                                                {entry.printedAs === 'tag'
                                                    ? 'Sticker'
                                                    : entry.stickerType === 'gia_soc' 
                                                    ? 'Giá Sốc' 
                                                    : entry.stickerType === 'draw' 
                                                        ? 'Phiếu' 
                                                        : 'Giờ Vàng'}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex gap-1 shrink-0 ml-2 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                                        <Button
                                            variant="tinted"
                                            size="icon"
                                            icon="reset"
                                            onClick={() => restoreHistory(entry)}
                                            title="Khôi phục"
                                            aria-label="Khôi phục"
                                        />
                                        {!isDefault && (
                                            <Button
                                                variant="destructive"
                                                size="icon"
                                                icon="delete"
                                                onClick={() => deleteHistory(entry.id)}
                                                title="Xóa"
                                                aria-label="Xóa"
                                            />
                                        )}
                                    </div>
                                </div>
                                );
                            })
                        )}
                    </div>
                )}
            </div>
        </SectionCard>
    );
};
