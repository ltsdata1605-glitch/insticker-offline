import { useCallback, useRef } from 'react';
import { Product, ManualProductDoc } from '../types';
import { ManualProductWithId } from '../ManualInputModal';
import {
  clearPriceData,
  loadManualProducts,
  saveDisplayedProducts,
  saveManualProducts,
} from '../services/fileParser';

interface UseStickerEventDbProps {
  employeeName: string;
  setDisplayedProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  setIsLoading: (val: boolean) => void;
  setError: (val: string | null) => void;
  showAlert: (message: string, title?: string) => void;
  setFileName: (val: string | null) => void;
  setFileExportDate: (val: string | null) => void;
  setUploadTimestamp: (val: Date | null) => void;
  setAllProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  manualProducts: ManualProductWithId[];
  setManualProducts: React.Dispatch<React.SetStateAction<ManualProductWithId[]>>;
}

const toManualProduct = (doc: ManualProductDoc): ManualProductWithId => ({
  sanPham: doc.sanPham,
  msp: doc.msp,
  giaGoc: doc.giaGoc,
  giaGiam: doc.giaGiam,
  thuongERP: doc.thuongERP,
  thuongNong: doc.thuongNong,
  tongThuong: doc.tongThuong,
  khuyenMai: doc.khuyenMai,
  ngayIn: doc.ngayIn,
  selected: false,
  quantity: 1,
  firebaseId: doc.id,
});

const toManualDoc = (product: ManualProductWithId, createdBy: string): ManualProductDoc => {
  const now = new Date().toISOString();
  return {
    id: product.firebaseId as string,
    sanPham: product.sanPham,
    msp: product.msp,
    giaGoc: product.giaGoc,
    giaGiam: product.giaGiam,
    thuongERP: product.thuongERP,
    thuongNong: product.thuongNong,
    tongThuong: product.tongThuong,
    khuyenMai: product.khuyenMai,
    ngayIn: product.ngayIn,
    createdBy,
    createdAt: now,
    updatedAt: now,
  };
};

const isManual = (product: Product): boolean => Boolean((product as ManualProductWithId).firebaseId);

/**
 * Sản phẩm nhập tay và thao tác xoá dữ liệu. Bản web ghi Firestore theo mã kho, app offline ghi trên máy.
 * Trường `firebaseId` giữ nguyên tên để các màn chép từ web không phải đổi; ở đây nó là mã cục bộ.
 */
export function useStickerEventDb({
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
}: UseStickerEventDbProps) {
  // Bản mới nhất để hai thao tác liên tiếp không ghi đè nhau bằng dữ liệu cũ
  const manualRef = useRef(manualProducts);
  manualRef.current = manualProducts;

  const persist = useCallback(async (next: ManualProductWithId[]) => {
    manualRef.current = next;
    try {
      await saveManualProducts(next.map((p) => toManualDoc(p, employeeName || 'Không tên')));
    } catch (err) {
      console.error('Không lưu được sản phẩm nhập tay:', err);
      showAlert('Chưa lưu được sản phẩm nhập tay vào máy. Hãy thử lại.', 'Lưu thất bại');
    }
  }, [employeeName, showAlert]);

  const loadStoredManualProducts = useCallback(async () => {
    const docs = await loadManualProducts();
    const products = docs.map(toManualProduct);
    manualRef.current = products;
    setManualProducts(products);
    setAllProducts((prev) => [...prev.filter((p) => !isManual(p)), ...products]);
  }, [setAllProducts, setManualProducts]);

  const handleManualSave = useCallback(async (product: ManualProductWithId): Promise<string> => {
    const id = `manual_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const created: ManualProductWithId = { ...product, firebaseId: id };
    const next = [...manualRef.current, created];

    setManualProducts(next);
    setAllProducts((prev) => [...prev, created]);
    setDisplayedProducts((prev) => {
      const updated = [{ ...created, selected: false, quantity: created.quantity || 1 }, ...prev];
      saveDisplayedProducts(updated).catch(console.error);
      return updated;
    });

    await persist(next);
    return id;
  }, [persist, setAllProducts, setDisplayedProducts, setManualProducts]);

  const handleManualDelete = useCallback(async (id: string) => {
    const next = manualRef.current.filter((p) => p.firebaseId !== id);

    setManualProducts(next);
    setAllProducts((prev) => prev.filter((p) => (p as ManualProductWithId).firebaseId !== id));
    setDisplayedProducts((prev) => {
      const updated = prev.filter((p) => (p as ManualProductWithId).firebaseId !== id);
      saveDisplayedProducts(updated).catch(console.error);
      return updated;
    });

    await persist(next);
  }, [persist, setAllProducts, setDisplayedProducts, setManualProducts]);

  const handleManualUpdate = useCallback(async (product: ManualProductWithId) => {
    if (!product.firebaseId) return;
    const next = manualRef.current.map((p) => (p.firebaseId === product.firebaseId ? product : p));

    setManualProducts(next);
    setAllProducts((prev) => prev.map((p) => ((p as ManualProductWithId).firebaseId === product.firebaseId ? product : p)));

    await persist(next);
  }, [persist, setAllProducts, setManualProducts]);

  const executeClearAll = useCallback(async () => {
    setIsLoading(true);
    try {
      await clearPriceData();
      // Sản phẩm nhập tay không thuộc bảng giá nên vẫn còn và vẫn tìm được
      setAllProducts(manualRef.current);
      setDisplayedProducts([]);
      setFileName(null);
      setUploadTimestamp(null);
      setFileExportDate(null);
      showAlert('Đã xóa toàn bộ dữ liệu bảng giá.');
    } catch (err) {
      console.error(err);
      setError('Lỗi khi xóa dữ liệu.');
    } finally {
      setIsLoading(false);
    }
  }, [setAllProducts, setDisplayedProducts, setError, setFileExportDate, setFileName, setIsLoading, setUploadTimestamp, showAlert]);

  return {
    loadStoredManualProducts,
    handleManualSave,
    handleManualDelete,
    handleManualUpdate,
    executeClearAll,
  };
}
