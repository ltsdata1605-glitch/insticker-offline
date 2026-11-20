export interface StickerPage {
    id: string;
    html: string;
    label: string;
    oldPrice: string;
    newPrice: string;
    percent: string;
    timestamp: number;
    discountDisplayMode?: 'percent' | 'amount';
    salePrice?: string;
    servicePrice?: string;
    header?: string;
    subHeader?: string;
    footer?: string;
    code?: string;
    selected?: boolean;
    /** Số bản in của sticker này (Giá Sốc, Giờ Vàng, Sticker). Không có là 1. */
    quantity?: number;
}

export interface SavedStickerList {
    id: string;
    name: string;
    pages: StickerPage[];
    timestamp: number;
    stickerType: 'gia_soc' | 'gio_vang' | 'draw';
    headerTextContent: string;
    /** storeId Firestore thật của bản ghi này (stores/{storeId}/savedLists/{id}) — cần để xóa đúng
     *  chỗ. Rỗng nếu danh sách chỉ tồn tại cục bộ (chưa đăng nhập lúc lưu, chưa đồng bộ Cloud). */
    storeId?: string;
}

export interface PrintHistoryEntry {
    id: string;
    timestamp: number;
    label: string;
    pageCount: number;
    stickerType: 'gia_soc' | 'gio_vang' | 'draw';
    bgImage: string;
    headerTextSize: number;
    subHeaderTextSize?: number;
    percentTextSize?: number;
    oldPriceTextSize?: number;
    nameTextSize?: number;
    newPriceTextSize?: number;
    footerTextSize?: number;
    batchItems: BatchItem[];
    headerTextContent: string;
    subHeaderTextContent: string;
    footerTextContent: string;
    /** Bản cũ có nút bật tắt mã vạch. Nay mã vạch luôn in khi sticker có mã, trường này chỉ còn trong lịch sử cũ. */
    showBarcode?: boolean;
    /** In từ tab Sticker (tem giá); không có là in từ Giá Sốc, Giờ Vàng hoặc Phiếu. */
    printedAs?: 'tag';
    manualPages: StickerPage[];
    discountDisplayMode?: 'percent' | 'amount';
    drawTickets?: TicketDrawData[];
    drawStartNumber?: number;
    drawTotalTickets?: number;
    drawAutoIncrement?: boolean;
    drawContentTopLeftSize?: number;
    drawContentTopRightSize?: number;
    drawContentBottomLeftSize?: number;
    drawContentBottomRightSize?: number;
    drawContentBottomRightSubSize?: number;
    drawTitleSize?: number;
    drawCodeSize?: number;
    drawFooterSize?: number;
}

export interface BatchItem {
    id: string;
    name: string;
    oldPrice: string;
    newPrice: string;
    percent: string;
    imei: string;
    selected: boolean;
}

export interface TicketDrawData {
    id: string;
    title: string;
    code: string;
    footer: string;
    contentTop?: string;
    contentTopRight?: string;
    contentBottom?: string;
    contentBottomRight?: string;
    contentBottomRightSub?: string;
}


