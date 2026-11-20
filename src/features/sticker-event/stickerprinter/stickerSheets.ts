/**
 * In nhiều sticker Giá Sốc / Giờ Vàng trên một tờ A4. Sticker có tỉ lệ gần đúng khổ A (197 x 285), nên chia tờ theo
 * khổ A: 2 và 8 sticker đặt tờ ngang, 1, 4 và 16 sticker đặt tờ dọc. Chữ trên sticker đo theo bề rộng sticker (cqw) nên
 * sticker nhỏ lại thì chữ nhỏ theo, đúng như khung xem trước.
 */
export type StickersPerPage = 1 | 2 | 4 | 8 | 16;

export interface StickerSheetLayout {
    perPage: StickersPerPage;
    landscape: boolean;
    cols: number;
    rows: number;
}

export const STICKER_SHEET_LAYOUTS: readonly StickerSheetLayout[] = [
    { perPage: 1, landscape: false, cols: 1, rows: 1 },
    { perPage: 2, landscape: true, cols: 2, rows: 1 },
    { perPage: 4, landscape: false, cols: 2, rows: 2 },
    { perPage: 8, landscape: true, cols: 4, rows: 2 },
    { perPage: 16, landscape: false, cols: 4, rows: 4 },
];

export const STICKERS_PER_PAGE_KEY = 'stickerPerPage';

export const normalizeStickersPerPage = (value: unknown): StickersPerPage =>
    STICKER_SHEET_LAYOUTS.find(layout => layout.perPage === value)?.perPage ?? 1;

export const sheetLayoutOf = (perPage: StickersPerPage): StickerSheetLayout =>
    STICKER_SHEET_LAYOUTS.find(layout => layout.perPage === perPage) ?? STICKER_SHEET_LAYOUTS[0];

/** Lề tờ giấy chừa cho vùng máy in không in tới, và khoảng cách giữa hai sticker để cắt. */
const PAGE_PADDING_MM = 5;
const GAP_MM = 4;
const STICKER_RATIO = 197 / 285;
/** Một sticker mỗi tờ giữ cách in cũ: phủ cả tờ A4 rồi thu 95% quanh tâm. */
const SINGLE_SCALE = 0.95;

const round = (mm: number) => Math.round(mm * 100) / 100;

/** Cỡ một sticker khi in, tính bằng mm. */
export const stickerSizeMm = (layout: StickerSheetLayout): { width: number; height: number } => {
    if (layout.perPage === 1) return { width: round(210 * SINGLE_SCALE), height: round(297 * SINGLE_SCALE) };
    const [pageWidth, pageHeight] = layout.landscape ? [297, 210] : [210, 297];
    const cellWidth = (pageWidth - PAGE_PADDING_MM * 2 - GAP_MM * (layout.cols - 1)) / layout.cols;
    const cellHeight = (pageHeight - PAGE_PADDING_MM * 2 - GAP_MM * (layout.rows - 1)) / layout.rows;
    // Giữ đúng tỉ lệ sticker, vừa khít ô theo chiều nào chạm trước
    const width = Math.min(cellWidth, cellHeight * STICKER_RATIO);
    return { width: round(width), height: round(width / STICKER_RATIO) };
};

/**
 * Xếp các sticker (mỗi phần tử là HTML của một `.sticker-container`) vào từng tờ. Một sticker mỗi tờ thì để nguyên như
 * trước nay; còn lại thì gói theo tờ và trả thêm CSS khổ giấy, cỡ sticker.
 */
export const buildStickerSheets = (stickers: string[], perPage: StickersPerPage): { html: string; css: string; landscape: boolean } => {
    const layout = sheetLayoutOf(perPage);
    if (layout.perPage === 1) return { html: stickers.join(''), css: '', landscape: false };

    const sheets: string[] = [];
    for (let start = 0; start < stickers.length; start += layout.perPage) {
        sheets.push(`<div class="sticker-sheet">${stickers.slice(start, start + layout.perPage).join('')}</div>`);
    }
    const [pageWidth, pageHeight] = layout.landscape ? [297, 210] : [210, 297];
    const { width, height } = stickerSizeMm(layout);
    // Khổ giấy và bề rộng trang của app đặt sẵn A4 dọc; tờ ngang thì đổi lại bằng bộ chọn mạnh hơn.
    const css = `
        @media print {
            @page { size: A4 ${layout.landscape ? 'landscape' : 'portrait'}; margin: 0; }
            html:root, html:root > body, body #print-host { width: ${pageWidth}mm !important; }
        }
        #print-host .sticker-sheet {
            width: ${pageWidth}mm;
            height: ${pageHeight}mm;
            box-sizing: border-box;
            padding: ${PAGE_PADDING_MM}mm;
            display: grid;
            grid-template-columns: repeat(${layout.cols}, 1fr);
            grid-template-rows: repeat(${layout.rows}, 1fr);
            gap: ${GAP_MM}mm;
            place-items: center;
            overflow: hidden;
            break-after: page;
            page-break-after: always;
        }
        #print-host .sticker-sheet:last-child {
            break-after: auto;
            page-break-after: auto;
        }
        #print-host .sticker-sheet .sticker-container {
            width: ${width}mm !important;
            height: ${height}mm !important;
            transform: none !important;
            break-after: auto !important;
            page-break-after: auto !important;
        }
    `;
    return { html: sheets.join(''), css, landscape: layout.landscape };
};
