// Định dạng file sao lưu. Tách riêng, không chạm IndexedDB, để kiểm thử được.

export const BACKUP_FORMAT = 'in-sticker-sao-luu';
export const BACKUP_VERSION = 1;

/** Chỉ các khoá này được sao lưu và khôi phục. Khoá lạ trong file bị bỏ qua. */
export const APP_DATA_KEYS = [
  'products',
  'fileInfo',
  'displayedProducts',
  'displayedProductsLastModified',
  'employeeName',
  'manualProducts',
  // Từng file bảng giá đã nhập và lịch sử nhập. File sao lưu cũ không có hai khoá này: app coi bảng giá là một file.
  'priceSources',
  'priceImportHistory',
] as const;

export const SETTING_KEYS = [
  'stickerPrinterState',
  'stickerPrintHistory',
  'stickerSavedLists',
  // Số sticker mỗi tờ A4 khi in Giá Sốc, Giờ Vàng
  'stickerPerPage',
  'stickerEventSavedLists',
  // Người in của tab Sticker
  'stickerTagEmployeeName',
  'printSettings',
  'modernPositions',
  'globalFont',
  // Kiểm hàng: phiên đang kiểm và các phiên đã kết thúc
  'kiemHangCurrent',
  'kiemHangHistory',
  // Nhắc việc: nhắc việc, mẫu và lượt checklist, ảnh và âm thanh tự nhập, người thực hiện
  'nhacViecReminders',
  'nhacViecTemplates',
  'nhacViecRuns',
  'nhacViecMedia',
  'nhacViecState',
  // Tạo mã: danh sách mã đang làm và cách in
  'taoMaItems',
  'taoMaSettings',
  // Kiểm quỹ: lần đang đếm và lịch sử
  'kiemQuyCurrent',
  'kiemQuyHistory',
] as const;

export interface BackupData {
  appData: Record<string, unknown>;
  settings: Record<string, unknown>;
}

const DATE_TAG = '__ngay__';

/** JSON không giữ được kiểu Date (mốc tải file lên), nên gắn thẻ riêng. */
export const encodeBackup = (data: BackupData, createdAt: Date): string =>
  JSON.stringify(
    { format: BACKUP_FORMAT, version: BACKUP_VERSION, createdAt: createdAt.toISOString(), ...data },
    function replacer(this: Record<string, unknown>, key: string, value: unknown) {
      const raw = this[key];
      return raw instanceof Date ? { [DATE_TAG]: raw.toISOString() } : value;
    },
  );

const pick = (source: unknown, keys: readonly string[]): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  if (source && typeof source === 'object') {
    for (const key of keys) {
      if (key in source) out[key] = (source as Record<string, unknown>)[key];
    }
  }
  return out;
};

/** Đọc file sao lưu. Ném lỗi với lời nhắn tiếng Việt nếu file không đúng. */
export const parseBackup = (text: string): BackupData & { createdAt: string } => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text, (_key, value) => {
      if (value && typeof value === 'object' && typeof value[DATE_TAG] === 'string') return new Date(value[DATE_TAG]);
      return value;
    });
  } catch {
    throw new Error('File không đọc được. Hãy chọn đúng file sao lưu của app (tools-sao-luu-… hoặc in-sticker-sao-luu-…).');
  }

  const root = parsed as { format?: unknown; version?: unknown; createdAt?: unknown; appData?: unknown; settings?: unknown } | null;
  if (!root || root.format !== BACKUP_FORMAT) {
    throw new Error('Đây không phải file sao lưu của app Tools (hay In Sticker trước đây).');
  }
  if (typeof root.version !== 'number' || root.version > BACKUP_VERSION) {
    throw new Error('File sao lưu này do phiên bản mới hơn tạo ra. Hãy cập nhật app trước khi khôi phục.');
  }

  return {
    createdAt: typeof root.createdAt === 'string' ? root.createdAt : '',
    appData: pick(root.appData, APP_DATA_KEYS),
    settings: pick(root.settings, SETTING_KEYS),
  };
};
