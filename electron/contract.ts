// Hợp đồng dùng chung giữa main process và giao diện. Chỉ chứa kiểu, không chứa code chạy.

/** A4 theo hướng giấy, hoặc giấy cuộn (K80): chiều cao đo từ nội dung lúc dựng bản in. */
export type PrintPaper =
  | { kind: 'a4'; landscape: boolean }
  /** Tờ nhãn khổ A5 (Tomy) */
  | { kind: 'a5'; landscape: boolean }
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

/** Âm thanh của nhắc việc. Trùng cấu trúc với SoundSpec bên giao diện. */
export type ReminderSound =
  | { kind: 'preset'; preset: 'chuong' | 'coi' | 'bip' | 'chuong-cua' | 'nhac' }
  | { kind: 'tts'; text: string }
  | { kind: 'file'; mediaId: string; name: string };

/** Nội dung một cửa sổ nhắc việc bật lên. */
export interface ReminderPopupData {
  /** Khoá lần nhắc: mỗi khoá chỉ có một cửa sổ */
  key: string;
  /** alert: báo quản lý, người giao (việc quá hạn, nhân viên cần hỗ trợ), chỉ kêu một lượt */
  kind: 'reminder' | 'checklist' | 'missed' | 'new' | 'alert';
  title: string;
  content: string;
  /** Hạn của lần này (ms) */
  deadline?: number;
  /** Giờ lúc bật cửa sổ theo đồng hồ của lịch nhắc, để tính còn bao lâu */
  shownAt: number;
  priority: 'normal' | 'important' | 'urgent';
  sound: ReminderSound;
  /** Câu đọc khi chọn đọc chữ */
  speech: string;
  /** Có checklist để mở */
  hasChecklist?: boolean;
  /** Nhắc bị lỡ (kind = missed) hoặc việc mới từ Google Sheet (kind = new) */
  missed?: { title: string; at: number; note?: string }[];
  /** Việc giao từ Google Sheet */
  assignee?: string;
  assigner?: string;
  /** Bộ phận nhận việc */
  department?: string;
  /** Bấm Đã xong phải kèm ghi chú, ảnh (mở app để ghi) */
  proof?: 'note' | 'photo' | 'both';
  /** Hiện nút Đã nhận (việc nhắc, việc mới) */
  canAck?: boolean;
  /** Hiện nút Cần hỗ trợ */
  canHelp?: boolean;
}

/** Kết quả tải file Google Sheet: cả file dạng .xlsx (base64) để đọc được mọi trang */
export type SheetFetchResult =
  | { ok: true; base64: string }
  | { ok: false; reason: 'invalid-url' | 'not-shared' | 'not-found' | 'offline' | 'error'; message?: string };

/** Gọi cầu nối Google Sheet (đồng bộ hai chiều): đọc dữ liệu (kèm dấu phiên bản lần trước) hoặc gửi thay đổi */
export type BridgeRequest = { method: 'GET'; since?: string } | { method: 'POST'; body: unknown };

export type BridgeResponse =
  | { ok: true; data: unknown }
  | { ok: false; reason: 'invalid-url' | 'not-public' | 'not-found' | 'offline' | 'error'; message?: string };

export interface ReminderAction {
  key: string;
  /** ack: Đã nhận; help: Cần hỗ trợ (mở app để ghi lý do) */
  action: 'done' | 'snooze' | 'open' | 'dismiss' | 'ack' | 'help';
  minutes?: number;
}

export interface BackgroundSettings {
  /** Đóng cửa sổ thì app vẫn chạy ở khay hệ thống để nhắc việc */
  runInBackground: boolean;
  /** Mở app khi bật máy */
  openAtLogin: boolean;
  /** Máy này đặt được khởi động cùng máy (chỉ bản đã cài) */
  loginItemAvailable: boolean;
  /**
   * Hệ điều hành có mở app lúc bật máy không: ok; needs-approval (macOS chờ bật trong Mục đăng nhập); blocked (Windows tắt trong
   * Ứng dụng khởi động); failed (chưa đặt được). Không có khi tắt hoặc không dùng được.
   */
  loginStatus?: 'ok' | 'needs-approval' | 'blocked' | 'failed';
  /** Không cho máy tự ngủ khi app đang chạy (màn hình vẫn tắt được), để nhắc đúng giờ */
  keepAwake: boolean;
  /** Mở to hết âm lượng loa khi cửa sổ nhắc kêu, xong trả lại mức cũ */
  maxVolume: boolean;
}

export type BackgroundChange = Partial<Pick<BackgroundSettings, 'runInBackground' | 'openAtLogin' | 'keepAwake' | 'maxVolume'>>;

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
  reminders: {
    /** Cửa sổ chính: thêm một nhắc vào bảng nhắc (mọi nhắc chung một cửa sổ, luôn nằm trên cùng) */
    showPopup(data: ReminderPopupData): Promise<void>;
    /** Bỏ một nhắc khỏi bảng; hết nhắc thì bảng đóng */
    closePopup(key: string): Promise<void>;
    /** Cửa sổ nhắc: các nhắc đang có trong bảng */
    getPopupData(): Promise<ReminderPopupData[]>;
    /** Cửa sổ nhắc: bảng có thêm, bớt hay đổi nhắc */
    onPopupItems(listener: (items: ReminderPopupData[]) => void): () => void;
    /** Cửa sổ nhắc: người dùng bấm nút của một nhắc, nhắc đó rời bảng */
    popupAction(action: ReminderAction): Promise<void>;
    /** Cửa sổ nhắc: chiều cao nội dung, để cửa sổ co giãn theo */
    popupResize(height: number): Promise<void>;
    /** Cửa sổ nhắc: đang kêu hay đã im (để mở to âm lượng rồi trả lại) */
    popupSound(playing: boolean): Promise<void>;
    /** Cửa sổ chính nhận nút đã bấm trên cửa sổ nhắc */
    onAction(listener: (action: ReminderAction) => void): () => void;
    /** Máy vừa thức dậy hoặc mở khoá: kiểm tra lại các nhắc đến giờ */
    onRecheck(listener: () => void): () => void;
    getBackground(): Promise<BackgroundSettings>;
    setBackground(settings: BackgroundChange): Promise<BackgroundSettings>;
    /** Mở trang cài đặt của hệ điều hành nơi cho phép app mở cùng máy */
    openLoginSettings(): Promise<void>;
    /** Tải file Google Sheet (đã chia sẻ cho người có link) dạng .xlsx */
    fetchSheet(url: string): Promise<SheetFetchResult>;
    /** Gọi cầu nối của file (Link kết nối) để đọc hoặc ghi việc */
    bridge(link: string, request: BridgeRequest): Promise<BridgeResponse>;
    /** Link Google Sheet hoặc Link kết nối đang có trong clipboard (rỗng nếu clipboard là nội dung khác) */
    readSheetLinkFromClipboard(): Promise<string>;
    /** Mở link Google Sheet trong trình duyệt của máy */
    openSheet(url: string): Promise<void>;
  };
}
