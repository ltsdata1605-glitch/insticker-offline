import React, { useState, useEffect, useRef, useMemo } from 'react';
import { AppIcon } from '../../components/shared/ui/icon/AppIcon';
import { toast } from '../../components/shared/ui/toast';
import { Product, SavedListItem } from './types';
import { loadData, loadEmployeeName, saveDisplayedProducts, saveTemplateProducts } from './services/fileParser';
import { downloadStickerTemplateFile, mergeTemplateImport, readTemplateFile } from './services/stickerTemplate';
import type { TagLayout } from './types';
import { saveList } from './services/localDataService';
import { applyImport, downloadImportWorkbook } from './services/productListImport';
import type { ImportEntry, ImportMode } from './services/productListImport';
import ResultsDisplay from './ResultsDisplay';
import Scanner from './Scanner';
import PrintSettingsModal from './PrintSettingsModal';
import LayoutSelectionModal from './LayoutSelectionModal';
import ManualInputModal, { ManualProductWithId } from './ManualInputModal';
import ControlPanel from './ControlPanel';
import ProductToolbar from './ProductToolbar';
import FilterModal from './FilterModal';
import BottomNavigation from './BottomNavigation';
import { Button } from '../../components/shared/ui/Button';
import SavedListsModal from './SavedListsModal';
import SaveListModal from './SaveListModal';
import ImportListModal from './ImportListModal';
import PriceSourcesModal from './PriceSourcesModal';
import PriceImportHistoryModal from './PriceImportHistoryModal';
import AlertModal from './AlertModal';
import ConfirmModal from './ConfirmModal';
import ErrorBoundary from './ErrorBoundary';

import UserGuideModal from './UserGuideModal';
import { exportProductsInBatches } from './services/batchImageExportService';

// Custom Hooks
import { useStickerEventDb } from './hooks/useStickerEventDb';
import { useStickerEventFile } from './hooks/useStickerEventFile';
import { useStickerEventPrint } from './hooks/useStickerEventPrint';
import { useStickerEventState } from './hooks/useStickerEventState';
import { Overlay } from '../../components/shared/ui/Overlay';
import { HeaderSlot } from '../../platform/HeaderSlot';
import { StickerScopeContext } from './services/scope';
import type { StickerScope } from './services/scope';

interface StickerEventAppProps {
  /** Tab Event lấy giá từ bảng giá ERP, tab Sticker lấy từ file mẫu. Dữ liệu mỗi tab lưu riêng. */
  scope?: StickerScope;
  /** Đang mở tab này. Màn vẫn giữ trong cây khi sang chế độ khác nên phải biết để ẩn nút trên thanh trên. */
  isActive?: boolean;
}

