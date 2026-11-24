import type { Product } from '../types';
import { formatCurrency } from '../utils/format';

/**
 * Đọc bảng giá ERP mẫu 81 (In bảng giá > xuất Excel Data-only). Tab Event nạp vào bảng giá, tab Sticker tạo luôn mỗi sản
 * phẩm một sticker. Không phụ thuộc trình duyệt để test được.
 */

export function parseBonus(bonusCode: string | undefined | null): { thuongERP: number; thuongNong: number } {
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

// Helper function to check if a value looks like a valid MSP (mostly digits, length > 3)
const isValidMsp = (value: unknown): boolean => {
    if (!value) return false;
    const str = String(value).trim();
    // Must be at least 4 chars and contain at least one digit to be a product code
    return str.length >= 4 && /\d/.test(str);
};

// any: dữ liệu Excel thô, mỗi ô có thể là string/number/Date/null tùy nội dung file
export const parseErpPriceRows = (json: any[][]): { products: Product[]; exportDate: string } => {
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

    return { products, exportDate };
};

/** Tiêu đề cột của file mẫu sticker (Giá Sốc, Giờ Vàng). Có một trong các cột này ở dòng đầu là file mẫu, không phải bảng giá. */
const TEMPLATE_HEADERS = ['CODE', 'CODE:', 'TÊN SẢN PHẨM', 'SẢN PHẨM', 'GIÁ GỐC', 'GIÁ NIÊM YẾT', 'GIÁ GIẢM'];

/**
 * File bảng giá ERP mẫu 81: dòng rất rộng, có ô "Ngày in:" ở phía phải (hoặc từ 35 cột trở lên). File mẫu sticker chỉ có vài
 * cột và có dòng tiêu đề.
 */
export const looksLikeErpPriceSheet = (rows: any[][]): boolean => {
  const first = (rows[0] ?? []).map((cell) => String(cell ?? '').trim().toUpperCase());
  if (first.some((cell) => TEMPLATE_HEADERS.includes(cell))) return false;
  return rows.some((row) => Array.isArray(row) && (
    row.length >= 35 || row.some((cell, index) => index > 20 && /ngày in/i.test(String(cell ?? '')))
  ));
};
