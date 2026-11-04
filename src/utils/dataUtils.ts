// Chép từ utils/dataUtils.ts của dashboard (commit 37ee99b): chỉ các hàm In Sticker cần.

export const parseNumber = (str: unknown): number => {
    if (str === null || str === undefined || str === '') return 0;
    if (typeof str === 'number') return str;

    let cleaned = String(str).replace(/[\s%\+]/g, '');

    // Audit D15: trước đây XOÁ MỌI dấu phẩy → "45,5%" thành 455, "12,5" thành 125. Dấu phẩy là THẬP
    // PHÂN khi: có cả chấm lẫn phẩy và phẩy đứng SAU CÙNG ("1.234,56"), hoặc chỉ có ĐÚNG 1 dấu phẩy và
    // theo sau là 1-2 chữ số ("45,5", "12,50"). Mọi dạng ngàn quen thuộc ("1,234,567", "1,234",
    // "1.234.567", "+1,200") đọc như cũ.
    const hasDot = cleaned.includes('.');
    const commaCount = (cleaned.match(/,/g) || []).length;
    const decimalComma = (hasDot && commaCount > 0 && cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.'))
        || (!hasDot && commaCount === 1 && /,\d{1,2}$/.test(cleaned));
    if (decimalComma) {
        cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
        cleaned = cleaned.replace(/,/g, '');
        // Xử lý dấu chấm ngàn (chuẩn VN): nếu có chấm phân cách phần ngàn
        // "0.125" / "-0.125" là thập phân — phần nguyên 0 không bao giờ có dấu nghìn (AUD-009, 2026-10-28: trước đọc thành 125).
        if (cleaned.indexOf('.') !== cleaned.lastIndexOf('.') || (/\.\d{3}($|\.)/.test(cleaned) && !/^-?0\./.test(cleaned))) {
            cleaned = cleaned.replace(/\./g, '');
        }
    }

    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
};

/**
 * Kiểm tra 1 giá trị catch (error: unknown) có phải AbortError không (VD: user huỷ
 * navigator.share()). Không dùng `instanceof Error` vì DOMException (loại lỗi thật của
 * navigator.share()/AbortController) không kế thừa từ Error trong TS lib.dom.
 */
export function isAbortError(error: unknown): boolean {
    return typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'AbortError';
}

/**
 * Safari iOS chỉ cho `navigator.share()` trong ~1s sau thao tác chạm. Dựng ảnh lâu hơn thế thì bị
 * từ chối với `NotAllowedError` — KHÔNG phải người dùng huỷ, mà là hết "hiệu lực chạm".
 */
export function isNotAllowedError(error: unknown): boolean {
    return typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'NotAllowedError';
}

/** Thiết bị di động/cảm ứng, kể cả iPad đời mới (iPadOS 13+ tự báo UA là "Macintosh"). */
export function isMobileLikeDevice(): boolean {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent || '';
    if (/Mobi|Android|iPhone|iPad|iPod/i.test(ua)) return true;
    if (/Macintosh/.test(ua) && (navigator.maxTouchPoints || 0) > 1) return true;
    return typeof window !== 'undefined' && window.innerWidth < 768;
}

/** Trần diện tích canvas của Safari iOS là 16.777.216 px (4096²); để dư một chút cho an toàn. */
export const IOS_MAX_CANVAS_AREA = 16_000_000;

/**
 * Giảm `pixelRatio` để canvas `width×height×ratio²` không vượt `maxArea`. Vượt trần, Safari iOS
 * không báo lỗi mà trả ảnh TRẮNG hoặc blob rỗng. Cho phép < 1 (ảnh hơi mờ vẫn hơn ảnh trắng).
 */
export function capPixelRatioForArea(width: number, height: number, ratio: number, maxArea = IOS_MAX_CANVAS_AREA): number {
    if (!(width > 0) || !(height > 0) || !(ratio > 0)) return ratio;
    const maxRatio = Math.sqrt(maxArea / (width * height));
    return Math.min(ratio, Math.floor(maxRatio * 1000) / 1000);
}
