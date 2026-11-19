import type { Product, TagLayout } from '../types';
import { formatCurrency, normalizeTagQuantity } from '../utils/format';
import { parseCurrency } from './fileParser';
import { DEFAULT_TAG_LAYOUT, TAG_LAYOUTS, isTagLayout } from './tagLayouts';

/**
 * File mẫu của tab Sticker: người dùng tự điền sản phẩm cần in thay cho bảng giá ERP.
 * Mỗi dòng một sản phẩm, có số lượng tem và bố cục in riêng.
 */
export const TEMPLATE_HEADERS = ['Mã SP', 'Tên sản phẩm', 'Giá gốc', 'Giá bán', 'Khuyến mãi', 'Số lượng tem', 'Bố cục'] as const;

const TEMPLATE_FILE_NAME = 'Mau_Sticker.xlsx';
const TEXT_CODE_ROWS = 500;

type Column = 'msp' | 'name' | 'oldPrice' | 'price' | 'promotion' | 'quantity' | 'layout';

// Tên cột đã bỏ dấu, chữ thường. Nhận cả vài cách gọi hay gặp để file tự làm vẫn đọc được.
const COLUMN_NAMES: Record<Column, string[]> = {
  msp: ['ma sp', 'ma san pham', 'msp', 'code', 'ma'],
  name: ['ten san pham', 'ten sp', 'san pham', 'ten'],
  oldPrice: ['gia goc', 'gia niem yet', 'gia cu'],
  price: ['gia ban', 'gia giam', 'gia moi', 'gia khuyen mai'],
  promotion: ['khuyen mai', 'km'],
  quantity: ['so luong tem', 'so luong', 'sl', 'so tem'],
  layout: ['bo cuc', 'so tem/trang', 'sticker/trang', 'mau in'],
};

const normalize = (value: unknown): string =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const findColumns = (row: unknown[]): Partial<Record<Column, number>> => {
  const cells = row.map(normalize);
  const found: Partial<Record<Column, number>> = {};
  for (const [column, names] of Object.entries(COLUMN_NAMES) as [Column, string[]][]) {
    const index = cells.findIndex((cell, i) => names.includes(cell) && !Object.values(found).includes(i));
    if (index >= 0) found[column] = index;
  }
  return found;
};

const cellText = (value: unknown): string => {
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : String(value).trim();
  return String(value ?? '').trim();
};

const isBlank = (value: unknown): boolean => cellText(value) === '';

/** Nhận "4", 4, "4/trang", "4 sticker/trang". Trống thì dùng bố cục mặc định. */
export const parseLayout = (value: unknown): TagLayout | null => {
  if (isBlank(value)) return DEFAULT_TAG_LAYOUT;
  const match = cellText(value).match(/\d+/);
  const layout = match ? Number(match[0]) : NaN;
  return isTagLayout(layout) ? layout : null;
};

export interface TemplateParseResult {
  products: Product[];
  /** Dòng bị bỏ qua, mỗi dòng một lời nhắn có số dòng trong Excel. */
  errors: string[];
  /** Không đọc được cả file (không thấy dòng tiêu đề). */
  fatal?: string;
}

const LAYOUT_VALUES = TAG_LAYOUTS.map((layout) => layout.value).join(', ');

export const parseStickerTemplate = (rows: unknown[][]): TemplateParseResult => {
  const headerIndex = rows.slice(0, 10).findIndex((row) => {
    const columns = findColumns(row ?? []);
    return columns.msp !== undefined && columns.name !== undefined && columns.price !== undefined;
  });
  if (headerIndex < 0) {
    return { products: [], errors: [], fatal: 'Không thấy dòng tiêu đề Mã SP, Tên sản phẩm, Giá bán. Hãy dùng file tải từ nút Tải file mẫu.' };
  }
  const columns = findColumns(rows[headerIndex]);
  const at = (row: unknown[], column: Column) => (columns[column] === undefined ? '' : row[columns[column] as number]);

  const byCode = new Map<string, Product>();
  const errors: string[] = [];
  rows.slice(headerIndex + 1).forEach((row, offset) => {
    if (!row || row.every(isBlank)) return;
    const line = headerIndex + offset + 2;
    const msp = cellText(at(row, 'msp'));
    const name = cellText(at(row, 'name'));
    const price = parseCurrency(cellText(at(row, 'price')));
    const oldPrice = parseCurrency(cellText(at(row, 'oldPrice')));
    const quantityCell = at(row, 'quantity');
    const quantity = Number(cellText(quantityCell));
    const layout = parseLayout(at(row, 'layout'));

    const problems: string[] = [];
    if (!msp) problems.push('thiếu mã sản phẩm');
    if (!name) problems.push('thiếu tên sản phẩm');
    if (price <= 0) problems.push('thiếu giá bán');
    if (!isBlank(quantityCell) && !(quantity >= 1)) problems.push(`số lượng tem "${cellText(quantityCell)}" không hợp lệ`);
    if (layout === null) problems.push(`bố cục "${cellText(at(row, 'layout'))}" không hợp lệ, chỉ dùng ${LAYOUT_VALUES}`);
    if (problems.length > 0) {
      errors.push(`Dòng ${line}: ${problems.join(', ')}`);
      return;
    }

    // Trùng mã trong cùng file thì dòng sau thay dòng trước
    byCode.set(msp, {
      msp,
      sanPham: name,
      giaGoc: oldPrice > 0 ? formatCurrency(oldPrice) : '',
      giaGiam: formatCurrency(price),
      khuyenMai: cellText(at(row, 'promotion')),
      thuongERP: 0,
      thuongNong: 0,
      tongThuong: 0,
      ngayIn: '',
      selected: false,
      quantity: isBlank(quantityCell) ? 1 : normalizeTagQuantity(quantity),
      layout: layout as TagLayout,
    });
  });
  return { products: [...byCode.values()], errors };
};

