import type { PrintPaper } from '../../electron/contract';

export interface PrintPreviewRequest {
  title: string;
  paper: PrintPaper;
  /** Dòng nhắc trên màn xem trước, ví dụ số sticker và bố cục đang in. */
  note?: string;
  /** Dựng tài liệu in. Gọi sau khi màn chờ đã hiện, vì lô lớn tốn vài giây. */
  buildHtml: () => string;
}

type Listener = (request: PrintPreviewRequest | null) => void;

let listener: Listener | null = null;

/** Mở màn xem trước và in. Được gọi từ các hàm in của Giá Sốc, Giờ Vàng, Phiếu và Sticker. */
export const openPrintPreview = (request: PrintPreviewRequest): void => {
  listener?.(request);
};

export const subscribePrintPreview = (next: Listener): (() => void) => {
  listener = next;
  return () => {
    if (listener === next) listener = null;
  };
};

let previewOpen = false;
const openListeners = new Set<(open: boolean) => void>();

export const setPrintPreviewOpen = (open: boolean): void => {
  previewOpen = open;
  openListeners.forEach((notify) => notify(open));
};

/** Theo dõi màn in có đang mở không, để việc khoá app cập nhật chờ người dùng in xong. */
export const subscribePrintPreviewOpen = (next: (open: boolean) => void): (() => void) => {
  openListeners.add(next);
  next(previewOpen);
  return () => {
    openListeners.delete(next);
  };
};
