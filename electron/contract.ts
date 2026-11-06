// Hợp đồng dùng chung giữa main process và giao diện. Chỉ chứa kiểu, không chứa code chạy.

/** A4 theo hướng giấy, hoặc giấy cuộn (K80): chiều cao đo từ nội dung lúc dựng bản in. */
export type PrintPaper =
  | { kind: 'a4'; landscape: boolean }
  | { kind: 'roll'; widthMm: number };

export interface PrintJobRequest {
  /** Tài liệu HTML đầy đủ do các hàm in tạo ra. */
  html: string;
  title: string;
  paper: PrintPaper;
}

export interface PrintJobInfo {
  jobId: string;
  /** Địa chỉ PDF xem trước, phục vụ qua app://. */
  previewUrl: string;
  totalPages: number;
  /** Số trang có trong PDF xem trước (lô lớn chỉ dựng vài trang đầu để mở nhanh). */
  previewPages: number;
  paperLabel: string;
  buildMs: number;
}

export interface PrinterSummary {
  /** Tên hệ thống, dùng làm deviceName khi in. */
  name: string;
  displayName: string;
}

export interface PrintSendRequest {
  jobId: string;
  /** Bỏ trống hoặc `useSystemDialog: true` thì mở hộp thoại in của hệ điều hành. */
  deviceName?: string;
  copies: number;
  useSystemDialog: boolean;
}

export interface PrintSendResult {
  ok: boolean;
  reason?: string;
}

export interface SavePdfRequest {
  jobId: string;
  suggestedName: string;
}

export interface SavePdfResult {
  saved: boolean;
  path?: string;
  buildMs?: number;
  error?: string;
}

export interface DownloadDone {
  fileName: string;
  path: string;
  ok: boolean;
}

export type UpdatePhase =
  | 'idle'
  | 'checking'
  | 'up-to-date'
  /** Có bản mới, đang chờ người dùng bấm cập nhật (khi tắt tự động tải). */
  | 'available'
  | 'downloading'
  /** Đã tải và kiểm tra xong tệp, chờ giao diện cho phép cài. */
  | 'ready'
  | 'installing'
  /** Tải hoặc cài lỗi. Người dùng được thử lại hoặc dùng tiếp lần này. */
  | 'failed'
  /** Máy này không tự cài được (bản zip, app nằm ở thư mục tạm...), phải tải về cài tay. */
  | 'manual';

export interface UpdateState {
  phase: UpdatePhase;
  currentVersion: string;
  /** Số phiên bản mới, khi đã tìm thấy. */
  version?: string;
  percent?: number;
  downloadedBytes?: number;
  totalBytes?: number;
  message?: string;
  lastCheckedAt?: number;
  autoDownload: boolean;
  /** Người dùng đã chọn dùng tiếp lần này sau khi cập nhật gặp sự cố. */
  bypassed: boolean;
  /** False với bản chạy từ mã nguồn hoặc khi kiểm thử không có địa chỉ giả. */
  enabled: boolean;
  /** Phiên bản trước đó, nếu lần mở này là ngay sau khi cập nhật. */
  justUpdatedFrom?: string;
}

export interface DesktopApi {
  print: {
    createJob(request: PrintJobRequest): Promise<PrintJobInfo>;
    listPrinters(): Promise<PrinterSummary[]>;
    send(request: PrintSendRequest): Promise<PrintSendResult>;
    savePdf(request: SavePdfRequest): Promise<SavePdfResult>;
    closeJob(jobId: string): Promise<void>;
  };
  /** Báo khi một tệp đã lưu xong vào thư mục Tải về. Trả về hàm huỷ theo dõi. */
  onDownloadDone(listener: (item: DownloadDone) => void): () => void;
  showInFolder(filePath: string): Promise<void>;
  update: {
    getState(): Promise<UpdateState>;
    check(): Promise<UpdateState>;
    download(): Promise<void>;
    install(): Promise<void>;
    continueWithoutUpdate(): Promise<void>;
    setAutoDownload(enabled: boolean): Promise<void>;
    openDownloadPage(): Promise<void>;
    onStateChange(listener: (state: UpdateState) => void): () => void;
  };
}
