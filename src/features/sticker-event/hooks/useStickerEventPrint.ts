import { useState, useEffect } from 'react';
import { Product } from '../types';
import { PrintSettings, DEFAULT_PRINT_SETTINGS, defaultModernPositions, ModernLayoutPositions, printPriceTags, restorePrintSettings } from '../services/printService';
import { getSetting, saveSetting } from '../services/dbService';

interface UseStickerEventPrintProps {
  employeeName: string;
  displayedProducts: Product[];
  setError: (val: string | null) => void;
}

const sortForPrint = (products: Product[], settings: PrintSettings): Product[] =>
  settings.sortByName
    ? [...products].sort((a, b) => a.sanPham.localeCompare(b.sanPham, 'vi', { sensitivity: 'base' }))
    : products;

export function useStickerEventPrint({
  employeeName,
  displayedProducts,
  setError,
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

  const [printSettings, setPrintSettings] = useState<PrintSettings>(DEFAULT_PRINT_SETTINGS);
  const [isPrintSettingsLoaded, setIsPrintSettingsLoaded] = useState(false);

  useEffect(() => {
      getSetting<Partial<PrintSettings>>('printSettings').then(savedSettings => {
          if (savedSettings) setPrintSettings(restorePrintSettings(savedSettings));
          setIsPrintSettingsLoaded(true);
      });
  }, []);

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

  /** Sản phẩm của lượt in đang chọn bố cục. */
  const printList = (): Product[] => {
    if (productToPrint) return [productToPrint];
    if (printAction === 'all') return displayedProducts;
    if (printAction === 'selected') return displayedProducts.filter((p) => p.selected);
    if (printAction === 'manual') return productsForPrintingSession;
    return [];
  };

  const finishPrintSession = () => {
    setIsLayoutModalOpen(false);
    setPrintAction(null);
    setProductToPrint(null);
    setProductsForPrintingSession([]);
  };

  const executePrint = async (tagsPerPage: PrintSettings['tagsPerPage']) => {
    const settingsWithLayout = { ...printSettings, tagsPerPage };
    const productsToPrintList = sortForPrint(printList(), settingsWithLayout);
  
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
    executePrint,
    /** Đóng hộp chọn bố cục và bỏ lượt in đang chờ, để lần in sau không in nhầm sản phẩm của lượt này. */
    cancelPrintSession: finishPrintSession,
  };
}
