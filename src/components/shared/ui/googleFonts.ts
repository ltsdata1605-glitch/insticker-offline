/**
 * Bản web nạp phông từ Google theo nhu cầu. App offline đóng gói sẵn các họ này trong
 * public/fonts/google (xem scripts/sao-chep-phong.mjs), index.html nạp qua /fonts/google-fonts.css.
 * Giữ nguyên tên export để code gọi chúng không phải đổi.
 */
const HO_PHONG = ['Roboto Condensed', 'Inter', 'Plus Jakarta Sans', 'Oswald', 'Fjalla One', 'Jost', 'Josefin Sans'];

export const PHONG_GOOGLE: readonly string[] = HO_PHONG;

export function tenHoPhong(fontFamily: string): string {
    return fontFamily.split(',')[0].replace(/["']/g, '').trim();
}

export function laPhongGoogle(fontFamily: string): boolean {
    return HO_PHONG.includes(tenHoPhong(fontFamily));
}

export function urlPhongGoogle(_hoPhong: readonly string[]): string {
    return '';
}

export function napPhongGoogle(_hoPhong: string | readonly string[]): void {
    // Phông đã có sẵn trong app.
}
