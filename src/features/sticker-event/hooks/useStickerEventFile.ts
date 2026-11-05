import { useState, useCallback } from 'react';
import { Product } from '../types';
import { parseProductFile, saveData } from '../services/fileParser';

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

  const handleFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      setIsLoading(true);
      setError(null);
      setAllProducts([]);
      setDisplayedProducts([]);
      setFileName(null);
      setUploadTimestamp(null);
      setFileExportDate(null);
      
      try {
        let latestExportDate: string | null = null;
        const fileNames: string[] = [];
        const productMap = new Map<string, Product>();
        let partialError = null;

        for (const file of files) {
          fileNames.push(file.name);
          try {
            const { products, exportDate } = await parseProductFile(file);
            for (const product of products) {
              if (!productMap.has(product.msp)) {
                productMap.set(product.msp, product);
              }
            }
            if (!latestExportDate || (exportDate && exportDate > latestExportDate)) {
              latestExportDate = exportDate;
            }
          } catch (fileParseError) {
            console.error(`Lỗi khi xử lý tệp ${file.name}:`, fileParseError);
            partialError = `Lỗi khi xử lý tệp '${file.name}'. Các tệp hợp lệ khác đã được tải lên.`;
          }
        }

        const combinedProducts = Array.from(productMap.values());
        if (combinedProducts.length === 0 && partialError) {
            setError(partialError || 'Không có sản phẩm nào được tải lên. Vui lòng kiểm tra lại định dạng tệp.');
            setIsLoading(false);
            if (event.target) event.target.value = '';
            return;
        } else if (partialError) {
            setError(partialError);
        }

        const newUploadTimestamp = new Date();
        // Sản phẩm nhập tay không nằm trong file giá: giữ lại để vẫn tìm được
        setAllProducts([...combinedProducts, ...manualProducts]);

        const fileNamesForStorage = fileNames.join(', ');
        let displayFileName: string | null = null;
        if (fileNames.length === 1) {
            displayFileName = fileNames[0];
        } else if (fileNames.length > 1) {
            displayFileName = `${fileNames.length} tệp đã được tải lên`;
        }
        setFileName(displayFileName);
        setUploadTimestamp(newUploadTimestamp);
        setFileExportDate(latestExportDate);
        
        await saveData(combinedProducts, {
          fileName: fileNamesForStorage,
          uploadTimestamp: newUploadTimestamp,
          fileExportDate: latestExportDate
        });

      } catch (err) {
        setError('Đã xảy ra lỗi không mong muốn. Vui lòng thử lại.');
        console.error(err);
      } finally {
        setIsLoading(false);
        if (event.target) {
            event.target.value = '';
        }
      }
    }
  }, [setIsLoading, setError, setDisplayedProducts, setAllProducts, fileName, fileExportDate, manualProducts]);

  return {
    fileName,
    setFileName,
    uploadTimestamp,
    setUploadTimestamp,
    fileExportDate,
    setFileExportDate,
    handleFileChange,
  };
}
