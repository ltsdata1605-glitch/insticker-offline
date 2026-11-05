import { MAX_TAGS_PER_PRODUCT } from '../utils/format';
import type { Product } from '../types';

/** Một mã trong file hoặc nội dung dán. Dòng trùng mã đã được cộng số lượng. */
export interface ImportItem {
  code: string;
  quantity: number;
}

/** Dòng không đọc được. `line` đếm từ 1 theo nội dung người dùng đang thấy. */
export interface ImportProblem {
  line: number;
  text: string;
  reason: string;
}

export interface ParsedImport {
  items: ImportItem[];
  problems: ImportProblem[];
  /** Số dòng đã gộp vào một dòng trước đó vì trùng mã. */
  mergedLines: number;
}

export interface ImportEntry {
  product: Product;
  quantity: number;
}

export type ImportMode = 'add' | 'replace';

const CODE_HEADER = /code|mã|msp|sku/i;
const QUANTITY_HEADER = /^(số\s*lượng|so\s*luong|sl|qty|quantity)$/i;
// Excel chép ô số dài ra dạng 2.71413E+12 khi cột đang ở dạng General: không khôi phục lại được mã thật.
const SHORTENED_NUMBER = /^\d+(?:[.,]\d+)?e\+?\d+$/i;

const cleanCell = (cell: string): string => cell.replace(/﻿/g, '').trim().replace(/^"(.*)"$/, '$1').trim();

const splitLine = (line: string): string[] => {
  if (line.includes('\t')) return line.split('\t').map(cleanCell);
  if (/[;,]/.test(line)) return line.split(/[;,]/).map(cleanCell);
  return line.trim().split(/\s+/).map(cleanCell);
};

const isHeader = (code: string, quantity: string | undefined): boolean =>
  (CODE_HEADER.test(code) && !/\d/.test(code)) || QUANTITY_HEADER.test(quantity ?? '');

/** Mỗi dòng gồm mã và số lượng, cách nhau bằng tab (dán từ Excel), dấu phẩy, chấm phẩy hoặc khoảng trắng. */
export const parseImportText = (text: string): ParsedImport => {
  const merged = new Map<string, ImportItem>();
  const problems: ImportProblem[] = [];
  let mergedLines = 0;
  let sawContent = false;

  text.split(/\r\n|\r|\n/).forEach((rawLine, index) => {
    if (!cleanCell(rawLine)) return;
    const line = index + 1;
    const [code = '', quantityText] = splitLine(rawLine);

    const isFirstContent = !sawContent;
    sawContent = true;
    if (isFirstContent && isHeader(code, quantityText)) return;

    const problem = (reason: string) => problems.push({ line, text: rawLine.trim(), reason });
    if (!code) {
      problem('thiếu mã sản phẩm');
      return;
    }
    if (SHORTENED_NUMBER.test(code)) {
      problem('Excel đã rút gọn mã, hãy đổi cột mã sang dạng Text rồi chép lại');
      return;
    }

    const quantity = quantityText === undefined || quantityText === '' ? 1 : Number(quantityText);
    if (!Number.isInteger(quantity) || quantity < 1) {
      problem('số lượng phải là số nguyên từ 1 trở lên');
      return;
    }
    if (quantity > MAX_TAGS_PER_PRODUCT) {
      problem(`số lượng tối đa ${MAX_TAGS_PER_PRODUCT} tem mỗi sản phẩm`);
      return;
    }

    const existing = merged.get(code);
    if (existing) {
      existing.quantity = Math.min(existing.quantity + quantity, MAX_TAGS_PER_PRODUCT);
      mergedLines += 1;
    } else {
      merged.set(code, { code, quantity });
    }
  });

  return { items: [...merged.values()], problems, mergedLines };
};

/** Chuyển dòng đọc từ Excel thành nội dung dán. Cột tìm theo tiêu đề, không có tiêu đề thì lấy hai cột đầu. */
export const rowsToImportText = (rows: unknown[][]): string => {
  const asText = (cell: unknown): string => (cell === null || cell === undefined ? '' : String(cell).trim());
  const first = (rows[0] ?? []).map(asText);
  const codeHeader = first.findIndex((cell) => CODE_HEADER.test(cell) && !/\d/.test(cell));
  const quantityHeader = first.findIndex((cell) => QUANTITY_HEADER.test(cell));
  const hasHeader = codeHeader >= 0 || quantityHeader >= 0;
  const codeColumn = codeHeader >= 0 ? codeHeader : 0;
  const quantityColumn = quantityHeader >= 0 ? quantityHeader : codeColumn + 1;

  return rows
    .slice(hasHeader ? 1 : 0)
    .map((row) => [asText(row[codeColumn]), asText(row[quantityColumn])])
    .filter(([code, quantity]) => code || quantity)
    .map(([code, quantity]) => `${code}\t${quantity}`)
    .join('\n');
};

