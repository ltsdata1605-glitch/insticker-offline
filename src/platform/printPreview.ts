import type { PrintPaper } from '../../electron/contract';

export interface PrintPreviewRequest {
  title: string;
  paper: PrintPaper;
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
