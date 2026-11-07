import { useCallback, useRef } from 'react';
import { Product } from '../types';
import { toast } from '../../../components/shared/ui/toast';
import {
  loadPriceImportHistory,
  loadPriceSources,
  parseProductFile,
  savePriceImportHistory,
  savePriceTable,
} from '../services/fileParser';
import {
  appendHistory,
  applyPriceImport,
  dedupeProducts,
  displayFileName,
  fileInfoFor,
  newSourceId,
  removeSources,
} from '../services/priceSources';
import type { PriceImportRecord, PriceSource } from '../services/priceSources';

interface UseStickerEventFileProps {
  setAllProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  setDisplayedProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  setIsLoading: (val: boolean) => void;
  setError: (val: string | null) => void;
  showAlert: (message: string, title?: string) => void;
  fileName: string | null;
  setFileName: (val: string | null) => void;
  uploadTimestamp: Date | null;
  setUploadTimestamp: (val: Date | null) => void;
  fileExportDate: string | null;
  setFileExportDate: (val: string | null) => void;
  manualProducts: Product[];
}

const isManual = (product: Product): boolean => Boolean((product as { firebaseId?: string }).firebaseId);

/** Sản phẩm trong danh sách đang in lấy giá mới, giữ số tem và trạng thái chọn. Sản phẩm nhập tay không đổi. */
const refreshDisplayed = (list: Product[], incoming: Map<string, Product>): Product[] => {
  let changed = false;
  const next = list.map((item) => {
    if (isManual(item)) return item;
    const fresh = incoming.get(item.msp);
    if (!fresh) return item;
    changed = true;
    return { ...fresh, selected: item.selected, quantity: item.quantity };
  });
  return changed ? next : list;
};

const vi = (n: number) => n.toLocaleString('vi-VN');

export function useStickerEventFile({
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
}: UseStickerEventFileProps) {
  // Bản mới nhất, để nhập ngay sau khi thêm sản phẩm nhập tay không dùng danh sách cũ
  const manualRef = useRef(manualProducts);
  manualRef.current = manualProducts;

  /** Đưa bảng giá mới lên màn hình và ghi xuống máy. */
  const commitPriceTable = useCallback(async (sources: PriceSource[], products: Product[]) => {
    const info = fileInfoFor(sources);
    // Sản phẩm nhập tay không nằm trong file giá: giữ lại để vẫn tìm được
    setAllProducts([...products, ...manualRef.current]);
    setFileName(displayFileName(sources));
    setUploadTimestamp(info?.uploadTimestamp ?? null);
    setFileExportDate(info?.fileExportDate ?? null);
    await savePriceTable(products, info, sources);
  }, [setAllProducts, setFileExportDate, setFileName, setUploadTimestamp]);

  const handleFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    const files = input.files ? Array.from(input.files) : [];
    if (files.length === 0) return;

    setIsLoading(true);
    setError(null);
    try {
      const now = Date.now();
      const importedAt = new Date(now).toISOString();
      const newSources: PriceSource[] = [];
      const failedFiles: string[] = [];

      for (const [index, file] of files.entries()) {
        try {
          const { products, exportDate } = await parseProductFile(file);
          const unique = dedupeProducts(products);
          if (unique.length === 0) {
            failedFiles.push(file.name);
            continue;
          }
          newSources.push({
            id: newSourceId(now, index),
            fileName: file.name,
            importedAt,
            exportDate: exportDate && exportDate !== 'N/A' ? exportDate : null,
            products: unique,
          });
        } catch (fileParseError) {
          console.error(`Lỗi khi xử lý tệp ${file.name}:`, fileParseError);
          failedFiles.push(file.name);
        }
      }

      if (newSources.length === 0) {
        setError(files.length === 1
          ? `Không đọc được sản phẩm nào trong tệp '${files[0].name}'. Vui lòng kiểm tra lại định dạng tệp. Bảng giá cũ vẫn giữ nguyên.`
          : 'Không đọc được sản phẩm nào trong các tệp đã chọn. Vui lòng kiểm tra lại định dạng tệp. Bảng giá cũ vẫn giữ nguyên.');
        return;
      }
      if (failedFiles.length > 0) {
        setError(`Không đọc được ${failedFiles.length === 1 ? `tệp '${failedFiles[0]}'` : `${failedFiles.length} tệp: ${failedFiles.join(', ')}`}. Các tệp hợp lệ khác đã được nhập.`);
      }

      const outcome = applyPriceImport(await loadPriceSources(), newSources);
      await commitPriceTable(outcome.sources, outcome.products);
      setDisplayedProducts((current) => refreshDisplayed(current, outcome.incoming));

      const record: PriceImportRecord = {
        id: `nhap_${now}`,
        importedAt,
        files: newSources.map((s) => ({ sourceId: s.id, fileName: s.fileName, productCount: s.products.length })),
        failedFiles,
        added: outcome.added,
        updated: outcome.updated,
        unchanged: outcome.unchanged,
        totalAfter: outcome.products.length,
      };
      try {
        await savePriceImportHistory(appendHistory(await loadPriceImportHistory(), record));
      } catch (historyError) {
        // Bảng giá đã lưu xong, thiếu một dòng lịch sử không đáng chặn việc in
        console.error('Không ghi được lịch sử nhập bảng giá:', historyError);
      }

      const parts = [`${vi(outcome.added.length)} sản phẩm mới`, `${vi(outcome.updated.length)} cập nhật giá`];
      if (outcome.unchanged > 0) parts.push(`${vi(outcome.unchanged)} không đổi`);
      toast.success(`Đã nhập ${newSources.length === 1 ? newSources[0].fileName : `${newSources.length} tệp`}: ${parts.join(', ')}`);
    } catch (err) {
      setError('Đã xảy ra lỗi không mong muốn. Bảng giá cũ vẫn giữ nguyên, vui lòng thử lại.');
      console.error(err);
    } finally {
      setIsLoading(false);
      input.value = '';
    }
  }, [commitPriceTable, setDisplayedProducts, setError, setIsLoading]);

  /** Xoá từng file khỏi bảng giá. Danh sách đang in giữ nguyên. Trả về số sản phẩm còn lại trong bảng giá. */
  const handleDeleteSources = useCallback(async (ids: string[]): Promise<number> => {
    const { sources, products } = removeSources(await loadPriceSources(), ids);
    await commitPriceTable(sources, products);
    return products.length;
  }, [commitPriceTable]);

  return {
    fileName,
    setFileName,
    uploadTimestamp,
    setUploadTimestamp,
    fileExportDate,
    setFileExportDate,
    handleFileChange,
    handleDeleteSources,
  };
}
