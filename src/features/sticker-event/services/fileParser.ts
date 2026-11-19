import { Product, ManualProductDoc } from '../types';
import { areLocalWritesFrozen } from '../../../platform/localWriteGuard';
import { legacySource } from './priceSources';
import type { PriceImportRecord, PriceSource } from './priceSources';

function parseBonus(bonusCode: string | undefined | null): { thuongERP: number; thuongNong: number } {
  if (!bonusCode || typeof bonusCode !== 'string') {
    return { thuongERP: 0, thuongNong: 0 };
  }
  
  // Strip any leading non-digit characters to handle prefixes like 'ĐD'
  const cleanedCode = bonusCode.trim().replace(/^[^\d]*/, '');

  // Regex to capture: 1. initial digits (ERP), 2. letters (brand), 3. subsequent digits (Hot Bonus), 4. the rest
  const regex = /^(\d+)([A-Z]+)(\d*)?(.*)?$/;
  const matches = cleanedCode.match(regex);

  if (!matches) {
    return { thuongERP: 0, thuongNong: 0 };
  }

  const erpPoints = parseInt(matches[1] || '0', 10);
  const hotBonusPoints = parseInt(matches[3] || '0', 10);

  return {
    thuongERP: erpPoints * 1000,
    thuongNong: hotBonusPoints * 1000,
  };
}

export function parseCurrency(value: string | number | undefined | null): number {
  if (typeof value === 'number') {
    return value;
  }
  if (!value || typeof value !== 'string') {
    return 0;
  }
  // Removes currency symbols, commas, and any non-digit characters.
  const numericString = value.replace(/[^\d]/g, '');
  return parseInt(numericString, 10) || 0;
}


import { formatCurrency } from '../utils/format';

// Helper function to check if a value looks like a valid MSP (mostly digits, length > 3)
const isValidMsp = (value: unknown): boolean => {
    if (!value) return false;
    const str = String(value).trim();
    // Must be at least 4 chars and contain at least one digit to be a product code
    return str.length >= 4 && /\d/.test(str);
};

export const parseProductFile = (file: File): Promise<{ products: Product[], exportDate: string }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = async (e: ProgressEvent<FileReader>) => {
      try {
        const data = e.target?.result;
        const XLSX = await import('xlsx');
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        // any: dữ liệu Excel thô, mỗi ô có thể là string/number/Date/null tùy nội dung file
        const json: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        // Try to find export date from the first few rows (usually in column AI/34)
        // We scan the first 5 rows to find a cell containing "Ngày in:"
        let exportDate = 'N/A';
        for(let i=0; i<Math.min(json.length, 5); i++) {
            const row = json[i];
            const dateCellIndex = row.findIndex((cell) => String(cell).includes('Ngày in:'));
            if (dateCellIndex !== -1) {
                exportDate = String(row[dateCellIndex]);
                break;
            }
        }

        // Process ALL rows (removed .slice(1)) to handle files starting with data at Row 1
        const products: Product[] = json.map((row) => {
          // Default fixed indices
          const colA = row[0] || '';
          const colB = row[1] || '';
          const colE = row[4] || '0';
          const colF = row[5] || '0';
          const colH = row[7] || '';
          
          // SMART PARSING LOGIC
          // Find the "Anchor" column which is "Ngày in:" (Date)
          let dateIndex = -1;
          for (let i = row.length - 1; i > 20; i--) { // Scan backwards from end, assuming Date is towards the right
              if (String(row[i]).toLowerCase().includes('ngày in')) {
                  dateIndex = i;
                  break;
              }
          }

          let colAI, colAJ, colAK;

          if (dateIndex !== -1) {
              // If Anchor found, use relative positions
              colAI = row[dateIndex];         // Date
              colAJ = row[dateIndex + 1];     // Bonus Code (Internal ID)
              colAK = row[dateIndex + 2];     // MSP (Barcode)
          } else {
              // Fallback to fixed indices if Anchor not found
              colAI = row[34] || '';
              colAJ = row[35] || '';
              colAK = row[36] || '';
              
              // Fallback Level 2: If MSP at 36 is empty, look at adjacent columns (37 or 35)
              // This handles slight column shifts
              if (!isValidMsp(colAK)) {
                  if (isValidMsp(row[37])) colAK = row[37]; // Shifted Right
                  else if (isValidMsp(row[35]) && !String(row[35]).match(/[a-zA-Z]/)) colAK = row[35]; // Shifted Left (check if not bonus code)
              }
              
              // Fallback Level 3: Scan last 10 columns for something that looks like a barcode
              if (!isValidMsp(colAK)) {
                  for(let i = row.length - 1; i > 30; i--) {
                      const val = row[i];
                      // Strict check: only digits, length > 8 (typical barcode)
                      if (val && String(val).match(/^\d{8,}$/)) {
                          colAK = val;
                          break;
                      }
                  }
              }
          }

          const { thuongERP, thuongNong } = parseBonus(colAJ);
          const tongThuong = thuongNong * 0.4 + thuongERP;

          return {
            msp: String(colAK || '').trim(),
            sanPham: `${colA} ${colB}`.trim(),
            thuongERP: thuongERP,
            thuongNong: thuongNong,
            tongThuong: tongThuong,
            giaGoc: formatCurrency(parseCurrency(colE)),
            giaGiam: formatCurrency(parseCurrency(colF)),
            khuyenMai: String(colH),
            ngayIn: String(colAI),
            selected: false,
            quantity: 1,
          };
        }).filter(p => p.msp && p.msp !== 'undefined' && p.msp.length > 0); // Strict filter removes empty rows or headers without MSP

        resolve({ products, exportDate });
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = (error) => {
      reject(error);
    };

    reader.readAsArrayBuffer(file);
  });
};

