import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Product } from '../types';
import { saveEmployeeName, parseCurrency, saveDisplayedProducts } from '../services/fileParser';
import { SortField, SortDirection } from '../ProductToolbar';

/** Lưu danh sách đang hiển thị xuống máy sau khi người dùng ngừng thao tác. */
const LOCAL_SAVE_DEBOUNCE_MS = 1000;

interface UseStickerEventStateProps {
  isInitializing: boolean;
  allProducts: Product[];
}

export function useStickerEventState({
  isInitializing,
  allProducts,
}: UseStickerEventStateProps) {
  const [displayedProducts, setDisplayedProducts] = useState<Product[]>([]);
  const [sortField, setSortField] = useState<SortField>('none');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Product[]>([]);
  const [showNoResults, setShowNoResults] = useState(false);
  const [duplicateError, setDuplicateError] = useState<boolean>(false);
  const [highlightedMsp, setHighlightedMsp] = useState<string | null>(null);
  const [employeeName, setEmployeeName] = useState('');
  const [isEditingEmployeeName, setIsEditingEmployeeName] = useState(false);
  const [activeTab, setActiveTab] = useState<'home' | 'tools'>('home');
  const [alertConfig, setAlertConfig] = useState<{ isOpen: boolean; message: string; title?: string }>({
    isOpen: false,
    message: '',
    title: 'Thông báo'
  });

  const debounceTimeout = useRef<number | null>(null);
  const highlightTimeoutRef = useRef<number | null>(null);
  const saveDisplayedProductsTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
      if (saveDisplayedProductsTimeoutRef.current) clearTimeout(saveDisplayedProductsTimeoutRef.current);
    };
  }, []);

  const showAlert = useCallback((message: string, title: string = "Thông báo") => {
    setAlertConfig({ isOpen: true, message, title });
  }, []);

  const handleEmployeeNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEmployeeName(e.target.value);
  };
  
  const handleSaveEmployeeName = useCallback(() => {
    const trimmedName = employeeName.trim();
    setEmployeeName(trimmedName);
    saveEmployeeName(trimmedName);
    if (trimmedName) {
      setIsEditingEmployeeName(false);
    }
  }, [employeeName]);
  
  const handleEmployeeNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
    }
  };

  // Pre-indexed search keys for fast lookup & early-break iteration (tránh gọi toLowerCase hàng chục nghìn lần khi gõ phím)
  const searchableProducts = useMemo(() => {
    return allProducts.map(p => ({
      product: p,
      searchKey: `${(p.msp || '').trim().toLowerCase()} ${(p.sanPham || '').trim().toLowerCase()}`
    }));
  }, [allProducts]);

  // Autocomplete Suggestions
  useEffect(() => {
    if (debounceTimeout.current) {
      clearTimeout(debounceTimeout.current);
    }

    const queryStr = searchQuery.trim().toLowerCase();
    if (!queryStr) {
      setSuggestions([]);
      setShowNoResults(false);
      return;
    }

    // Tối ưu tốc độ: Tìm kiếm có điểm dừng sớm (early break khi đủ 10 kết quả)
    // Giảm debounce xuống 100ms giúp hiển thị gợi ý tức thì, không gây lag bàn phím
    debounceTimeout.current = window.setTimeout(() => {
      const results: Product[] = [];
      const len = searchableProducts.length;
      for (let i = 0; i < len; i++) {
        if (searchableProducts[i].searchKey.includes(queryStr)) {
          results.push(searchableProducts[i].product);
          if (results.length >= 10) break;
        }
      }
      
      setSuggestions(results);
      setShowNoResults(queryStr.length > 0 && results.length === 0);
    }, 100);

    return () => {
      if (debounceTimeout.current) {
        clearTimeout(debounceTimeout.current);
      }
    };
  }, [searchQuery, searchableProducts]);

  const handleSearchInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setDuplicateError(false);
    setShowNoResults(false);
  };
  
  const handleSuggestionClick = (product: Product) => {
    setDuplicateError(false);
    const existingMspSet = new Set(displayedProducts.map(p => p.msp));
    
    if (existingMspSet.has(product.msp)) {
        setDuplicateError(true);
        const mspToHighlight = product.msp;
        setHighlightedMsp(mspToHighlight);
        
        const element = document.querySelector(`[data-msp="${mspToHighlight}"]`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
        highlightTimeoutRef.current = window.setTimeout(() => {
            setHighlightedMsp(null);
        }, 2000);
    } else {
        setDisplayedProducts(prevProducts => [{...product, selected: false, quantity: 1}, ...prevProducts]);
    }
    setSearchQuery('');
    setSuggestions([]);
    setShowNoResults(false);
  };

  const handleScanSuccess = useCallback((scannedCode: string): boolean => {
    const product = allProducts.find(p => p.msp === scannedCode);

    if (!product) {
      return false;
    }

    setDisplayedProducts(prevProducts => {
      const existingProductIndex = prevProducts.findIndex(p => p.msp === scannedCode);

      if (existingProductIndex > -1) {
        const newProducts = [...prevProducts];
        const existingProduct = newProducts[existingProductIndex];
        newProducts[existingProductIndex] = { ...existingProduct, quantity: existingProduct.quantity + 1 };
        return newProducts;
      } else {
        return [{ ...product, selected: false, quantity: 1 }, ...prevProducts];
      }
    });
    
    return true;
  }, [allProducts]);

  const handleToggleSelect = useCallback((msp: string) => {
    setDisplayedProducts(prev =>
      prev.map(p => (p.msp === msp ? { ...p, selected: !p.selected } : p))
    );
  }, []);

  const handleToggleAllSelect = useCallback((select: boolean) => {
    setDisplayedProducts(prev => prev.map(p => ({ ...p, selected: select })));
  }, []);

  const handleQuantityChange = useCallback((msp: string, delta: number) => {
    setDisplayedProducts(prev =>
      prev.map(p =>
        p.msp === msp
          ? { ...p, quantity: Math.max(1, p.quantity + delta) }
          : p
      )
    );
  }, []);

  const handleSetQuantity = useCallback((msp: string, newQuantity: number) => {
    const qty = Math.max(1, Math.floor(newQuantity));
    setDisplayedProducts(prev =>
      prev.map(p => (p.msp === msp ? { ...p, quantity: qty } : p))
    );
  }, []);

  const handleDeleteProduct = useCallback((msp: string) => {
    setDisplayedProducts(prev => prev.filter(p => p.msp !== msp));
  }, []);

  const executeReset = useCallback(async () => {
    setDisplayedProducts([]);
    saveDisplayedProducts([]);
    setSearchQuery('');
    setSuggestions([]);
    setShowNoResults(false);
    setDuplicateError(false);
    setError(null);
  }, []);

  const handleSortChange = useCallback((field: SortField, direction: SortDirection) => {
    setSortField(field);
    setSortDirection(direction);
  }, []);

  // Lưu danh sách đang hiển thị xuống máy. Giữ lượt lưu ngay khi đóng app hoặc ẩn cửa sổ để không mất thao tác cuối.
  useEffect(() => {
    if (isInitializing) return;

    if (saveDisplayedProductsTimeoutRef.current) clearTimeout(saveDisplayedProductsTimeoutRef.current);
    saveDisplayedProductsTimeoutRef.current = window.setTimeout(() => {
      saveDisplayedProducts(displayedProducts).catch(console.error);
    }, LOCAL_SAVE_DEBOUNCE_MS);

    const handleFlushSave = () => {
      saveDisplayedProducts(displayedProducts).catch(console.error);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') handleFlushSave();
    };

    window.addEventListener('beforeunload', handleFlushSave);
    window.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (saveDisplayedProductsTimeoutRef.current) clearTimeout(saveDisplayedProductsTimeoutRef.current);
      window.removeEventListener('beforeunload', handleFlushSave);
      window.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [displayedProducts, isInitializing]);

  // Sorted Products Memo
  const sortedProducts = useMemo(() => {
    if (sortField === 'none') return displayedProducts;

    return [...displayedProducts].sort((a, b) => {
      let valA: number | string = 0;
      let valB: number | string = 0;

      switch (sortField) {
        case 'giaGoc':
          valA = parseCurrency(a.giaGoc);
          valB = parseCurrency(b.giaGoc);
          break;
        case 'giaGiam':
          valA = parseCurrency(a.giaGiam);
          valB = parseCurrency(b.giaGiam);
          break;
        case 'tongThuong':
          valA = a.tongThuong;
          valB = b.tongThuong;
          break;
        case 'discount': {
          const gocA = parseCurrency(a.giaGoc);
          const giamA = parseCurrency(a.giaGiam);
          valA = gocA > 0 ? ((gocA - giamA) / gocA) * 100 : 0;
          const gocB = parseCurrency(b.giaGoc);
          const giamB = parseCurrency(b.giaGiam);
          valB = gocB > 0 ? ((gocB - giamB) / gocB) * 100 : 0;
          break;
        }
        case 'sanPham':
          valA = a.sanPham.toLowerCase();
          valB = b.sanPham.toLowerCase();
          break;
      }

      if (typeof valA === 'string' && typeof valB === 'string') {
        return sortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return sortDirection === 'asc' ? (valA as number) - (valB as number) : (valB as number) - (valA as number);
    });
  }, [displayedProducts, sortField, sortDirection]);

  return {
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
    handleScanSuccess,
    handleToggleSelect,
    handleToggleAllSelect,
    handleQuantityChange,
    handleSetQuantity,
    handleDeleteProduct,
    executeReset,
    handleSortChange,
    sortedProducts,
  };
}