const normalizeCode = (code: string): string => code.trim().toUpperCase();

/** Bảng tra mã. Mã trùng lấy sản phẩm đầu tiên, giống cách tìm kiếm và quét mã. */
export const indexProducts = (products: Product[]): Map<string, Product> => {
  const index = new Map<string, Product>();
  for (const product of products) {
    if (!product?.msp) continue;
    const key = normalizeCode(product.msp);
    if (!index.has(key)) index.set(key, product);
  }
  return index;
};

/** Tách mã có và không có trong bảng giá. Hai mã khác nhau có thể trỏ tới một sản phẩm nên cộng lại lần nữa. */
export const matchImportItems = (items: ImportItem[], index: Map<string, Product>): { entries: ImportEntry[]; notFound: string[] } => {
  const entries = new Map<string, ImportEntry>();
  const notFound: string[] = [];
  for (const { code, quantity } of items) {
    const product = index.get(normalizeCode(code));
    if (!product) {
      notFound.push(code);
      continue;
    }
    const existing = entries.get(product.msp);
    if (existing) existing.quantity = Math.min(existing.quantity + quantity, MAX_TAGS_PER_PRODUCT);
    else entries.set(product.msp, { product, quantity });
  }
  return { entries: [...entries.values()], notFound };
};

/**
 * Thêm: sản phẩm đã có thì cộng thêm số lượng (giống khi quét mã), sản phẩm mới đứng đầu danh sách theo thứ tự trong file.
 * Thay: danh sách mới chỉ còn các sản phẩm vừa nhập.
 */
export const applyImport = (current: Product[], entries: ImportEntry[], mode: ImportMode): Product[] => {
  const fresh = (entry: ImportEntry): Product => ({ ...entry.product, selected: false, quantity: entry.quantity });
  if (mode === 'replace') return entries.map(fresh);

  const incoming = new Map(entries.map((entry) => [entry.product.msp, entry.quantity]));
  const existing = new Set(current.map((product) => product.msp));
  const updated = current.map((product) => {
    const extra = incoming.get(product.msp);
    return extra === undefined ? product : { ...product, quantity: Math.min((product.quantity || 1) + extra, MAX_TAGS_PER_PRODUCT) };
  });
  return [...entries.filter((entry) => !existing.has(entry.product.msp)).map(fresh), ...updated];
};

/** Giữ dạng Text sẵn cho chừng này dòng để Excel không đổi mã dài thành 2,71E+12 khi người dùng gõ hoặc dán vào. */
const TEMPLATE_TEXT_ROWS = 500;

type XlsxModule = typeof import('xlsx');

/** File mẫu 2 cột. Có danh sách thì điền sẵn mã và số lượng để chỉnh rồi nhập lại. */
export const createImportWorkbook = (XLSX: XlsxModule, items: ImportItem[]) => {
  const sheet = XLSX.utils.aoa_to_sheet([['CODE', 'SỐ LƯỢNG'], ...items.map((item) => [item.code, item.quantity])]);
  const lastRow = Math.max(items.length, TEMPLATE_TEXT_ROWS);
  for (let row = 1; row <= lastRow; row += 1) {
    sheet[XLSX.utils.encode_cell({ r: row, c: 0 })] = { t: 's', v: items[row - 1]?.code ?? '', z: '@' };
  }
  sheet['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: lastRow, c: 1 } });
  sheet['!cols'] = [{ wch: 24 }, { wch: 12 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Danh sách');
  return workbook;
};

export const downloadImportWorkbook = async (items: ImportItem[]): Promise<void> => {
  const XLSX = await import('xlsx');
  XLSX.writeFile(createImportWorkbook(XLSX, items), items.length > 0 ? 'Danh_sach_San_Pham.xlsx' : 'Mau_Nhap_San_Pham.xlsx');
};

/** Đọc sheet đầu tiên thành nội dung dán để người dùng xem và sửa được trước khi nhập. */
export const readImportFile = async (file: File): Promise<string> => {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, blankrows: false, defval: '' });
  return rowsToImportText(rows);
};