// --- IndexedDB Persistence ---

const DB_NAME = 'ProductSearchDB';
const DB_VERSION = 1;
const STORE_NAME = 'appData';

export interface FileInfo {
  fileName: string | null;
  uploadTimestamp: Date | null;
  fileExportDate: string | null;
}

const getDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject('Error opening IndexedDB.');
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
};

const getStore = async (mode: IDBTransactionMode) => {
  const db = await getDB();
  return db.transaction(STORE_NAME, mode).objectStore(STORE_NAME);
};

/**
 * Lưu bảng giá đã ghép cùng các file tạo nên nó trong một lượt ghi, để hai phần không bao giờ lệch nhau.
 * `products` vẫn giữ để màn khởi động đọc nhanh, không phải đọc lại mọi file.
 */
export const savePriceTable = async (products: Product[], fileInfo: FileInfo | null, sources: PriceSource[]): Promise<void> => {
  if (areLocalWritesFrozen()) return;
  const store = await getStore('readwrite');
  return new Promise((resolve, reject) => {
    const transaction = store.transaction;
    store.put(products, 'products');
    if (fileInfo) store.put(fileInfo, 'fileInfo');
    else store.delete('fileInfo');
    store.put(sources, 'priceSources');
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
};

const readKeys = async (keys: readonly string[]): Promise<Record<string, unknown>> => {
  const store = await getStore('readonly');
  const requests = keys.map((key) => [key, store.get(key)] as const);
  return new Promise((resolve, reject) => {
    store.transaction.oncomplete = () => resolve(Object.fromEntries(requests.map(([key, request]) => [key, request.result])));
    store.transaction.onerror = () => reject(store.transaction.error);
  });
};

/**
 * Các file đã nhập, cũ trước. Chỉ đọc khi nhập, xoá hoặc mở màn quản lý vì có thể nặng.
 * Bảng giá nạp từ bản trước chưa tách file thì coi cả bảng là một file.
 */
export const loadPriceSources = async (): Promise<PriceSource[]> => {
  const data = await readKeys(['priceSources', 'products', 'fileInfo']);
  if (Array.isArray(data.priceSources)) return data.priceSources as PriceSource[];
  const products = Array.isArray(data.products) ? (data.products as Product[]) : [];
  return products.length > 0 ? [legacySource(products, (data.fileInfo as FileInfo | undefined) ?? null)] : [];
};

export const loadPriceImportHistory = async (): Promise<PriceImportRecord[]> => {
  try {
    const data = await readKeys(['priceImportHistory']);
    return Array.isArray(data.priceImportHistory) ? (data.priceImportHistory as PriceImportRecord[]) : [];
  } catch (e) {
    console.error('Không đọc được lịch sử nhập bảng giá', e);
    return [];
  }
};

export const savePriceImportHistory = async (history: PriceImportRecord[]): Promise<void> => {
  if (areLocalWritesFrozen()) return;
  const store = await getStore('readwrite');
  return new Promise((resolve, reject) => {
    store.put(history, 'priceImportHistory');
    store.transaction.oncomplete = () => resolve();
    store.transaction.onerror = () => reject(store.transaction.error);
  });
};

export const saveDisplayedProducts = async (products: Product[], timestamp?: number): Promise<void> => {
    if (areLocalWritesFrozen()) return;
    const store = await getStore('readwrite');
    return new Promise((resolve, reject) => {
        const transaction = store.transaction;
        store.put(products, 'displayedProducts');
        store.put(timestamp || Date.now(), 'displayedProductsLastModified');
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
    });
};

export const saveEmployeeName = async (name: string): Promise<void> => {
    if (areLocalWritesFrozen()) return;
    const store = await getStore('readwrite');
    return new Promise((resolve, reject) => {
        const transaction = store.transaction;
        const putReq = store.put(name, 'employeeName');
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
    });
};

/** Sản phẩm nhập tay. Bản web lưu ở Firestore theo mã kho, app offline lưu trên máy. */
export const saveManualProducts = async (products: ManualProductDoc[]): Promise<void> => {
    if (areLocalWritesFrozen()) return;
    const store = await getStore('readwrite');
    return new Promise((resolve, reject) => {
        const transaction = store.transaction;
        store.put(products, 'manualProducts');
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
    });
};

export const loadManualProducts = async (): Promise<ManualProductDoc[]> => {
    try {
        const store = await getStore('readonly');
        const request = store.get('manualProducts');
        return new Promise((resolve) => {
            request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
            request.onerror = () => resolve([]);
        });
    } catch (e) {
        console.error('Failed to load manual products', e);
        return [];
    }
};

// Đọc và thay dữ liệu theo khoá, dùng cho Sao lưu và Khôi phục.
export const readAppData = async (keys: readonly string[]): Promise<Record<string, unknown>> => {
    const store = await getStore('readonly');
    const requests = keys.map((key) => [key, store.get(key)] as const);
    return new Promise((resolve, reject) => {
        store.transaction.oncomplete = () => {
            const out: Record<string, unknown> = {};
            for (const [key, request] of requests) {
                if (request.result !== undefined) out[key] = request.result;
            }
            resolve(out);
        };
        store.transaction.onerror = () => reject(store.transaction.error);
    });
};

export const replaceAppData = async (keys: readonly string[], values: Record<string, unknown>): Promise<void> => {
    const store = await getStore('readwrite');
    return new Promise((resolve, reject) => {
        for (const key of keys) {
            if (key in values) store.put(values[key], key);
            else store.delete(key);
        }
        store.transaction.oncomplete = () => resolve();
        store.transaction.onerror = () => reject(store.transaction.error);
    });
};

interface LoadDataResult {
    products: Product[];
    displayedProducts: Product[];
    fileInfo: FileInfo | null;
    employeeName: string;
    displayedProductsLastModified: number | null;
}

export const loadData = async (): Promise<LoadDataResult | null> => {
    try {
        const store = await getStore('readonly');
        const productsReq = store.get('products');
        const displayedProductsReq = store.get('displayedProducts');
        const fileInfoReq = store.get('fileInfo');
        const employeeNameReq = store.get('employeeName');
        const displayedProductsLastModifiedReq = store.get('displayedProductsLastModified');

        return new Promise((resolve) => {
            const results: LoadDataResult = { products: [], displayedProducts: [], fileInfo: null, employeeName: '', displayedProductsLastModified: null };
            let completed = 0;
            const totalRequests = 5;

            const checkCompletion = () => {
                completed++;
                if (completed === totalRequests) {
                   resolve(results);
                }
            };
            
            const onError = () => {
                checkCompletion();
            };

            productsReq.onsuccess = () => {
                results.products = Array.isArray(productsReq.result) ? productsReq.result : [];
                checkCompletion();
            };
            displayedProductsReq.onsuccess = () => {
                results.displayedProducts = Array.isArray(displayedProductsReq.result) ? displayedProductsReq.result : [];
                checkCompletion();
            };
            fileInfoReq.onsuccess = () => {
                results.fileInfo = fileInfoReq.result;
                checkCompletion();
            };
             employeeNameReq.onsuccess = () => {
                results.employeeName = employeeNameReq.result || '';
                checkCompletion();
            };
            displayedProductsLastModifiedReq.onsuccess = () => {
                results.displayedProductsLastModified = displayedProductsLastModifiedReq.result || null;
                checkCompletion();
            };
            
            productsReq.onerror = onError;
            displayedProductsReq.onerror = onError;
            fileInfoReq.onerror = onError;
            employeeNameReq.onerror = onError;
            displayedProductsLastModifiedReq.onerror = onError;
        });
    } catch (e) {
        console.error("Failed to load data from IndexedDB", e);
        return null;
    }
};

/**
 * Nút xoá bảng giá (thùng rác trên thanh trên, chế độ Sticker): chỉ xoá bảng giá, các file đã nhập và danh sách đang hiển thị. Sản phẩm nhập tay, tên người in
 * và lịch sử nhập vẫn giữ. Xoá luôn dữ liệu tồn kho còn sót từ bản trước, khi app còn chức năng nạp tồn.
 */
export const clearPriceData = async (): Promise<void> => {
  const store = await getStore('readwrite');
  return new Promise((resolve, reject) => {
    for (const key of ['products', 'fileInfo', 'priceSources', 'displayedProducts', 'displayedProductsLastModified', 'inventory', 'inventoryUploadTimestamp', 'inventoryFilters']) {
      store.delete(key);
    }
    store.transaction.oncomplete = () => resolve();
    store.transaction.onerror = () => reject(store.transaction.error ?? new Error('Error clearing IndexedDB.'));
  });
};