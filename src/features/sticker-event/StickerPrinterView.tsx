import React, { useEffect } from 'react';
import { toast } from '../../components/shared/ui/toast';
import { napPhongGoogle, PHONG_GOOGLE } from '../../components/shared/ui/googleFonts';

import { StickerPage, SavedStickerList, PrintHistoryEntry } from './stickerprinter/types';
import { StickerPrintPreview } from './stickerprinter/StickerPrintPreview';
import { StickerManualQueue } from './stickerprinter/StickerManualQueue';
import { StickerQueueStrip } from './stickerprinter/StickerQueueStrip';
import { StickerPrintControls } from './stickerprinter/StickerPrintControls';
import { StickerModeToolbar } from './stickerprinter/StickerModeToolbar';
import { TagPrintDialog } from './stickerprinter/TagPrintDialog';
import { StickerPerPageDialog } from './stickerprinter/StickerPerPageDialog';
import { TagPreviewPanel } from './stickerprinter/TagPreviewPanel';
import { useTagPrintSettings } from './stickerprinter/useTagPrintSettings';
import { Button } from '../../components/shared/ui/Button';
import { useStickerPrinterData } from './hooks/useStickerPrinterData';
import { useHiddenTabs } from './tabAccess';
import { useActiveTab } from '../../contexts/LayoutContext';

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
        tagPrint, closeTagPrint, tagPreviewProducts, tagPreviewGhost,
        sheetPrint, closeSheetPrint, stickersPerPage, chooseStickersPerPage,
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
        editorQuantity, setEditorQuantity, setPageQuantity, stickerPrintCount,
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
    const isTagMode = stickerMode === 'tag';
    // Đang mở Kiểm hàng thì màn này vẫn giữ trạng thái nhưng không được đặt nút lên thanh trên
    const moduleActive = useActiveTab().activeTab === 'tools-print-sticker';
    const tag = useTagPrintSettings(isTagMode);

    // Tab đang mở vừa bị tắt trong bảng bật tắt tab: chuyển sang tab còn bật
    const hiddenTabs = useHiddenTabs();
    const currentSub = stickerMode === 'event' ? 'event' : isTagMode ? 'sticker'
        : stickerType === 'gia_soc' ? 'gia-soc' : stickerType === 'gio_vang' ? 'gio-vang' : 'draw';
    useEffect(() => {
        if ((hiddenTabs as readonly string[]).includes(currentSub)) applySubTab(currentSub);
    }, [hiddenTabs, currentSub, applySubTab]);

    const editingNote = stickerType !== 'draw' && batchItems.length === 0 && manualPages.length > 0 && (
        <p data-testid="sticker-editing-note" className="no-print shrink-0 text-xs text-slate-500 text-center">
            {activeQueuePageId
                ? `Đang sửa sticker ${manualPages.findIndex((page) => page.id === activeQueuePageId) + 1}/${manualPages.length}. Thay đổi được lưu ngay.`
                : 'Sticker đang soạn, chưa có trong danh sách in. Bấm Thêm để đưa vào.'}
        </p>
    );

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
                onSelectTag={() => {
                    applySubTab('sticker');
                    updateSubQueryParam('sticker');
                }}
                hiddenTabs={hiddenTabs}
            />

            {/* Vùng nội dung: chiếm phần còn lại dưới hàng chế độ. Lớp Event và lớp tem chồng nhau; lớp không mở thì ẩn hẳn
                (invisible) để không bấm hay tab nhầm vào lớp đó, vẫn giữ nguyên trạng thái của nó. Tab Sticker dùng lớp tem của Giá Sốc. */}
            <div className="relative flex-1 min-h-0">
            {eventEverOpened && (
                <div className={`absolute inset-0 z-10 w-full h-full overflow-y-auto transition-opacity duration-200 ${stickerMode === 'event' ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none invisible'}`}>
                    <ErrorBoundary name="Event">
                        <StickerEventApp isActive={stickerMode === 'event' && moduleActive} />
                    </ErrorBoundary>
                </div>
            )}

            {/* Xem trước và khung điều khiển cùng chiều cao, chừa lại một phần cửa sổ cho thoáng. Cửa sổ nhỏ thì giữ cỡ tối thiểu và cuộn. */}
            <div className={`w-full h-full overflow-y-auto p-3 sm:p-4 lg:p-5 flex flex-col lg:flex-row gap-4 lg:gap-5 justify-start lg:justify-center items-center lg:items-start ${stickerMode === 'sticker' || stickerMode === 'tag' ? 'visible' : 'invisible'}`}>
                {stickerType !== 'draw' && (
                    <StickerQueueStrip
                        pages={manualPages}
                        activeId={activeQueuePageId}
                        onSelect={selectQueuePage}
                        onRemove={removeManualPage}
                        onQuantity={setPageQuantity}
                        stickerType={stickerType}
                        bgImage={bgImage}
                        priceSource={priceSource}
                        discountDisplayMode={discountDisplayMode}
                        headerTextContent={headerTextContent}
                        subHeaderTextContent={subHeaderTextContent}
                        footerTextContent={footerTextContent}
                        tagView={isTagMode ? { settings: tag.settings, employeeName: tag.employeeName } : undefined}
                    />
                )}
                {/* Tab Sticker: tem giá theo kiểu đang chọn và các ô sửa, không dùng sticker nền Giá Sốc */}
                {isTagMode ? (
                    <div className="flex flex-col gap-2 w-full max-w-xl shrink-0 lg:w-[44%] lg:max-w-[560px] lg:h-[max(556px,82%)] lg:overflow-hidden">
                        <TagPreviewPanel
                            products={tagPreviewProducts}
                            ghostAlternative={tagPreviewGhost}
                            settings={tag.settings}
                            employeeName={tag.employeeName}
                            onEmployeeNameChange={tag.setEmployeeName}
                            onStickerStyleChange={tag.setStickerStyle}
                            editor={batchItems.length > 0 ? undefined : {
                                name: previewName,
                                oldPrice: previewOldPrice,
                                newPrice: previewNewPrice,
                                promotion: footerTextContent,
                                code: barcodeImei,
                                onName: editPreviewName,
                                onOldPrice: editPreviewOldPrice,
                                onNewPrice: editPreviewNewPrice,
                                onPromotion: editFooterText,
                                onCode: editBarcode,
                                onAdd: addCurrentPage,
                                quantity: editorQuantity,
                                onQuantity: setEditorQuantity,
                            }}
                        />
                        {editingNote}
                    </div>
                ) : (
                /* Phiếu chừa chỗ cho thanh chuyển trang; nhập File giá thì nhiều tem xếp chồng nên cuộn trong cột này */
                <div className={`flex flex-col gap-2 w-full max-w-sm shrink-0 lg:w-auto lg:aspect-[197/285] lg:max-w-[50%] ${stickerType === 'draw' ? 'lg:h-[max(500px,calc(82%-4rem))]' : 'lg:h-[max(556px,82%)]'} ${batchItems.length > 0 ? 'lg:overflow-y-auto' : ''}`}>
                    <StickerPrintPreview
                        batchItems={batchItems}
                        stickerType={stickerType}
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
                    {editingNote}
                </div>
                )}
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
                    setPageQuantity={setPageQuantity}
                    stickerPrintCount={stickerPrintCount}
                    loadSavedList={loadSavedList}
                    deleteSavedList={deleteSavedList}
                    togglePageSelection={togglePageSelection}
                    toggleAllPagesSelection={toggleAllPagesSelection}
                    discountDisplayMode={discountDisplayMode}
                    setDiscountDisplayMode={setDiscountDisplayMode}
                    searchTerm={searchTerm}
                    setSearchTerm={setSearchTerm}
                    printHistory={printHistory}
                    showHistory={showHistory}
                    setShowHistory={setShowHistory}
                    handlePrint={handlePrint}
                    addCurrentPage={addCurrentPage}
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
                    stickerType={stickerType}
                    drawStartNumber={drawStartNumber}
                    setDrawStartNumber={setDrawStartNumber}
                    drawTotalTickets={drawTotalTickets}
                    setDrawTotalTickets={setDrawTotalTickets}
                    drawAutoIncrement={drawAutoIncrement}
                    setDrawAutoIncrement={setDrawAutoIncrement}
                    bgImage={bgImage}
                    setBgImage={setBgImage}
                    choosesLayoutOnPrint={stickerMode === 'tag'}
                />
            </div>
            </div>

            {tagPrint && (
                <TagPrintDialog
                    products={tagPrint.products}
                    settings={tag.settings}
                    employeeName={tag.employeeName}
                    onStickerStyleChange={tag.setStickerStyle}
                    onTagsPerPageChosen={tag.setTagsPerPage}
                    onClose={closeTagPrint}
                    onPrinted={tagPrint.onPrinted}
                />
            )}

            {sheetPrint && (
                <StickerPerPageDialog
                    count={sheetPrint.count}
                    current={stickersPerPage}
                    onSelect={chooseStickersPerPage}
                    onClose={closeSheetPrint}
                />
            )}

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
