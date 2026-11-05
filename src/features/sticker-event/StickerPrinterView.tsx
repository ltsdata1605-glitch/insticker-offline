import React, { useEffect } from 'react';
import { toast } from '../../components/shared/ui/toast';
import { napPhongGoogle, PHONG_GOOGLE } from '../../components/shared/ui/googleFonts';

import { StickerPage, SavedStickerList, PrintHistoryEntry } from './stickerprinter/types';
import { StickerPrintPreview } from './stickerprinter/StickerPrintPreview';
import { StickerManualQueue } from './stickerprinter/StickerManualQueue';
import { StickerQueueStrip } from './stickerprinter/StickerQueueStrip';
import { StickerPrintControls } from './stickerprinter/StickerPrintControls';
import { StickerModeToolbar } from './stickerprinter/StickerModeToolbar';
import { Button } from '../../components/shared/ui/Button';
import { useStickerPrinterData } from './hooks/useStickerPrinterData';

import ErrorBoundary from '../../components/shared/ui/ErrorBoundary';

import StickerEventApp from './StickerEventApp';
import SaveListModal from './SaveListModal';

export default function StickerPrinterView() {
    // Tem dùng phông Google (Oswald, Roboto Condensed, Jost… — menu phông của thanh định dạng). Trước 2026-10-11 cả 7 họ nạp
    // sẵn ở index.html cho MỌI màn; nay chỉ nạp khi mở In Sticker (components/shared/ui/googleFonts.ts).
    useEffect(() => { napPhongGoogle(PHONG_GOOGLE); }, []);
    const {
        stickerMode, setStickerMode,
        eventEverOpened, setEventEverOpened,
        stickerType, setStickerType,
        bgImage, setBgImage,
        priceSource, setPriceSource,
        drawTickets, setDrawTickets,
        drawStartNumber, setDrawStartNumber,
        drawTotalTickets, setDrawTotalTickets,
        drawAutoIncrement, setDrawAutoIncrement,
        drawContentTopLeftSize,
        drawContentTopRightSize,
        drawContentBottomLeftSize,
        drawContentBottomRightSize,
        drawContentBottomRightSubSize,
        drawTitleSize,
        drawCodeSize,
        drawFooterSize,
        activeField, setActiveField,
        headerTextSize, setHeaderTextSize,
        subHeaderTextSize,
        percentTextSize,
        oldPriceTextSize,
        nameTextSize,
        newPriceTextSize,
        footerTextSize,
        discountDisplayMode, setDiscountDisplayMode,
        discountThreshold, setDiscountThreshold,
        activeQueuePageId, setActiveQueuePageId,
        activeSubTab, setActiveSubTab,
        batchItems, setBatchItems,
        headerTextContent, setHeaderTextContent,
        subHeaderTextContent, setSubHeaderTextContent,
        footerTextContent, setFooterTextContent,
        searchTerm, setSearchTerm,
        showBarcode, setShowBarcode,
        barcodeImei, setBarcodeImei,
        manualPages, setManualPages,
        printHistory,
        showHistory, setShowHistory,
        savedLists,
        showSavedLists, setShowSavedLists,
        previewName, setPreviewName,
        previewOldPrice, setPreviewOldPrice,
        previewNewPrice, setPreviewNewPrice,
        isLoaded,
        isSaveListModalOpen, setIsSaveListModalOpen,
        activeDrawPage, setActiveDrawPage,
        totalDrawPages,
        updateBatchItem,
        updateSubQueryParam,
        applySubTab,
        handleDiscountThresholdChange,
        resetAllFontSizes,
        handleExcelUpload,
        downloadTemplate,
        loadPageToEditor,
        handleTemplateUpload,
        handleErpPriceUpload,
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
    } = useStickerPrinterData();

    return (
        <div className="print-wrapper w-full h-[calc(100dvh-64px)] bg-slate-100 dark:bg-slate-900 relative overflow-hidden flex flex-col">
            <StickerModeToolbar
                stickerMode={stickerMode}
                stickerType={stickerType}
                onSelectGiaSoc={() => {
                    applySubTab('gia-soc');
                    updateSubQueryParam('gia-soc');
                }}
                onSelectGioVang={() => {
                    applySubTab('gio-vang');
                    updateSubQueryParam('gio-vang');
                }}
                onSelectDraw={() => {
                    applySubTab('draw');
                    updateSubQueryParam('draw');
                }}
                onSelectEvent={() => {
                    applySubTab('event');
                    updateSubQueryParam('event');
                }}
            />

            {/* Vùng nội dung: chiếm phần còn lại dưới hàng chế độ (iPhone/iPad) — 2 lớp Sticker / tem chồng nhau như cũ */}
            <div className="relative flex-1 min-h-0">
            {eventEverOpened && (
                <div className={`absolute inset-0 z-10 w-full h-full overflow-y-auto transition-opacity duration-200 ${stickerMode === 'event' ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
                    <ErrorBoundary name="Sticker">
                        <StickerEventApp />
                    </ErrorBoundary>
                </div>
            )}

            {/* Xem trước và khung điều khiển cùng chiều cao, chừa lại một phần cửa sổ cho thoáng. Cửa sổ nhỏ thì giữ cỡ tối thiểu và cuộn. */}
            <div className={`w-full h-full overflow-y-auto p-3 sm:p-4 lg:p-5 flex flex-col lg:flex-row gap-4 lg:gap-5 justify-start lg:justify-center items-center lg:items-start ${stickerMode === 'event' ? 'invisible' : 'visible'}`}>
                {stickerType !== 'draw' && (
                    <StickerQueueStrip
                        pages={manualPages}
                        activeId={activeQueuePageId}
                        onSelect={selectQueuePage}
                        stickerType={stickerType}
                        bgImage={bgImage}
                        priceSource={priceSource}
                        discountDisplayMode={discountDisplayMode}
                        headerTextContent={headerTextContent}
                        subHeaderTextContent={subHeaderTextContent}
                        footerTextContent={footerTextContent}
                        showBarcode={showBarcode}
                    />
                )}
                {/* Phiếu chừa chỗ cho thanh chuyển trang; nhập File giá thì nhiều tem xếp chồng nên cuộn trong cột này */}
                <div className={`flex flex-col gap-2 w-full max-w-sm shrink-0 lg:w-auto lg:aspect-[197/285] lg:max-w-[50%] ${stickerType === 'draw' ? 'lg:h-[max(500px,calc(82%-4rem))]' : 'lg:h-[max(556px,82%)]'} ${batchItems.length > 0 ? 'lg:overflow-y-auto' : ''}`}>
                    <StickerPrintPreview
                        batchItems={batchItems}
                        stickerType={stickerType}
                        showBarcode={showBarcode}
                        discountDisplayMode={discountDisplayMode}
                        headerTextContent={headerTextContent}
                        subHeaderTextContent={subHeaderTextContent}
                        footerTextContent={footerTextContent}
                        barcodeImei={barcodeImei}
                        bgImage={bgImage}
                        headerTextSize={headerTextSize}
                        subHeaderTextSize={subHeaderTextSize}
                        percentTextSize={percentTextSize}
                        oldPriceTextSize={oldPriceTextSize}
                        nameTextSize={nameTextSize}
                        newPriceTextSize={newPriceTextSize}
                        footerTextSize={footerTextSize}
                        previewName={previewName}
                        previewOldPrice={previewOldPrice}
                        previewNewPrice={previewNewPrice}
                        setPreviewOldPrice={editPreviewOldPrice}
                        setPreviewNewPrice={editPreviewNewPrice}
                        activeField={activeField}
                        setActiveField={setActiveField}
                        setHeaderTextContent={editHeaderText}
                        setSubHeaderTextContent={editSubHeaderText}
                        setFooterTextContent={editFooterText}
                        setBarcodeImei={editBarcode}
                        setPreviewName={editPreviewName}
                        drawTickets={drawTickets}
                        setDrawTickets={setDrawTickets}
                        drawStartNumber={drawStartNumber}
                        drawAutoIncrement={drawAutoIncrement}
                        drawContentTopLeftSize={drawContentTopLeftSize}
                        drawContentTopRightSize={drawContentTopRightSize}
                        drawContentBottomLeftSize={drawContentBottomLeftSize}
                        drawContentBottomRightSize={drawContentBottomRightSize}
                        drawContentBottomRightSubSize={drawContentBottomRightSubSize}
                        drawTitleSize={drawTitleSize}
                        drawCodeSize={drawCodeSize}
                        drawFooterSize={drawFooterSize}
                    />
                    {stickerType !== 'draw' && batchItems.length === 0 && manualPages.length > 0 && (
                        <p data-testid="sticker-editing-note" className="no-print shrink-0 text-xs text-slate-500 text-center">
                            {activeQueuePageId
                                ? `Đang sửa sticker ${manualPages.findIndex((page) => page.id === activeQueuePageId) + 1}/${manualPages.length}. Thay đổi được lưu ngay.`
                                : 'Sticker đang soạn, chưa có trong danh sách in. Bấm Thêm để đưa vào.'}
                        </p>
                    )}
                </div>
                <StickerPrintControls
                    manualPages={manualPages}
                    batchItems={batchItems}
                    savedLists={savedLists}
                    showSavedLists={showSavedLists}
                    setShowSavedLists={setShowSavedLists}
                    saveCurrentList={saveCurrentList}
                    clearManualPages={clearManualPages}
                    loadPageToEditor={loadPageToEditor}
                    removeManualPage={removeManualPage}
                    loadSavedList={loadSavedList}
                    deleteSavedList={deleteSavedList}
                    togglePageSelection={togglePageSelection}
                    toggleAllPagesSelection={toggleAllPagesSelection}
                    showBarcode={showBarcode}
                    setShowBarcode={setShowBarcode}
                    discountDisplayMode={discountDisplayMode}
                    setDiscountDisplayMode={setDiscountDisplayMode}
                    searchTerm={searchTerm}
                    setSearchTerm={setSearchTerm}
                    printHistory={printHistory}
                    showHistory={showHistory}
                    setShowHistory={setShowHistory}
                    handlePrint={handlePrint}
                    addCurrentPage={addCurrentPage}
                    handleExcelUpload={handleExcelUpload}
                    handleTemplateUpload={handleTemplateUpload}
                    downloadTemplate={downloadTemplate}
                    handleReset={handleReset}
                    toggleAllSelection={toggleAllSelection}
                    toggleItemSelection={toggleItemSelection}
                    clearBatchItems={() => setBatchItems([])}
                    restoreHistory={restoreHistory}
                    deleteHistory={deleteHistory}
                    discountThreshold={discountThreshold}
                    handleDiscountThresholdChange={handleDiscountThresholdChange}
                    onResetFontSizes={resetAllFontSizes}
                    activeQueuePageId={activeQueuePageId}
                    setActiveQueuePageId={setActiveQueuePageId}
                    activeSubTab={activeSubTab}
                    setActiveSubTab={setActiveSubTab}
                    priceSource={priceSource}
                    setPriceSource={setPriceSource}
                    handleErpPriceUpload={handleErpPriceUpload}
                    stickerType={stickerType}
                    drawStartNumber={drawStartNumber}
                    setDrawStartNumber={setDrawStartNumber}
                    drawTotalTickets={drawTotalTickets}
                    setDrawTotalTickets={setDrawTotalTickets}
                    drawAutoIncrement={drawAutoIncrement}
                    setDrawAutoIncrement={setDrawAutoIncrement}
                    bgImage={bgImage}
                    setBgImage={setBgImage}
                />
            </div>
            </div>

            {isSaveListModalOpen && (
                <SaveListModal
                    isOpen={isSaveListModalOpen}
                    onClose={() => setIsSaveListModalOpen(false)}
                    onSave={handleSaveCurrentList}
                    defaultName={`DS ${new Date().toLocaleDateString('vi-VN')}`}
                />
            )}
        </div>
    );
}