export interface TemplateMergeResult {
  catalog: Product[];
  displayed: Product[];
  added: number;
  updated: number;
}

/**
 * Nhập thêm file mẫu: sản phẩm trùng mã lấy theo file mới (tên, giá, số lượng, bố cục), mã mới thêm vào cuối danh sách.
 * Nhập lại cùng một file không làm tăng số tem.
 */
export const mergeTemplateImport = (catalog: readonly Product[], displayed: readonly Product[], imported: readonly Product[]): TemplateMergeResult => {
  const importedByCode = new Map(imported.map((product) => [product.msp, product]));
  const nextCatalog = [...catalog.filter((product) => !importedByCode.has(product.msp)), ...imported];

  let updated = 0;
  const nextDisplayed = displayed.map((product) => {
    const fresh = importedByCode.get(product.msp);
    if (!fresh) return product;
    updated += 1;
    importedByCode.delete(product.msp);
    return { ...fresh, selected: product.selected };
  });
  const added = [...importedByCode.values()].map((product) => ({ ...product, selected: false }));
  return { catalog: nextCatalog, displayed: [...nextDisplayed, ...added], added: added.length, updated };
};

/** Dữ liệu file mẫu: tiêu đề, vài dòng ví dụ và trang hướng dẫn bố cục. */
export const templateSheets = (): { products: unknown[][]; guide: unknown[][] } => ({
  products: [
    [...TEMPLATE_HEADERS],
    ['2714133000100', 'Nồi cơm điện tử Toshiba RC-10MM - 1.0 lít', 2500000, 2045000, 'Hỗ trợ trả chậm lãi suất 0%', 2, 4],
    ['4844099000052', 'Nồi chiên không dầu Sunhouse SHD4085G 3.5 lít', 2900000, 2390000, '', 1, 4],
    ['1234567000001', 'Quạt điều hoà Daikiosan DMI03', 5490000, 3490000, 'Tặng bình giữ nhiệt', 1, 1],
    ['1234567000002', 'Bình giữ nhiệt Lock&Lock 500ml', 390000, 290000, '', 3, 24],
  ],
  guide: [
    ['Cột', 'Cách điền'],
    ['Mã SP', 'Bắt buộc. Dùng làm mã QR trên tem.'],
    ['Tên sản phẩm', 'Bắt buộc.'],
    ['Giá gốc', 'Không bắt buộc. Để trống thì tem không có giá gạch.'],
    ['Giá bán', 'Bắt buộc. Giá in to trên tem.'],
    ['Khuyến mãi', 'Không bắt buộc.'],
    ['Số lượng tem', 'Không bắt buộc, trống là 1.'],
    ['Bố cục', `Số sticker trên một trang A4: ${LAYOUT_VALUES}. Trống là ${DEFAULT_TAG_LAYOUT}.`],
    [],
    ['Bố cục', 'Hợp với'],
    ...TAG_LAYOUTS.map((layout) => [layout.value, layout.description]),
  ],
});

export const downloadStickerTemplateFile = async (): Promise<void> => {
  const XLSX = await import('xlsx');
  const { products, guide } = templateSheets();
  const workbook = XLSX.utils.book_new();
  const productSheet = XLSX.utils.aoa_to_sheet(products);
  // Cột mã để dạng Text sẵn để Excel không đổi mã dài thành 2,71E+12 khi người dùng gõ hoặc dán vào
  const lastRow = Math.max(products.length - 1, TEXT_CODE_ROWS);
  for (let row = 1; row <= lastRow; row += 1) {
    productSheet[XLSX.utils.encode_cell({ r: row, c: 0 })] = { t: 's', v: String(products[row]?.[0] ?? ''), z: '@' };
  }
  productSheet['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: lastRow, c: TEMPLATE_HEADERS.length - 1 } });
  productSheet['!cols'] = [{ wch: 16 }, { wch: 44 }, { wch: 12 }, { wch: 12 }, { wch: 36 }, { wch: 13 }, { wch: 9 }];
  const guideSheet = XLSX.utils.aoa_to_sheet(guide);
  guideSheet['!cols'] = [{ wch: 14 }, { wch: 70 }];
  XLSX.utils.book_append_sheet(workbook, productSheet, 'San pham');
  XLSX.utils.book_append_sheet(workbook, guideSheet, 'Huong dan');
  XLSX.writeFile(workbook, TEMPLATE_FILE_NAME);
};

/** Đọc sheet đầu tiên của file người dùng chọn. */
export const readTemplateFile = async (file: File): Promise<TemplateParseResult> => {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return parseStickerTemplate(XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, blankrows: false, defval: '' }));
};
