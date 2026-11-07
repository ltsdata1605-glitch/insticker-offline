import type { Product } from '../types';

/**
 * Bảng giá ghép từ nhiều file. Mỗi file đã nhập là một nguồn riêng, lưu đủ sản phẩm của file đó.
 * Bảng giá dùng để tìm và in là các nguồn ghép theo thứ tự nhập: file nhập sau ghi đè giá của file nhập trước
 * khi trùng mã, mã chưa có thì thêm vào. Xoá một file thì ghép lại từ các file còn lại, nên mã có trong file khác
 * vẫn còn và lấy giá của file mới nhất còn lại.
 */
export interface PriceSource {
  id: string;
  fileName: string;
  /** ISO, lúc nhập vào app. */
  importedAt: string;
  /** Ô "Ngày in:" trong file, nếu có. */
  exportDate: string | null;
  products: Product[];
}

/** Một dòng trong chi tiết lịch sử nhập. */
export interface PriceItemSummary {
  msp: string;
  sanPham: string;
  giaGoc: string;
  giaGiam: string;
}

export interface PriceChange extends PriceItemSummary {
  giaGocCu: string;
  giaGiamCu: string;
}

export interface PriceImportFile {
  sourceId: string;
  fileName: string;
  productCount: number;
}

export interface PriceImportRecord {
  id: string;
  importedAt: string;
  files: PriceImportFile[];
  /** File không đọc được hoặc không có sản phẩm nào. */
  failedFiles: string[];
  /** Mã chưa có trong bảng giá trước lần nhập này. */
  added: PriceItemSummary[];
  /** Mã đã có, giá, khuyến mãi, thưởng hoặc tên đổi. */
  updated: PriceChange[];
  /** Mã đã có và không đổi gì. */
  unchanged: number;
  /** Số sản phẩm trong bảng giá sau lần nhập. */
  totalAfter: number;
}

/** Giữ số lần nhập gần nhất trong lịch sử. */
export const MAX_IMPORT_HISTORY = 30;

/** Mã trùng trong cùng một file: giữ dòng đầu, như trước đây. */
export const dedupeProducts = (products: Product[]): Product[] => {
  const seen = new Map<string, Product>();
  for (const product of products) {
    if (!seen.has(product.msp)) seen.set(product.msp, product);
  }
  return Array.from(seen.values());
};

/** Ghép các nguồn theo thứ tự nhập (cũ trước). Mã giữ vị trí lần đầu xuất hiện, giá lấy từ nguồn mới nhất. */
export const mergeSources = (sources: readonly PriceSource[]): Product[] => {
  const merged = new Map<string, Product>();
  for (const source of sources) {
    for (const product of source.products) merged.set(product.msp, product);
  }
  return Array.from(merged.values());
};

const summarize = (product: Product): PriceItemSummary => ({
  msp: product.msp,
  sanPham: product.sanPham,
  giaGoc: product.giaGoc,
  giaGiam: product.giaGiam,
});

const isSamePrice = (a: Product, b: Product): boolean =>
  a.giaGoc === b.giaGoc &&
  a.giaGiam === b.giaGiam &&
  a.khuyenMai === b.khuyenMai &&
  a.thuongERP === b.thuongERP &&
  a.thuongNong === b.thuongNong &&
  a.sanPham === b.sanPham;

export interface ImportOutcome {
  sources: PriceSource[];
  products: Product[];
  /** Giá mới của các mã có trong file vừa nhập, để làm mới danh sách đang in. */
  incoming: Map<string, Product>;
  added: PriceItemSummary[];
  updated: PriceChange[];
  unchanged: number;
}

/** Thêm các file vừa đọc vào sau cùng rồi so với bảng giá trước đó. */
export const applyPriceImport = (current: readonly PriceSource[], newSources: readonly PriceSource[]): ImportOutcome => {
  const before = new Map(mergeSources(current).map((p) => [p.msp, p]));
  const sources = [...current, ...newSources];
  const products = mergeSources(sources);
  const after = new Map(products.map((p) => [p.msp, p]));

  const incoming = new Map<string, Product>();
  for (const source of newSources) {
    for (const product of source.products) incoming.set(product.msp, after.get(product.msp) ?? product);
  }

  const added: PriceItemSummary[] = [];
  const updated: PriceChange[] = [];
  let unchanged = 0;
  for (const [msp, product] of incoming) {
    const old = before.get(msp);
    if (!old) added.push(summarize(product));
    else if (!isSamePrice(old, product)) updated.push({ ...summarize(product), giaGocCu: old.giaGoc, giaGiamCu: old.giaGiam });
    else unchanged += 1;
  }

  return { sources, products, incoming, added, updated, unchanged };
};

