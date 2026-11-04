// Chép từ utils/dataUtils.ts của dashboard (commit 37ee99b): chỉ các hàm In Sticker cần.

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