export default function App({ scope = 'event', isActive = true }: StickerEventAppProps): React.JSX.Element {
  const [isInitializing, setIsInitializing] = useState(true);

  // 1b. Lifted Database & File States
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [manualProducts, setManualProducts] = useState<ManualProductWithId[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [uploadTimestamp, setUploadTimestamp] = useState<Date | null>(null);
  const [fileExportDate, setFileExportDate] = useState<string | null>(null);

  // 2. State coordination Hook
  const {
    displayedProducts,
    setDisplayedProducts,
    sortField,
    setSortField,
    sortDirection,
    setSortDirection,
    isLoading,
    setIsLoading,
    error,
    setError,
    searchQuery,
    setSearchQuery,
    suggestions,
    setSuggestions,
    showNoResults,
    setShowNoResults,
    duplicateError,
    setDuplicateError,
    highlightedMsp,
    setHighlightedMsp,
    employeeName,
    setEmployeeName,
    isEditingEmployeeName,
    setIsEditingEmployeeName,
    activeTab,
    setActiveTab,
    alertConfig,
    setAlertConfig,
    showAlert,
    handleEmployeeNameChange,
    handleSaveEmployeeName,
    handleEmployeeNameKeyDown,
    handleSearchInputChange,
    handleSuggestionClick,
    handleSearchSubmit,
    handleScanSuccess,
    handleToggleSelect,
    handleToggleAllSelect,
    handleQuantityChange,
    handleSetQuantity,
    handleDeleteProduct,
    executeReset,
    handleSortChange,
    sortedProducts,
  } = useStickerEventState({
    isInitializing,
    allProducts,
    scope,
  });

  // 3. Database operations Hook
  const {
    loadStoredManualProducts,
    handleManualSave,
    handleManualDelete,
    handleManualUpdate,
    executeClearAll,
  } = useStickerEventDb({
    employeeName,
    setDisplayedProducts,
    setIsLoading,
    setError,
    showAlert,
    setFileName,
    setFileExportDate,
    setUploadTimestamp,
    setAllProducts,
    manualProducts,
    setManualProducts,
    scope,
  });

  // 4. File operations Hook
  const { handleFileChange, handleDeleteSources } = useStickerEventFile({
    setAllProducts,
    setDisplayedProducts,
    setIsLoading,
    setError,
    showAlert,
    fileName,
    setFileName,
    uploadTimestamp,
    setUploadTimestamp,
    fileExportDate,
    setFileExportDate,
    manualProducts,
  });

  // 5. Printing operations Hook
  const {
    printSettings,
    setPrintSettings,
    modernPositions,
    setModernPositions,
    isPrinting,
    isPrintSettingsOpen,
    setIsPrintSettingsOpen,
    isLayoutModalOpen,
    setIsLayoutModalOpen,
    handlePrintSingle,
    handlePrintSelected,
    handlePrintAll,
    handleManualPrintSelected,
    printList,
    executePrint,
    executePrintByLayout,
    cancelPrintSession,
  } = useStickerEventPrint({
    employeeName,
    displayedProducts,
    setError,
    scope,
  });

  // Simple UI state variables
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [isClearAllConfirmOpen, setIsClearAllConfirmOpen] = useState(false);
  const [showManagerInstructions, setShowManagerInstructions] = useState(false);
  const [isSavedListsModalOpen, setIsSavedListsModalOpen] = useState(false);
  const [isSaveListModalOpen, setIsSaveListModalOpen] = useState(false);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [isManualInputOpen, setIsManualInputOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isUserGuideOpen, setIsUserGuideOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isPriceHistoryOpen, setIsPriceHistoryOpen] = useState(false);
  const [isPriceSourcesOpen, setIsPriceSourcesOpen] = useState(false);

  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 1024 || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  });

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 1024 || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent));
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  const selectedProducts = useMemo(() => displayedProducts.filter(p => p.selected), [displayedProducts]);
  const selectedCount = selectedProducts.length;
  const priceProductCount = useMemo(
    () => allProducts.reduce((sum, p) => sum + ((p as ManualProductWithId).firebaseId ? 0 : 1), 0),
    [allProducts],
  );
  const selectedTotalQty = useMemo(() => selectedProducts.reduce((sum, p) => sum + (p.quantity || 1), 0), [selectedProducts]);

  const productListRef = useRef<HTMLDivElement>(null);

  // Bind DB hook functions for manual handlers
  const handleManualSaveBound = async (product: ManualProductWithId) => handleManualSave(product);
  const handleManualDeleteBound = async (docId: string) => handleManualDelete(docId);
  const handleManualUpdateBound = async (product: ManualProductWithId) => handleManualUpdate(product);

  // Nạp dữ liệu đã lưu trên máy khi mở app
  useEffect(() => {
    const initialize = async () => {
      const savedData = await loadData(scope);

      if (savedData) {
        setAllProducts(savedData.products || []);
        setDisplayedProducts(savedData.displayedProducts || []);

        if (savedData.fileInfo?.fileName) {
          const savedFileNames = savedData.fileInfo.fileName;
          const fileList = savedFileNames.split(',').map((f: string) => f.trim()).filter(Boolean);
          setFileName(fileList.length > 1 ? `${fileList.length} tệp đã được tải lên` : savedFileNames);
          setUploadTimestamp(savedData.fileInfo.uploadTimestamp ? new Date(savedData.fileInfo.uploadTimestamp) : null);
          setFileExportDate(savedData.fileInfo.fileExportDate);
        }
      }

      const name = savedData?.employeeName || '';
      setEmployeeName(name);
      if (!name) setIsEditingEmployeeName(true);

      if (!savedData?.products?.length) setShowManagerInstructions(true);

      await loadStoredManualProducts();
      setIsInitializing(false);
    };

    initialize().catch((err) => {
      console.error('Không nạp được dữ liệu trên máy:', err);
      setError('Không đọc được dữ liệu đã lưu trên máy.');
      setIsInitializing(false);
    });
    // Chỉ chạy một lần khi mở tab
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tên người in dùng chung giữa hai tab: mở lại tab thì lấy tên mới nhất, phòng khi vừa đổi ở tab kia
  useEffect(() => {
    if (!isActive || isInitializing || isEditingEmployeeName) return;
    let active = true;
    loadEmployeeName().then((name) => {
      if (active && name && name !== employeeName) setEmployeeName(name);
    }).catch(() => { /* giữ tên đang có */ });
    return () => { active = false; };
    // Chỉ khi chuyển sang tab này
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, isInitializing]);

  const handleSaveList = () => {
    if (displayedProducts.length === 0) {
      showAlert('Không có sản phẩm nào để lưu.');
      return;
    }
    setIsSaveListModalOpen(true);
  };

  const onConfirmSaveList = async (listName: string) => {
    setIsSaveListModalOpen(false);
    try {
      setIsLoading(true);
      // Lưu đầy đủ thông tin để mở lại vẫn in được kể cả khi đã thay bảng giá khác.
      const itemsToSave = displayedProducts.map(p => ({
        msp: p.msp,
        sanPham: p.sanPham,
        giaGoc: p.giaGoc || '',
        giaGiam: p.giaGiam || '',
        khuyenMai: p.khuyenMai || '',
        tongThuong: p.tongThuong || 0,
        thuongERP: p.thuongERP || 0,
        thuongNong: p.thuongNong || 0,
        quantity: p.quantity || 1,
        ...(p.layout ? { layout: p.layout } : {}),
      }));
      await saveList(listName, itemsToSave, scope);
      toast.success(`Đã lưu danh sách "${listName}"`);
    } catch (err) {
      console.error('Error saving list:', err);
      showAlert('Có lỗi xảy ra khi lưu danh sách. Vui lòng thử lại.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleViewSavedLists = () => {
    setIsSavedListsModalOpen(true);
  };

  const handleExportList = () => {
    downloadImportWorkbook(displayedProducts.map((p) => ({ code: p.msp, quantity: p.quantity || 1 }))).catch((err) => {
      console.error('Không xuất được file Excel:', err);
      toast.error('Không xuất được file Excel.');
    });
  };

  const handleDownloadTemplate = () => {
    downloadStickerTemplateFile().catch((err) => {
      console.error('Không tải được file mẫu:', err);
      toast.error('Không tải được file mẫu.');
    });
  };

  // Tab Sticker: sản phẩm lấy từ file mẫu, vào thẳng danh sách đang in
  const handleTemplateFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setIsLoading(true);
    try {
      const { products, errors, fatal } = await readTemplateFile(file);
      if (fatal) {
        setError(fatal);
        return;
      }
      const skipped = errors.length > 0
        ? `Bỏ qua ${errors.length} dòng lỗi trong ${file.name}:\n${errors.slice(0, 8).join('\n')}${errors.length > 8 ? `\n… và ${errors.length - 8} dòng khác` : ''}`
        : null;
      if (products.length === 0) {
        setError(skipped ?? `File ${file.name} không có sản phẩm nào.`);
        return;
      }
      const catalog = allProducts.filter((p) => !(p as ManualProductWithId).firebaseId);
      const merged = mergeTemplateImport(catalog, displayedProducts, products);
      const fileInfo = { fileName: file.name, uploadTimestamp: new Date(), fileExportDate: null };
      setAllProducts([...merged.catalog, ...manualProducts]);
      setDisplayedProducts(merged.displayed);
      setFileName(file.name);
      setUploadTimestamp(fileInfo.uploadTimestamp);
      setShowManagerInstructions(false);
      setDuplicateError(false);
      setError(skipped);
      await saveTemplateProducts(merged.catalog, fileInfo);
      await saveDisplayedProducts(merged.displayed, scope);
      toast.success(`Đã nhập ${file.name}: ${merged.added} sản phẩm mới, ${merged.updated} cập nhật`);
    } catch (err) {
      console.error('Không đọc được file mẫu:', err);
      setError(`Không đọc được file ${file.name}. Hãy dùng file tải từ nút Tải file mẫu.`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetLayout = (msp: string, layout: TagLayout) => {
    setDisplayedProducts((current) => current.map((p) => (p.msp === msp ? { ...p, layout } : p)));
  };

  const handleImportList = (entries: ImportEntry[], mode: ImportMode, notFound: string[]) => {
    setDisplayedProducts((current) => applyImport(current, entries, mode));
    setDuplicateError(false);
    setError(notFound.length > 0 ? `Không tìm thấy ${notFound.length} mã sản phẩm: ${notFound.join(', ')}` : null);
    setIsImportOpen(false);
    const tags = entries.reduce((sum, entry) => sum + entry.quantity, 0);
    toast.success(`${mode === 'replace' ? 'Đã thay danh sách bằng' : 'Đã thêm'} ${entries.length} sản phẩm, ${tags} tem`);
  };

  const handleLoadSavedList = (savedItems: SavedListItem[]) => {
    const reconstructedProducts: Product[] = [];
    for (const item of savedItems) {
      const product = allProducts.find(p => p.msp === item.msp);
      if (product) {
        reconstructedProducts.push({ ...product, quantity: item.quantity || 1, layout: item.layout ?? product.layout, selected: false });
      } else if (item.sanPham) {
        // Định dạng cũ: item đã có đủ field Product (không chỉ msp+quantity)
        reconstructedProducts.push({ ...item, selected: false, quantity: item.quantity || 1 } as Product);
      }
    }
    
    if (reconstructedProducts.length > 0) {
      setDisplayedProducts(reconstructedProducts);
      saveDisplayedProducts(reconstructedProducts, scope);
      showAlert(`Đã tải danh sách "${reconstructedProducts.length}" sản phẩm.`);
    } else {
      showAlert('Không tìm thấy dữ liệu chi tiết của các sản phẩm trong danh sách này trên hệ thống.');
    }
  };

  if (isInitializing) {
     return (
        <div className="min-h-dvh flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-600"></div>
        </div>
     );
  }

  return (
    <StickerScopeContext.Provider value={scope}>
    <ErrorBoundary>
      {/* BUG FIX: min-h-screen (100vh) đo theo viewport LỚN NHẤT (lúc thanh địa chỉ trình
          duyệt mobile đã thu gọn) — lúc trang vừa tải/thanh địa chỉ đang hiện, viewport thực tế
          nhỏ hơn 100vh, đẩy thanh công cụ `fixed` của BottomNavigation ra ngoài vùng nhìn thấy
          cho tới khi cuộn để trình duyệt tự thu gọn thanh địa chỉ (bug user báo cáo trên webview
          mobile). min-h-dvh theo dõi đúng viewport ĐANG hiển thị, không bị lệch theo trạng thái
          ẩn/hiện thanh địa chỉ. */}
      <div
        className={`min-h-dvh bg-white text-slate-800 flex flex-col items-center ${isMobile ? 'p-0' : 'p-2 sm:p-3'}`}
        // ĐO THẬT 2026-09-25 (Playwright, 390x844): ở tab Công cụ, nút "In tất cả" nằm cuối khối
        // và bị thanh điều hướng dưới che mất 17px — đệm 24px cũ không đủ cho nút cuối cùng.
        // Tab Công cụ vốn không có thanh "đã chọn" nổi lên nên cứ để đệm rộng hơn cho chắc.
        style={isMobile ? { paddingBottom: selectedCount > 0 ? 'calc(3.5rem + 76px + env(safe-area-inset-bottom, 0px))' : 'calc(3.5rem + 48px + env(safe-area-inset-bottom, 0px))' } : {}}
      >
        <div className="w-full max-w-7xl mx-auto">
          <div className={`flex items-center justify-between gap-2 ${isMobile ? 'sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-slate-200/80 px-3 py-2 shadow-2xs' : 'mb-3 px-1'}`}>
            <div className="flex items-center gap-2 min-w-0">
              {uploadTimestamp && !isMobile && (
                <span className="text-[11px] font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100 shrink-0">
                  Cập nhật: {uploadTimestamp.toLocaleString('vi-VN')}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {isMobile && (
                <Button
                  variant="ghost"
                  size="icon"
                  icon="folder"
                  onClick={handleViewSavedLists}
                  title="Danh sách đã lưu"
                  aria-label="Danh sách đã lưu"
                />
              )}
              <Button
                variant="ghost"
                size="icon"
                icon="info"
                onClick={() => setIsUserGuideOpen(true)}
                title="Hướng dẫn sử dụng"
                aria-label="Hướng dẫn sử dụng"
              />
            </div>
          </div>

          <main className={`flex flex-col lg:flex-row ${isMobile ? 'gap-2' : 'gap-4'}`}>
            <ControlPanel 
              employeeName={employeeName}
              isEditingEmployeeName={isEditingEmployeeName}
              searchQuery={searchQuery}
              suggestions={suggestions}
              showNoResults={showNoResults}
              allProducts={allProducts}
              displayedProducts={displayedProducts}
              isLoading={isLoading}
              fileName={fileName}
              isMobile={isMobile}
              uploadTimestamp={uploadTimestamp}
              userRole="admin"
              onEmployeeNameChange={handleEmployeeNameChange}
              onSaveEmployeeName={handleSaveEmployeeName}
              onEmployeeNameKeyDown={handleEmployeeNameKeyDown}
              onSetIsEditingEmployeeName={setIsEditingEmployeeName}
              onSearchChange={handleSearchInputChange}
              onOpenScanner={() => setIsScannerOpen(true)}
              onSuggestionClick={handleSuggestionClick}
              onSearchSubmit={handleSearchSubmit}
              onFileChange={handleFileChange}
              priceProductCount={priceProductCount}
              onOpenPriceHistory={() => setIsPriceHistoryOpen(true)}
              onOpenPriceSources={() => setIsPriceSourcesOpen(true)}
              onDownloadTemplate={handleDownloadTemplate}
              onTemplateFileChange={handleTemplateFileChange}
              onOpenManualInput={() => setIsManualInputOpen(true)}
              onReset={() => setIsResetConfirmOpen(true)}
              onOpenImport={() => setIsImportOpen(true)}
              onExport={handleExportList}
              onOpenPrintSettings={() => setIsPrintSettingsOpen(true)}
              onPrintSelected={handlePrintSelected}
              onPrintAll={handlePrintAll}
              onSaveList={handleSaveList}
              onViewSavedLists={handleViewSavedLists}
              onOpenUserGuide={() => setIsUserGuideOpen(true)}
              activeTab={activeTab}
              showManagerInstructions={showManagerInstructions}
              onCloseInstructions={() => setShowManagerInstructions(false)}
            />
            <div className={`flex-1 flex flex-col ${isMobile ? 'px-2' : ''} ${isMobile && activeTab === 'tools' ? 'hidden' : ''} lg:min-h-0`}>
              <div className={`${isMobile ? 'space-y-2' : 'space-y-2 lg:sticky lg:top-0 lg:z-20 lg:bg-white lg:pb-2 lg:pt-1 lg:border-b lg:border-slate-100'}`}>
               {isLoading && (
                  <div className="text-center p-4">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-600 mx-auto"></div>
                    <p className="mt-2 text-slate-600">Đang xử lý tệp...</p>
                  </div>
                )}
                {error && (
                  <div className="bg-rose-50 border-rose-200 text-rose-700 border p-4 rounded-popup flex items-center gap-3" role="alert">
                    <AppIcon name="warning" size="lg" className="text-rose-500" />
                    <p className="text-sm font-medium whitespace-pre-line">{error}</p>
                  </div>
                )}
                {duplicateError && (
                    <div className="bg-sky-100 border-l-4 border-sky-500 text-sky-700 p-4 rounded-md" role="alert">
                        <p className="font-bold">Sản phẩm đã có</p>
                        <p>Sản phẩm này đã có trong danh sách kết quả của bạn.</p>
                    </div>
                )}

              {!isMobile && (
                <ProductToolbar
                  sortField={sortField}
                  sortDirection={sortDirection}
                  onSortChange={handleSortChange}
                  searchQuery={searchQuery}
                  onSearchChange={handleSearchInputChange}
                  onOpenScanner={() => setIsScannerOpen(true)}
                  searchDisabled={isLoading}
                  suggestions={suggestions}
                  onSuggestionClick={handleSuggestionClick}
                  onSearchSubmit={handleSearchSubmit}
                  showNoResults={showNoResults}
                  onExportImage={async () => {
                    if (!sortedProducts || sortedProducts.length === 0) {
                      showAlert('Không có sản phẩm nào để xuất ảnh.', 'Thông báo');
                      return;
                    }
                    try {
                      // Kết quả (số ảnh xuất ĐƯỢC, ảnh lỗi) hiện trên bảng tiến trình chung — không mở hộp thoại thứ 2
                      await exportProductsInBatches(sortedProducts, { chunkSize: 50 });
                    } catch (err) {
                      console.error('Export image error:', err);
                      showAlert('Không thể xuất ảnh. Vui lòng thử lại.', 'Lỗi');
                    }
                  }}
                />
              )}
              </div>

              <div ref={productListRef} className={`flex-1 ${isMobile ? 'space-y-2' : 'mt-2'}`}>
              <ResultsDisplay 
                results={sortedProducts} 
                hasData={allProducts.length > 0} 
                highlightedMsp={highlightedMsp}
                onToggleSelect={handleToggleSelect}
                onQuantityChange={handleQuantityChange}
                onSetQuantity={handleSetQuantity}
                onPrintSingle={handlePrintSingle}
                onDelete={handleDeleteProduct}
                onSetLayout={handleSetLayout}
                isMobile={isMobile}
              />
              </div>
            </div>
          </main>
        </div>

        {/* ───────── FLOATING PRINT ACTION BAR TRÊN MOBILE (KHI Ở TAB HOME VÀ CÓ CHỌN SẢN PHẨM) ───────── */}
        {isMobile && activeTab === 'home' && selectedCount > 0 && (
          <div 
            className="fixed left-2 right-2 z-40 bg-slate-900/95 backdrop-blur-md text-white px-3.5 py-2.5 rounded-card shadow-xl border border-slate-700/60 flex items-center justify-between gap-3 animate-in fade-in slide-in-from-bottom-2 duration-200"
            style={{ bottom: 'calc(3.5rem + env(safe-area-inset-bottom, 0px) + 8px)' }}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="flex h-2.5 w-2.5 relative shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-sky-500"></span>
              </span>
              <div className="min-w-0">
                <p className="text-xs font-black text-white truncate">
                  Đã chọn: <span className="text-sky-300">{selectedCount}</span> SP (<span className="text-amber-300">{selectedTotalQty}</span> tem)
                </p>
                <Button
                  type="button"
                  variant="link"
                  size="none"
                  onClick={() => handleToggleAllSelect(false)}
                  className="ycx-hit text-[11px] text-slate-300 hover:text-white underline"
                >
                  Bỏ chọn tất cả
                </Button>
              </div>
            </div>

            <Button
              onClick={handlePrintSelected}
              className="bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-600 hover:to-sky-700 text-white font-black text-xs px-4 py-2.5 rounded-popup flex items-center gap-1.5 shadow-md shadow-sky-500/30 active:scale-95 transition-all shrink-0 border-0 cursor-pointer"
            >
              <AppIcon name="print" size="md" />
              <span>IN NGAY ({selectedCount})</span>
            </Button>
          </div>
        )}

        {isMobile && (
          <BottomNavigation
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onScanClick={() => setIsScannerOpen(true)}
            onSaveListClick={handleSaveList}
            onFilterClick={() => setIsFilterModalOpen(true)}
          />
        )}

        {isFilterModalOpen && (
          <FilterModal
            isOpen={isFilterModalOpen}
            onClose={() => setIsFilterModalOpen(false)}
            sortField={sortField}
            sortDirection={sortDirection}
            onSortChange={handleSortChange}
          />
        )}

        {isScannerOpen && (
          <Scanner
            onScanSuccess={handleScanSuccess}
            onClose={() => setIsScannerOpen(false)}
          />
        )}

        {isPrintSettingsOpen && (
            <PrintSettingsModal
                settings={printSettings}
                onSettingsChange={setPrintSettings}
                onClose={() => setIsPrintSettingsOpen(false)}
            />
        )}
        
        {isLayoutModalOpen && (
            <LayoutSelectionModal
                onSelect={executePrint}
                stickerStyle={printSettings.stickerStyle || 'default'}
                onStickerStyleChange={(style) => setPrintSettings({ ...printSettings, stickerStyle: style })}
                modernPositions={modernPositions}
                onModernPositionsChange={setModernPositions}
                perProduct={scope === 'sticker' ? {
                  products: printList,
                  onSetLayout: handleSetLayout,
                  onPrint: executePrintByLayout,
                } : undefined}
                onClose={cancelPrintSession}
            />
        )}

        {isImportOpen && (
          <ImportListModal
            onClose={() => setIsImportOpen(false)}
            allProducts={allProducts}
            currentCount={displayedProducts.length}
            onImport={handleImportList}
          />
        )}

        {isManualInputOpen && (
          <ManualInputModal
            onClose={() => setIsManualInputOpen(false)}
            onPrintSelected={handleManualPrintSelected}
            onSaveProduct={handleManualSaveBound}
            onDeleteProduct={handleManualDeleteBound}
            onUpdateProduct={handleManualUpdateBound}
            manualProducts={manualProducts}
          />
        )}

        <ConfirmModal
          isOpen={isResetConfirmOpen}
          onClose={() => setIsResetConfirmOpen(false)}
          onConfirm={executeReset}
          title="Xác nhận Xóa"
          message="Bạn có chắc chắn muốn xóa toàn bộ danh sách sản phẩm đang hiển thị không? (Bảng giá đã nạp vẫn được giữ nguyên)"
          confirmText="Xóa"
          cancelText="Hủy"
          type="danger"
        />

        {isActive && (
          <HeaderSlot>
            <div className="border-l border-slate-100 dark:border-slate-700">
              <Button
                variant="ghost"
                size="none"
                onClick={() => setIsClearAllConfirmOpen(true)}
                disabled={isLoading}
                title={scope === 'event' ? 'Xóa toàn bộ dữ liệu bảng giá trên máy này' : 'Xóa toàn bộ sản phẩm đã nhập từ file mẫu'}
                aria-label={scope === 'event' ? 'Xóa toàn bộ dữ liệu bảng giá' : 'Xóa toàn bộ sản phẩm đã nhập'}
                className="relative w-9 h-9 flex items-center justify-center text-rose-500 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
              >
                <AppIcon name="delete" size="md" />
              </Button>
            </div>
          </HeaderSlot>
        )}

        <ConfirmModal
          isOpen={isClearAllConfirmOpen}
          onClose={() => setIsClearAllConfirmOpen(false)}
          onConfirm={executeClearAll}
          title="Xác nhận Xóa Dữ Liệu"
          message={scope === 'event'
            ? 'Hành động này sẽ xóa TOÀN BỘ dữ liệu bảng giá trên máy này. Sản phẩm nhập tay và danh sách đã lưu vẫn còn. Bạn có chắc chắn muốn tiếp tục?'
            : 'Hành động này sẽ xóa TOÀN BỘ sản phẩm đã nhập từ file mẫu và danh sách đang in của tab Sticker. Sản phẩm nhập tay và danh sách đã lưu vẫn còn. Bạn có chắc chắn muốn tiếp tục?'}
          confirmText="Xác nhận Xóa"
          cancelText="Hủy"
          type="danger"
        />

        {isPriceSourcesOpen && (
          <PriceSourcesModal
            onClose={() => setIsPriceSourcesOpen(false)}
            onDeleteSources={handleDeleteSources}
          />
        )}

        {isPriceHistoryOpen && (
          <PriceImportHistoryModal onClose={() => setIsPriceHistoryOpen(false)} />
        )}

        {isSavedListsModalOpen && (
          <SavedListsModal
            onClose={() => setIsSavedListsModalOpen(false)}
            onLoadList={handleLoadSavedList}
          />
        )}

        {isPrinting && (
          <Overlay kind="busy" data-modal-overlay="" className="z-50 bg-slate-900/30 flex flex-col items-center justify-center backdrop-blur-md">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-sky-400"></div>
            <p className="text-white mt-4 text-[17px] font-medium leading-7">Đang chuẩn bị bản in...</p>
          </Overlay>
        )}

        <SaveListModal
          isOpen={isSaveListModalOpen}
          onClose={() => setIsSaveListModalOpen(false)}
          onSave={onConfirmSaveList}
          defaultName={`Danh sách ${new Date().toLocaleDateString('vi-VN')}`}
        />

        <UserGuideModal 
          isOpen={isUserGuideOpen} 
          onClose={() => setIsUserGuideOpen(false)} 
        />

        <AlertModal
          isOpen={alertConfig.isOpen}
          onClose={() => setAlertConfig({ ...alertConfig, isOpen: false })}
          message={alertConfig.message}
          title={alertConfig.title}
        />

      </div>
    </ErrorBoundary>
    </StickerScopeContext.Provider>
  );
}