/** Bỏ các nguồn theo mã rồi ghép lại. */
export const removeSources = (current: readonly PriceSource[], ids: readonly string[]): { sources: PriceSource[]; products: Product[] } => {
  const drop = new Set(ids);
  const sources = current.filter((source) => !drop.has(source.id));
  return { sources, products: mergeSources(sources) };
};

export interface PriceSourceSummary {
  id: string;
  fileName: string;
  importedAt: string;
  exportDate: string | null;
  productCount: number;
  /** Số mã của file này đang lấy giá từ một file nhập sau. */
  overriddenCount: number;
}

/** Thông tin từng file cho màn quản lý, file nhập sau cùng đứng đầu. */
export const summarizeSources = (sources: readonly PriceSource[]): PriceSourceSummary[] => {
  const owner = new Map<string, string>();
  for (const source of sources) {
    for (const product of source.products) owner.set(product.msp, source.id);
  }
  return sources
    .map((source) => ({
      id: source.id,
      fileName: source.fileName,
      importedAt: source.importedAt,
      exportDate: source.exportDate,
      productCount: source.products.length,
      overriddenCount: source.products.reduce((sum, p) => sum + (owner.get(p.msp) === source.id ? 0 : 1), 0),
    }))
    .reverse();
};

/** File mà mọi mã đều đã có giá ở file nhập sau: xoá đi bảng giá không đổi. */
export const fullyOverriddenIds = (summaries: readonly PriceSourceSummary[]): string[] =>
  summaries.filter((s) => s.productCount > 0 && s.overriddenCount === s.productCount).map((s) => s.id);

/** Bảng giá nạp từ bản trước, khi app chưa tách từng file: coi cả bảng là một file. */
export const LEGACY_SOURCE_ID = 'bang-gia-cu';

export const legacySource = (
  products: Product[],
  fileInfo: { fileName?: string | null; uploadTimestamp?: Date | string | null; fileExportDate?: string | null } | null,
): PriceSource => {
  const stamp = fileInfo?.uploadTimestamp ? new Date(fileInfo.uploadTimestamp) : null;
  return {
    id: LEGACY_SOURCE_ID,
    fileName: fileInfo?.fileName || 'Bảng giá đã nạp trước đây',
    importedAt: stamp && !Number.isNaN(stamp.getTime()) ? stamp.toISOString() : new Date(0).toISOString(),
    exportDate: fileInfo?.fileExportDate ?? null,
    products,
  };
};

export const newSourceId = (now: number, index: number): string =>
  `nguon_${now}_${index}_${Math.random().toString(36).slice(2, 8)}`;

/** Thêm vào đầu lịch sử, giữ tối đa MAX_IMPORT_HISTORY lần. */
export const appendHistory = (history: readonly PriceImportRecord[], record: PriceImportRecord): PriceImportRecord[] =>
  [record, ...history].slice(0, MAX_IMPORT_HISTORY);

/** Thông tin file lưu kèm bảng giá, giữ định dạng cũ để bản trước và màn khởi động vẫn đọc được. */
export const fileInfoFor = (sources: readonly PriceSource[]) => {
  if (sources.length === 0) return null;
  const latest = sources.reduce((a, b) => (b.importedAt >= a.importedAt ? b : a));
  return {
    fileName: sources.map((s) => s.fileName).join(', '),
    uploadTimestamp: new Date(latest.importedAt),
    fileExportDate: latest.exportDate,
  };
};

/** Tên hiện trên màn chính: một file thì tên file, nhiều file thì số file. */
export const displayFileName = (sources: readonly PriceSource[]): string | null => {
  if (sources.length === 0) return null;
  return sources.length === 1 ? sources[0].fileName : `${sources.length} tệp đã được tải lên`;
};
