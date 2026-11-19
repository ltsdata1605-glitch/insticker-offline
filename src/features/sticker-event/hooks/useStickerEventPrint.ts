import { useState, useEffect, useMemo } from 'react';
import { Product } from '../types';
import type { TagLayout } from '../types';
import { PrintSettings, defaultModernPositions, ModernLayoutPositions, printPriceTags } from '../services/printService';
import { getSetting, saveSetting } from '../services/dbService';
import { groupByLayout } from '../services/tagLayouts';
import { normalizeTagQuantity } from '../utils/format';
import { waitForPrintPreviewClosed } from '../../../platform/printPreview';
import type { StickerScope } from '../services/scope';

interface UseStickerEventPrintProps {
  employeeName: string;
  displayedProducts: Product[];
  setError: (val: string | null) => void;
  scope: StickerScope;
}

const sortForPrint = (products: Product[], settings: PrintSettings): Product[] =>
  settings.sortByName
    ? [...products].sort((a, b) => a.sanPham.localeCompare(b.sanPham, 'vi', { sensitivity: 'base' }))
    : products;

export function useStickerEventPrint({
  employeeName,
  displayedProducts,
  setError,
  scope,
}: UseStickerEventPrintProps) {
  const [isPrinting, setIsPrinting] = useState<boolean>(false);
  
  const [isPrintSettingsOpen, setIsPrintSettingsOpen] = useState(false);
  const [isLayoutModalOpen, setIsLayoutModalOpen] = useState(false);
  
  const [printAction, setPrintAction] = useState<'selected' | 'all' | 'manual' | null>(null);
  const [productToPrint, setProductToPrint] = useState<Product | null>(null);
  const [productsForPrintingSession, setProductsForPrintingSession] = useState<Product[]>([]);

  const [modernPositions, setModernPositions] = useState<ModernLayoutPositions>(defaultModernPositions);
  const [isModernPositionsLoaded, setIsModernPositionsLoaded] = useState(false);

  useEffect(() => {
    getSetting<ModernLayoutPositions>('modernPositions').then(saved => {
        if (saved) setModernPositions(saved);
        setIsModernPositionsLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (isModernPositionsLoaded) {
        saveSetting('modernPositions', modernPositions);
    }
  }, [modernPositions, isModernPositionsLoaded]);

  const masterDefaults: PrintSettings = useMemo(() => ({
      showOriginalPrice: true,
      showPromotion: true,
      showBonus: true,
      showQrCode: true,
      showEmployeeName: true,
      sortByName: true,
      shortenPrice: true,
      tagsPerPage: 4,
      customFontData: null,
      customFontName: null,
      customSecondaryFontData: null,
      customSecondaryFontName: null,
      stickerStyle: 'default'
  }), []);

  const [printSettings, setPrintSettings] = useState<PrintSettings>(masterDefaults);
  const [isPrintSettingsLoaded, setIsPrintSettingsLoaded] = useState(false);

  useEffect(() => {
      getSetting<Partial<PrintSettings>>('printSettings').then(savedSettings => {
          if (savedSettings) {
              setPrintSettings({
                  ...masterDefaults,
                  shortenPrice: typeof savedSettings.shortenPrice === 'boolean' ? savedSettings.shortenPrice : masterDefaults.shortenPrice,
                  tagsPerPage: savedSettings.tagsPerPage || masterDefaults.tagsPerPage,
                  customFontData: savedSettings.customFontData || null,
                  customFontName: savedSettings.customFontName || null,
                  customSecondaryFontData: savedSettings.customSecondaryFontData || null,
                  customSecondaryFontName: savedSettings.customSecondaryFontName || null,
                  stickerStyle: savedSettings.stickerStyle || 'default'
              });
          }
          setIsPrintSettingsLoaded(true);
      });
  }, [masterDefaults]);

  useEffect(() => {
    if (isPrintSettingsLoaded) {
        saveSetting('printSettings', printSettings).catch(e => {
            console.error("Could not save print settings to IndexedDB", e);
        });
    }
  }, [printSettings, isPrintSettingsLoaded]);

  const handlePrintSingle = (product: Product) => {
    setProductToPrint(product);
    setIsLayoutModalOpen(true);
  };

  const handlePrintSelected = () => {
    const selectedProducts = displayedProducts.filter(p => p.selected);
    if (selectedProducts.length > 0) {
      setPrintAction('selected');
      setIsLayoutModalOpen(true);
    }
  };

  const handlePrintAll = () => {
    if (displayedProducts.length > 0) {
      setPrintAction('all');
      setIsLayoutModalOpen(true);
    }
  };

  const handleManualPrintSelected = (products: Product[]) => {
    const validProducts = products.filter(p => !!(p && p.msp && typeof p.msp === 'string' && p.msp.trim() !== ''));
    setProductsForPrintingSession(validProducts);
    setPrintAction('manual');
    setIsLayoutModalOpen(true);
  };

  /** Sản phẩm của lượt in đang chọn bố cục. Một sản phẩm thì lấy bản mới nhất trong danh sách để thấy bố cục vừa sửa. */
  const printList = useMemo((): Product[] => {
    if (productToPrint) return [displayedProducts.find((p) => p.msp === productToPrint.msp) ?? productToPrint];
    if (printAction === 'all') return displayedProducts;
    if (printAction === 'selected') return displayedProducts.filter((p) => p.selected);
    if (printAction === 'manual') return productsForPrintingSession;
    return [];
  }, [displayedProducts, printAction, productToPrint, productsForPrintingSession]);

  // Tab Sticker không có thưởng
  const effectiveSettings = (tagsPerPage: PrintSettings['tagsPerPage']): PrintSettings =>
    ({ ...printSettings, tagsPerPage, ...(scope === 'sticker' ? { showBonus: false } : {}) });

  const finishPrintSession = () => {
    setIsLayoutModalOpen(false);
    setPrintAction(null);
    setProductToPrint(null);
    setProductsForPrintingSession([]);
  };

  const executePrint = async (tagsPerPage: PrintSettings['tagsPerPage']) => {
    const settingsWithLayout = effectiveSettings(tagsPerPage);
    const productsToPrintList = sortForPrint(printList, settingsWithLayout);
  
    if (productsToPrintList.length > 0) {
      setIsPrinting(true);
      try {
        await printPriceTags(productsToPrintList, employeeName, settingsWithLayout);
      } catch (e) {
        console.error(e);
        setError("Không thể tạo tệp. Vui lòng thử lại.");
      } finally {
        setIsPrinting(false);
      }
    }
  
    finishPrintSession();
  };

  /**
   * Tab Sticker: mỗi sản phẩm in theo bố cục của nó. Các bố cục khác khổ giấy (ngang, dọc) nên không gộp được vào một lệnh in:
   * mỗi bố cục một lượt, lượt sau mở khi màn xem trước của lượt trước đóng lại.
   */
  const executePrintByLayout = async (layoutByMsp: Record<string, TagLayout>) => {
    const products = printList.map((p) => (layoutByMsp[p.msp] ? { ...p, layout: layoutByMsp[p.msp] } : p));
    const groups = groupByLayout(products);
    finishPrintSession();

    for (const [index, group] of groups.entries()) {
      const settingsWithLayout = effectiveSettings(group.layout);
      const tags = group.items.reduce((sum, p) => sum + normalizeTagQuantity(p.quantity), 0);
      const label = `${group.layout} sticker/trang`;
      const note = groups.length > 1
        ? `Lượt ${index + 1}/${groups.length}: ${label}, ${group.items.length} sản phẩm, ${tags} tem.${index + 1 < groups.length ? ' In xong hoặc đóng màn này thì lượt sau tự mở.' : ''}`
        : `${label}, ${group.items.length} sản phẩm, ${tags} tem.`;
      setIsPrinting(true);
      try {
        await printPriceTags(sortForPrint(group.items, settingsWithLayout), employeeName, settingsWithLayout, {
          title: `In Sticker ${label}`,
          note,
        });
      } catch (e) {
        console.error(e);
        setError("Không thể tạo tệp. Vui lòng thử lại.");
        return;
      } finally {
        setIsPrinting(false);
      }
      if (index + 1 < groups.length) await waitForPrintPreviewClosed();
    }
  };

  return {
    printSettings,
    setPrintSettings,
    modernPositions,
    setModernPositions,
    isPrinting,
    isPrintSettingsOpen,
    setIsPrintSettingsOpen,
    isLayoutModalOpen,
    setIsLayoutModalOpen,
    printAction,
    productToPrint,
    handlePrintSingle,
    handlePrintSelected,
    handlePrintAll,
    handleManualPrintSelected,
    printList,
    executePrint,
    executePrintByLayout,
    /** Đóng hộp chọn bố cục và bỏ lượt in đang chờ, để lần in sau không in nhầm sản phẩm của lượt này. */
    cancelPrintSession: finishPrintSession,
  };
}
